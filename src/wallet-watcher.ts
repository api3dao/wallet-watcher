import { evm as nodeEvm } from '@api3/airnode-node';
import { PROTOCOL_IDS } from '@api3/airnode-protocol';
import { getGasPrice } from '@api3/airnode-utilities';
import { CHAINS } from '@api3/chains';
import {
  closeOpsGenieAlertWithAlias,
  log,
  sendToOpsGenieLowLevel,
  settleAndCheckForPromiseRejections,
} from '@api3/operations-utilities';
import { go } from '@api3/promise-utils';
import { NonceManager } from '@ethersproject/experimental';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { ethers } from 'ethers';
import { groupBy, isEmpty, isNil, uniqBy } from 'lodash';
import { API3_XPUB } from './constants';
import { ChainState, ChainStates, ChainsConfig, Config, Wallet, WalletStatus, Wallets } from './types';

const funderAbi = [
  'event DeployedFunderDepository(address indexed funderDepository, address owner, bytes32 root)',
  'event Funded(address indexed funderDepository, address recipient, uint256 amount)',
  'event Withdrew(address indexed funderDepository, address recipient, uint256 amount)',
  'function computeFunderDepositoryAddress(address owner, bytes32 root) view returns (address funderDepository)',
  'function deployFunderDepository(address owner, bytes32 root) returns (address funderDepository)',
  'function fund(address owner, bytes32 root, bytes32[] proof, address recipient, uint256 lowThreshold, uint256 highThreshold)',
  'function multicall(bytes[] data) returns (bytes[] returndata)',
  'function ownerToRootToFunderDepositoryAddress(address, bytes32) view returns (address)',
  'function tryMulticall(bytes[] data) returns (bool[] successes, bytes[] returndata)',
  'function withdraw(bytes32 root, address recipient, uint256 amount)',
  'function withdrawAll(bytes32 root, address recipient)',
];

/**
 * Notes
 *
 * A WALLET_ENABLE_SEND_FUNDS env must be set to any value in production to enable actual wallet top-ups.
 */

/**
 * Gets the chain name from @api3/chains for the provided chain id
 *
 * @param chainId the chain id
 * @returns the chain name
 */
const getChainName = (chainId: string) => CHAINS.find(({ id }) => id === chainId)?.name;

/**
 * Returns a provider instance based on wallet config and a chain name
 * @param url the provider url
 * @param chainName the name of the chain
 * @param chainId the id of the chain
 */
export const getProvider = (url: string, chainName: string, chainId: string) =>
  new ethers.providers.StaticJsonRpcProvider(url, {
    chainId: parseInt(chainId),
    name: chainName,
  });

/**
 * Adds an ethers.Wallet instance that will be used on each chain to send a wallet
 * top up transaction to the Funder contract. It also adds an ethers.Contract
 * object for the mentioned Funder contract. If transactions sent to this contract
 * need to change the state of the blockchain then it is required to connect this
 * object to a valid ethers.Signer object. Lastly it adds the JSON RPC provider
 * object as well to each chain object read from config.json
 *
 * @param chains array of chain objects read from config.json
 * @returns the original chains object from config.json plus ethers.js objects to
 * interact with the blockchain (provider, wallet and contract)
 */
export const intializeChainStates = (chains: ChainsConfig) => {
  // TODO: making an assumption here that we will use same PK on all chains
  const topUpWalletPrivateKey = process.env.TOP_UP_WALLET_PRIVATE_KEY;
  if (!topUpWalletPrivateKey) {
    throw new Error('TOP_UP_WALLET_PRIVATE_KEY environment variable is not set');
  }
  return Object.entries(chains).reduce((acc: ChainStates, [chainId, chain]) => {
    const chainName = getChainName(chainId) ?? chainId;
    const provider = getProvider(chain.rpc, chainName, chainId);

    return {
      ...acc,
      [chainId]: {
        ...chain,
        chainId,
        chainName,
        provider,
        topUpWallet: new NonceManager(new ethers.Wallet(topUpWalletPrivateKey, provider)),
        funderContract: new ethers.Contract(chain.funderAddress, funderAbi, provider),
      },
    };
  }, {});
};

/**
 * Derives a sponsor wallet address
 *
 * @param sponsor
 * @param xpub
 * @param protocolId
 */
