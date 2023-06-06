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
import { NonceManager } from '@ethersproject/experimental';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { ethers } from 'ethers';
import { groupBy, isNil, uniqBy } from 'lodash';
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
    const provider = getProvider(chain.rpc, getChainName(chainId) ?? chainId, chainId);

    return {
      ...acc,
      [chainId]: {
        ...chain,
        chainId,
        provider,
        nonceMananger: new NonceManager(new ethers.Wallet(topUpWalletPrivateKey, provider)),
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
 * @returns the original wallet object but it sets/overrides the address field
 * with the derived sponsor wallet if walletType is not API nor Provider
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
    const chainName = getChainName(chainId) ?? chainId;
    return wallets.flatMap((wallet) => ({
      ...determineWalletAddress(wallet),
      chainId,
      chainName,
    }));
  });

  // Unique wallets by address and chainId
  const uniqueWalletsPerChain = uniqBy(walletsWithDerivedAddresses, (item) => `${item.address}${item.chainId}`);

  // Filter out wallets that do not have a matching chain object defined in config.json
  const walletsToAssess = uniqueWalletsPerChain.filter((wallet) => !isNil(chainStates[wallet.chainId]));

  // Fetch balances for each wallet
  const walletPromises = walletsToAssess.map(async (wallet) => {
    const balance = await chainStates[wallet.chainId].provider.getBalance(wallet.address);
    if (!balance) throw new Error(`Unable to get balance for chain ${wallet.chainName} and address ${wallet.address}`);
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
 * @param leaves // an array of wallets
 * @returns the merkle tree
 */
export const buildMerkleTree = (leaves: WalletStatus[]) => {
  const tree = StandardMerkleTree.of(
    leaves.map(({ address, lowBalance, topUpAmount }) => {
      return [address, ethers.utils.parseEther(lowBalance), ethers.utils.parseEther(topUpAmount)];
    }),
    ['address', 'uint256', 'uint256']
  );
  // console.log('Merkle Root:', tree.root);
  // console.log('Merkle Dump:', tree.dump());
  console.log('Merkle Render:', tree.render());
  // for (const [i, v] of tree.entries()) {
  //   console.log('value:', v);
  //   console.log('proof:', tree.getProof(i));
  // }
  return tree;
};

/**
 * Takes a list of wallets with their embedded balances, compares the balance to configured minimums and executes top
 * up transactions if low balance criteria is met.
 *
 * @param wallet a wallet object containing a wallet address and balance
 * @param config parsed config.json
 * @param topUpWallets a set of wallets used as the source of funds for top-ups. Different wallets represent funds on different chains.
 * @param funderContracts a list of funder contracts for each chain
 */
export const checkAndFundWallet = async (
  config: Omit<Config, 'chains'>,
  wallet: WalletStatus,
  chainState: ChainState,
  merkleTree: StandardMerkleTree<(string | ethers.BigNumber)[]>
) => {
  try {
    // Close previous cycle alerts
    await closeOpsGenieAlertWithAlias(`freshly-topped-up-${wallet.address}-${wallet.chainName}`, config.opsGenieConfig);

    const topUpWalletBalanceThreshold = ethers.utils.parseEther(chainState.topUpWalletLowBalanceWarn);
    if ((await chainState.nonceMananger.getBalance()).lt(topUpWalletBalanceThreshold)) {
      await sendToOpsGenieLowLevel(
        {
          message: `Low balance on top-up wallet for chain ${wallet.chainName}`,
          alias: `low-top-up-balance-${wallet.chainName}`,
          priority: 'P2',
        },
        config.opsGenieConfig
      );
    } else {
      await closeOpsGenieAlertWithAlias(`low-top-up-balance-${wallet.chainName}`, config.opsGenieConfig);
    }

    // TODO: should we just filter out these sponsor wallets while fetching the balance?
    const walletBalanceThreshold = ethers.utils.parseEther(wallet.lowBalance);
    console.log(
      '🚀 ~ file: wallet-watcher.ts:252 ~ wallet.balance.gt(walletBalanceThreshold):',
      wallet.balance.gt(walletBalanceThreshold)
    );
    if (wallet.balance.gt(walletBalanceThreshold)) {
      return;
    }

    if (!chainState.funderContract) {
      await sendToOpsGenieLowLevel(
        {
          message: `Can't find a valid Funder contract for ${wallet.address} on ${wallet.chainName}`,
          alias: `no-funder-contract-${wallet.address}-${wallet.chainName}`,
          priority: 'P1',
        },
        config.opsGenieConfig
      );
      return;
    }
    await closeOpsGenieAlertWithAlias(
      `no-funder-contract-${wallet.address}-${wallet.chainName}`,
      config.opsGenieConfig
    );

    const [logs, gasTarget] = await getGasPrice(chainState.provider, chainState.options);
    logs.forEach(({ level, message }) => log(message, level === 'INFO' || level === 'ERROR' ? level : undefined));

    const { gasLimit: _gasLimit /*...restGasTarget*/ } = gasTarget;

    if (!process.env.WALLET_ENABLE_SEND_FUNDS) {
      await sendToOpsGenieLowLevel(
        {
          message: `(would have) Just topped up ${wallet.address} on ${wallet.chainName}`,
          alias: `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
          description: [
            `DID NOT ACTUALLY SEND FUNDS! WALLET_ENABLE_SEND_FUNDS is not set`,
            `Type of wallet: ${wallet.walletType}`,
            `Address: ${config.explorerUrls[wallet.chainId]}address/${wallet.address} )`,
            `Transaction: ${config.explorerUrls[wallet.chainId]}tx/not-applicable`,
          ].join('\n'),
          priority: 'P5',
        },
        config.opsGenieConfig
      );

      await closeOpsGenieAlertWithAlias(
        `error-while-topping-up-wallet-${wallet.address}-${wallet.chainName}`,
        config.opsGenieConfig
      );

      return;
    }

    const leaf = merkleTree.leafHash([
      wallet.address,
      ethers.utils.parseEther(wallet.lowBalance),
      ethers.utils.parseEther(wallet.topUpAmount),
    ]);
    console.log('🚀 ~ file: wallet-watcher.ts:314 ~ leaf:', leaf);

    const proof = merkleTree.getProof([
      wallet.address,
      ethers.utils.parseEther(wallet.lowBalance),
      ethers.utils.parseEther(wallet.topUpAmount),
    ]);
    console.log('🚀 ~ file: wallet-watcher.ts:309 ~ proof:', proof);

    // // TODO: batched tryMulticall
    // const receipt = await chainState.funderContract.contract.fund(
    //   chainState.funderDepositoryOwner,
    //   merkleTree.root,
    //   proof,
    //   wallet.address,
    //   ethers.utils.parseEther(wallet.lowBalance),
    //   ethers.utils.parseEther(wallet.topUpAmount),
    //   {
    //     ...restGasTarget,
    //   }
    // );

    // // const receipt = await topUpWallet.nonceMananger.sendTransaction({
    // //   to: wallet.address,
    // //   value: parseEther(wallet.topUpAmount),
    // //   ...restGasTarget,
    // // });

    // await receipt.wait(1);

    // await sendToOpsGenieLowLevel(
    //   {
    //     message: `Just topped up ${wallet.address} on ${wallet.chainName}`,
    //     alias: `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
    //     description: [
    //       `Type of wallet: ${wallet.walletType}`,
    //       `Address: ${config.explorerUrls[wallet.chainId]}address/${wallet.address} )`,
    //       `Transaction: ${config.explorerUrls[wallet.chainId]}tx/${
    //         receipt?.hash ?? 'WALLET_ENABLE_SEND_FUNDS disabled'
    //       }`,
    //     ].join('\n'),
    //     priority: 'P5',
    //   },
    //   config.opsGenieConfig
    // );

    await closeOpsGenieAlertWithAlias(
      `error-while-topping-up-wallet-${wallet.address}-${wallet.chainName}`,
      config.opsGenieConfig
    );
  } catch (e) {
    await sendToOpsGenieLowLevel(
      {
        message: 'An error occurred while trying to up up a wallet',
        alias: `error-while-topping-up-wallet-${wallet.address}-${wallet.chainName}`,
        priority: 'P1',
        description: `Error: ${e}\nStack Trace: ${(e as Error)?.stack}`,
      },
      config.opsGenieConfig
    );

    return;
  }
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
    Object.entries(walletsByChainId).flatMap(([chainId, chainWallets]) => {
      const chainState = chainStates[chainId];
      const merkleTree = buildMerkleTree(chainWallets);

      return chainWallets.map((wallet) => checkAndFundWallet(config, wallet, chainState, merkleTree));
    })
  );
};