export const deriveSponsorWalletAddress = (sponsor: string, xpub: string, protocolId: string) => {
  const airnodeHdNode = ethers.utils.HDNode.fromExtendedKey(xpub);
  return airnodeHdNode.derivePath(nodeEvm.deriveWalletPathFromSponsorAddress(sponsor, protocolId)).address;
};

/**
 * Sets or overrides the wallet.address field based on the walletType
 *
 * @param wallet parsed wallet object from wallets.json
 * @returns the original wallet object but it sets/overrides the address field with the derived sponsor wallet if walletType is not API nor Provider
 */
export const determineWalletAddress = (wallet: Wallet) => {
  switch (wallet.walletType) {
    case 'API3':
    case 'Provider':
      return { ...wallet, address: wallet.address! }; // TODO: this seems unnecessary...wouldn't it be the same to just return the wallet object?
    // Replace destination addresses for derived PSP and Airseeker wallets
    case 'API3-Sponsor':
      return { ...wallet, address: deriveSponsorWalletAddress(wallet.sponsor, API3_XPUB, PROTOCOL_IDS.PSP) };
    case 'Provider-Sponsor':
      return { ...wallet, address: deriveSponsorWalletAddress(wallet.sponsor, wallet.providerXpub, PROTOCOL_IDS.PSP) };
    case 'Airseeker':
      return {
        ...wallet,
        address: deriveSponsorWalletAddress(wallet.sponsor, wallet.providerXpub, PROTOCOL_IDS.AIRSEEKER),
      };
  }
};

/**
 * Calculates and deduplicates all wallets from wallets.json and populates the
 * resulting wallets with the balances
 *
 * @param chainStates array of augmented chain objects from config.json
 * @param wallets parsed wallets.json
 */
export const getWalletsAndBalances = async (chainStates: ChainStates, wallets: Wallets) => {
  // Sets or overrides address field with derived sponsor wallet address if walletType is not API nor Provider
  const walletsWithDerivedAddresses = Object.entries(wallets).flatMap(([chainId, wallets]) => {
    return wallets.flatMap((wallet) => ({
      ...determineWalletAddress(wallet),
      chainId,
    }));
  });

  // Unique wallets by address and chainId
  const uniqueWalletsPerChain = uniqBy(walletsWithDerivedAddresses, (item) => `${item.address}${item.chainId}`);

  // Filter out wallets that do not have a matching chain object defined in config.json
  const walletsToAssess = uniqueWalletsPerChain.filter((wallet) => !isNil(chainStates[wallet.chainId]));

  // Fetch balances for each wallet
  const walletPromises = walletsToAssess.map(async (wallet) => {
    const chainState = chainStates[wallet.chainId];
    const balance = await chainState.provider.getBalance(wallet.address);
    if (!balance)
      throw new Error(`Unable to get balance for chain ${chainState.chainName} and address ${wallet.address}`);
    return {
      ...wallet,
      balance,
    };
  });

  const walletBalances = await Promise.allSettled(walletPromises);

  // Log any errors and return wallets with a balance
  return walletBalances.reduce((acc: WalletStatus[], settledPromise: PromiseSettledResult<WalletStatus>) => {
    if (settledPromise.status === 'rejected') {
      log(`Failed to get wallet balance.`, 'ERROR', `Error: ${settledPromise.reason.message}.`);
      return acc;
    }

    return [...acc, settledPromise.value];
  }, []);
};

/**
 * Builds a Merkle tree using wallet addresses, lowBalances and topUpAmounts as leaves
 *
 * @param wallets an array of wallets
 * @returns the merkle tree
 */
export const buildMerkleTree = (wallets: WalletStatus[]) => {
  const tree = StandardMerkleTree.of(
    wallets.map(({ address, lowBalance, topUpAmount }) => {
      return [address, ethers.utils.parseEther(lowBalance), ethers.utils.parseEther(topUpAmount)];
    }),
    ['address', 'uint256', 'uint256']
  );
  // console.log('Merkle Root:', tree.root);
  // console.log('Merkle Dump:', tree.dump());
  // console.log('Merkle Render:', tree.render());
  // for (const [i, v] of tree.entries()) {
  //   console.log('value:', v);
  //   console.log('proof:', tree.getProof(i));
  // }
  return tree;
};

/**
 * Checks the wallet balance against configured thresholds and if the balance is below the threshold
 * then it returns the ABI encoded calldata with all the parameters required to fund the wallet
 *
 * @param config parsed config.json
 * @param wallet a wallet object containing a wallet address and balance
 * @param chainState a chain object containing provider, top up wallet and Funder contract instances
 * @param merkleTree a merkle tree object containing the wallet addresses, lowBalances and topUpAmounts as leaves
 * @returns the ABI encoded calldata for the Funder contract to fund the wallet
 */
export const checkAndReturnCalldata = async (
  config: Omit<Config, 'chains'>,
  wallet: WalletStatus,
  chainState: ChainState,
  merkleTree: StandardMerkleTree<(string | ethers.BigNumber)[]>
) => {
  const errorCheckingWalletAlias = `error-while-checking-wallet-${ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(`${wallet.address}-${wallet.chainId}`)
  )}`;
  try {
    await closeOpsGenieAlertWithAlias(errorCheckingWalletAlias, config.opsGenieConfig);

    // TODO: should we just filter out these sponsor wallets while fetching the balance?
    const walletBalanceThreshold = ethers.utils.parseEther(wallet.lowBalance);
    if (wallet.balance.gt(walletBalanceThreshold)) {
      // TODO: add some debug log message indicating that there is no need to call the Funder contract?
      return null;
    }

    // const leaf = merkleTree.leafHash([
    //   wallet.address,
    //   ethers.utils.parseEther(wallet.lowBalance),
    //   ethers.utils.parseEther(wallet.topUpAmount),
    // ]);
    // console.log('🚀 ~ file: wallet-watcher.ts:314 ~ leaf:', leaf);

    const proof = merkleTree.getProof([
      wallet.address,
      ethers.utils.parseEther(wallet.lowBalance),
      ethers.utils.parseEther(wallet.topUpAmount),
    ]);
    // console.log('🚀 ~ file: wallet-watcher.ts:309 ~ proof:', proof);

    return chainState.funderContract.interface.encodeFunctionData(
      'fund(address,bytes32,bytes32[],address,uint256,uint256)',
      [
        chainState.funderDepositoryOwner,
        merkleTree.root,
        proof,
        wallet.address,
        ethers.utils.parseEther(wallet.lowBalance),
        ethers.utils.parseEther(wallet.topUpAmount),
      ]
    );
  } catch (e) {
    await sendToOpsGenieLowLevel(
      {
        message: `An unexpected error occurred while trying to check if wallet ${wallet.address} on chain ${chainState.chainName} (id: ${chainState.chainId}) needs to be topped up`,
        alias: errorCheckingWalletAlias,
        priority: 'P1',
        description: `Error: ${e}\nStack Trace: ${(e as Error)?.stack}`,
      },
      config.opsGenieConfig
    );

    return null;
  }
};

/**
 *
 * @param config parsed config.json
 * @param chainState a chain object containing provider, top up wallet and Funder contract instances
 * @param wallets an array of wallet objects containing a wallet address and balance
 * @param merkleTree a merkle tree object containing the wallet addresses, lowBalances and topUpAmounts as leaves
 * @returns a promise that resolves when the top up transaction is sent or when no wallets need topping up
 */
const topUpWallets = async (
  config: Omit<Config, 'chains'>,
  chainState: ChainState,
  wallets: WalletStatus[],
  merkleTree: StandardMerkleTree<(string | ethers.BigNumber)[]>
) => {
  const topUpWalletBalanceThreshold = ethers.utils.parseEther(chainState.topUpWalletLowBalanceWarn);
  // TODO: what should we do if balance is 0 or even less than the gas cost of the tx?
  //       it seems reasonably that we should not even try sending the tx
  const topUpWalletAddress = await chainState.topUpWallet.getAddress();
  const lowBalanceTopUpWalletAlias = `low-top-up-balance-${ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(`${topUpWalletAddress}-${chainState.chainId}`)
  )}`;
  if ((await chainState.topUpWallet.getBalance()).lt(topUpWalletBalanceThreshold)) {
    await sendToOpsGenieLowLevel(
      {
        message: `Low balance on top-up wallet ${topUpWalletAddress} for chain ${chainState.chainName} (id: ${chainState.chainId})`,
        alias: lowBalanceTopUpWalletAlias,
        priority: 'P2',
      },
      config.opsGenieConfig
    );
  } else {
    await closeOpsGenieAlertWithAlias(lowBalanceTopUpWalletAlias, config.opsGenieConfig);
  }

  const calldatas = await wallets.reduce(async (promisedAcc: Promise<string[]>, wallet) => {
    const previous = await promisedAcc;

    const calldata = await checkAndReturnCalldata(config, wallet, chainState, merkleTree);
    if (isNil(calldata)) {
      return previous;
    }
    return [...previous, calldata];
  }, Promise.resolve([]));

  // console.log('🚀 ~ file: wallet-watcher.ts:351 ~ calldatas ~ calldatas:', chainState.chainId, calldatas);

  if (isEmpty(calldatas)) {
    // TODO: message required?
    return;
  }

  // Close previous cycle alerts
  const aliasSuffix = ethers.utils.toUtf8Bytes(`${calldatas.join('')}-${chainState.chainId}`);
  const toppedUpAlias = `freshly-topped-up-${ethers.utils.keccak256(aliasSuffix)}`;
  await closeOpsGenieAlertWithAlias(toppedUpAlias, config.opsGenieConfig);
  const errorSendingTxAlias = `error-while-sending-tx-${ethers.utils.keccak256(aliasSuffix)}`;
  await closeOpsGenieAlertWithAlias(errorSendingTxAlias, config.opsGenieConfig);

  const [logs, gasTarget] = await getGasPrice(chainState.provider, chainState.options);
  logs.forEach(({ level, message }) => log(message, level === 'INFO' || level === 'ERROR' ? level : undefined));

  const { gasLimit: _gasLimit, ...restGasTarget } = gasTarget;

  let txHash = 'not-applicable';
  if (process.env.WALLET_ENABLE_SEND_FUNDS && process.env.WALLET_ENABLE_SEND_FUNDS !== 'false') {
    const txResult = await go(
      () => chainState.funderContract.connect(chainState.topUpWallet.signer).tryMulticall(calldatas, restGasTarget),
      {
        totalTimeoutMs: 15000,
        retries: 2,
        delay: { type: 'static', delayMs: 5000 },
      }
    );
    // console.log('🚀 ~ file: wallet-watcher.ts:364 ~ Object.entries ~ txResult:', txResult);
    // TODO: check success etc
    if (txResult.error) {
      await sendToOpsGenieLowLevel(
        {
          message: `An unexpected error occurred while sending transaction on chain ${chainState.chainName} (id: ${chainState.chainId})`,
          alias: errorSendingTxAlias,
          priority: 'P1',
          description: `Error: ${txResult.error}\nStack Trace: ${txResult.error?.stack}`,
        },
        config.opsGenieConfig
      );
    }

    txHash = txResult.data.hash;
  }

  await sendToOpsGenieLowLevel(
    {
      message: `Just topped up wallet(s) on chain ${chainState.chainName} (id: ${chainState.chainId})`,
      alias: toppedUpAlias,
      description: [
        ...(process.env.WALLET_ENABLE_SEND_FUNDS
          ? ['*** Tx not sent because WALLET_ENABLE_SEND_FUNDS is false or undefined ***']
          : []),
        `Transaction: ${config.explorerUrls[chainState.chainId]}tx/${txHash}`,
        'Wallets: ',
        ...wallets.map((wallet) => {
          return [
            `\tWallet type: ${wallet.walletType}`,
            `\tAddress: ${config.explorerUrls[wallet.chainId]}address/${wallet.address} )`,
            `\tLow Balance: ${wallet.lowBalance}`,
            `\tTop Up Amount: ${wallet.topUpAmount}`,
          ];
        }),
      ].join('\n'),
      priority: 'P5',
    },
    config.opsGenieConfig
  );
};

/**
 * Runs wallet watcher
 *
 * @param config parsed config.json
 * @param wallets parsed wallets.json
 */
export const runWalletWatcher = async ({ chains, ...config }: Config, wallets: Wallets) => {
  const chainStates = intializeChainStates(chains);
  const walletsAndBalances = await getWalletsAndBalances(chainStates, wallets);
  const walletsByChainId = groupBy(walletsAndBalances, 'chainId');

  await settleAndCheckForPromiseRejections(
    Object.entries(walletsByChainId).map(async ([chainId, wallets]) => {
      const chainState = chainStates[chainId];
      const merkleTree = buildMerkleTree(wallets);

      await topUpWallets(config, chainState, wallets, merkleTree);
    })
  );
};
