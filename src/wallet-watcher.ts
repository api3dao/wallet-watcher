import { BigNumber, ethers, Wallet } from 'ethers';
import { uniqBy } from 'lodash';
import { NonceManager } from '@ethersproject/experimental';
import { parseEther } from 'ethers/lib/utils';
import { OperationsRepository } from '@api3/operations';
import { go } from '@api3/airnode-utilities';
import { PROTOCOL_ID_PSP } from '@api3/operations/dist/utils/evm';
import { evm as nodeEvm } from '@api3/airnode-node';
import { evm, opsGenie, promises, logging, GlobalSponsor } from '@api3/operations-utilities';
import { API3_XPUB } from './constants';
import { ExtendedWalletWithMetadata, WalletStatus, WalletConfig } from './types';

/**
 * Notes
 *
 * A WALLET_ENABLE_SEND_FUNDS env must be set to any value in production to enable actual wallet top-ups.
 */

/**
 * Returns a provider instance based on wallet config and a chain name
 * @param walletConfig the result of parsing walletConfig.json
 * @param chainName the name of the chain
 */
export const getProvider = async (walletConfig: WalletConfig, chainName: string) => {
  const chainId = evm.resolveChainId(chainName);
  if (!chainId) {
    await opsGenie.sendToOpsGenieLowLevel(
      {
        message: 'Invalid chain name',
        alias: `invalid-chain-name-${chainName}`,
        description: `Check that the chains specified in the ops repository and in config/walletConfig.json match`,
        priority: 'P3',
      },
      walletConfig.opsGenieConfig
    );
    return;
  }

  await opsGenie.closeOpsGenieAlertWithAlias(`invalid-chain-name-${chainName}`, walletConfig.opsGenieConfig);

  if (!walletConfig.chains[chainId]) {
    await opsGenie.sendToOpsGenieLowLevel(
      {
        message: `No provider found for chain id ${chainId} (${chainName})`,
        alias: `no-provider-found-${chainId}`,
        description: `No provider found for this chain ID, please check the config/walletConfig.json file`,
        priority: 'P2',
      },
      walletConfig.opsGenieConfig
    );
    return;
  }

  await opsGenie.closeOpsGenieAlertWithAlias(`no-provider-found-${chainId}`, walletConfig.opsGenieConfig);

  return new ethers.providers.StaticJsonRpcProvider(walletConfig.chains[chainId].rpc, {
    chainId: parseInt(chainId!),
    name: chainName,
  });
};

/**
 * Derives a sponsor wallet address
 *
 * Note/TODO: this may have to expose protocol ID as "2nd party" may be a different protocol ID
 *
 * @param sponsor
 * @param xpub
 */
const derivePspAddress = (sponsor: string, xpub: string) => {
  const airnodeHdNode = ethers.utils.HDNode.fromExtendedKey(xpub);
  return airnodeHdNode.derivePath(nodeEvm.deriveWalletPathFromSponsorAddress(sponsor, PROTOCOL_ID_PSP)).address;
};

const determineWalletAddress = (wallet: ExtendedWalletWithMetadata, sponsor: string) => {
  switch (wallet.walletType) {
    case 'API3':
    case 'Provider':
      return { ...wallet, address: wallet.address! };
    case 'API3-Sponsor':
      return { ...wallet, address: derivePspAddress(sponsor, API3_XPUB) };
    case 'Provider-Sponsor':
      return { ...wallet, address: derivePspAddress(sponsor, wallet.providerXpub) };
  }
};

/**
 * Calculates and deduplicates all sponsor wallets from ops and populates the resulting wallets with the balances.
 *
 * @param walletConfig parsed walletConfig
 * @param operations the parsed operations repository
 */
const getWalletsAndBalances = async (walletConfig: WalletConfig, operations: OperationsRepository) => {
  const duplicatedWallets = Object.entries(operations.apis)
    .flatMap(([_apiName, api]) =>
      Object.entries(api.beacons).flatMap(([_beaconName, beaconValue]) =>
        Object.entries(beaconValue.chains).flatMap(([chainName, chain]) =>
          chain.topUpWallets.flatMap((wallet) => ({
            ...wallet,
            chainName,
            providerXpub: api.apiMetadata.xpub,
            api3Xpub: chain.sponsor,
            sponsor: chain.sponsor,
          }))
        )
      )
    )
    .map((wallet) => determineWalletAddress(wallet, wallet.sponsor));

  // There must be a chain in ops for this
  const walletsToAssess = uniqBy(duplicatedWallets, (item) => `${item.address}${item.chainName}`).filter((wallet) =>
    Object.values(operations.chains).find((chain) => chain.name === wallet.chainName)
  );

  const walletPromises = walletsToAssess.map(async (wallet) => {
    const provider = await getProvider(walletConfig, wallet.chainName);
    if (!provider) throw new Error(`Unable to initialize provider for chain (${wallet.chainName})`);

    const balance = await provider.getBalance(wallet.address);
    return {
      address: wallet.address,
      walletType: wallet.walletType,
      chainName: wallet.chainName,
      balance,
    };
  });

  const walletBalances = await Promise.allSettled(walletPromises);

  return walletBalances.reduce((acc: WalletStatus[], settledPromise: PromiseSettledResult<WalletStatus>) => {
    if (settledPromise.status === 'rejected') {
      logging.log(`Failed to get wallet balance.`, 'ERROR', `Error: ${settledPromise.reason.message}.`);
      return acc;
    }

    return [...acc, settledPromise.value];
  }, []);
};

/**
 * Takes a list of wallets with their embedded balances, compares the balance to configured minimums and executes top
 * up transactions if low balance criteria are met.
 *
 * @param wallet a wallet object containing a wallet address and balance
 * @param walletConfig parsed walletConfig
 * @param globalSponsors a set of wallets used as the source of funds for top-ups. Different wallets represent funds on different chains.
 */
const checkAndFundWallet = async (
  wallet: WalletStatus,
  walletConfig: WalletConfig,
  globalSponsors: GlobalSponsor[]
) => {
  try {
    const chainId = evm.resolveChainId(wallet.chainName);
    const globalSponsor = globalSponsors.find((sponsor) => sponsor.chainId === chainId);

    // Close previous cycle alerts
    await opsGenie.closeOpsGenieAlertWithAlias(
      `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
      walletConfig.opsGenieConfig
    );

    if (!globalSponsor) {
      await opsGenie.sendToOpsGenieLowLevel(
        {
          message: `Can't find a valid global sponsor for ${wallet.address} on ${wallet.chainName}`,
          alias: `no-sponsor-${wallet.address}-${wallet.chainName}`,
          priority: 'P1',
        },
        walletConfig.opsGenieConfig
      );
      return;
    }

    await opsGenie.closeOpsGenieAlertWithAlias(
      `no-sponsor-${wallet.address}-${wallet.chainName}`,
      walletConfig.opsGenieConfig
    );

    if (!(globalSponsor.lowBalance && globalSponsor.topUpAmount && globalSponsor.globalSponsorLowBalanceWarn)) {
      logging.debugLog(
        `Wallet configuration for chain (${wallet.chainName}) missing lowBalance, topUpAmount or globalSponsorLowBalanceWarn. Skipping threshold check.`
      );
      return;
    }

    const threshold = parseEther(globalSponsor.lowBalance);
    if (wallet.balance.gt(threshold)) {
      return;
    }

    if ((await globalSponsor.sponsor.getBalance()).lt(threshold)) {
      await opsGenie.sendToOpsGenieLowLevel(
        {
          message: `Low balance on primary top-up sponsor for chain ${wallet.chainName}`,
          alias: `low-master-sponsor-balance-${wallet.chainName}`,
          priority: 'P3',
        },
        walletConfig.opsGenieConfig
      );
    }
    await opsGenie.closeOpsGenieAlertWithAlias(
      `low-master-sponsor-balance-${wallet.chainName}`,
      walletConfig.opsGenieConfig
    );

    const gasOptions = await getGas(globalSponsor);

    if (!process.env.WALLET_ENABLE_SEND_FUNDS) {
      await opsGenie.sendToOpsGenieLowLevel(
        {
          message: `(would have) Just topped up ${wallet.address} on ${wallet.chainName}`,
          alias: `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
          description: [
            `DID NOT ACTUALLY SEND FUNDS! WALLET_ENABLE_SEND_FUNDS is not set`,
            `Type of wallet: ${wallet.walletType}`,
            `Address: ${evm.resolveExplorerUrlByName(walletConfig.explorerUrls, wallet.chainName)}address/${
              wallet.address
            } )`,
            `Transaction: ${evm.resolveExplorerUrlByName(
              walletConfig.explorerUrls,
              wallet.chainName
            )}tx/not-applicable`,
          ].join('\n'),
          priority: 'P5',
        },
        walletConfig.opsGenieConfig
      );

      await opsGenie.closeOpsGenieAlertWithAlias(
        `error-while-topping-up-wallet-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );

      return;
    }

    const receipt = await globalSponsor.sponsor.sendTransaction({
      to: wallet.address,
      value: parseEther(globalSponsor.topUpAmount),
      gasPrice: gasOptions?.gasPrice,
    });
    await receipt.wait(1);

    await opsGenie.sendToOpsGenieLowLevel(
      {
        message: `Just topped up ${wallet.address} on ${wallet.chainName}`,
        alias: `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
        description: [
          `Type of wallet: ${wallet.walletType}`,
          `Address: ${evm.resolveExplorerUrlByName(walletConfig.explorerUrls, wallet.chainName)}address/${
            wallet.address
          } )`,
          `Transaction: ${evm.resolveExplorerUrlByName(walletConfig.explorerUrls, wallet.chainName)}tx/${
            receipt?.hash ?? 'WALLET_ENABLE_SEND_FUNDS disabled'
          }`,
        ].join('\n'),
        priority: 'P5',
      },
      walletConfig.opsGenieConfig
    );

    await opsGenie.closeOpsGenieAlertWithAlias(
      `error-while-topping-up-wallet-${wallet.address}-${wallet.chainName}`,
      walletConfig.opsGenieConfig
    );
  } catch (e) {
    await opsGenie.sendToOpsGenieLowLevel(
      {
        message: 'An error occurred while trying to up up a wallet',
        alias: `error-while-topping-up-wallet-${wallet.address}-${wallet.chainName}`,
        priority: 'P1',
        description: `Error: ${e}
      Stack Trace: ${(e as Error)?.stack}`,
      },
      walletConfig.opsGenieConfig
    );

    return;
  }
};

/**
 * Get the gas pricing to be used for a chain.
 * The idea is that a globalSponsor should have gas pricing overrides embedded in it from the config file
 *
 * @param globalSponsor an object representing a unique chain/wallet pair with associated gas pricing directives
 */
export const getGas = async (globalSponsor: GlobalSponsor) => {
  if (!globalSponsor.options) {
    return undefined;
  }

  if (globalSponsor.options.txType === 'legacy') {
    const [err, reportedGasPrice] = await go(() => globalSponsor.sponsor.getGasPrice(), { timeoutMs: 5_000 });
    if (err || !reportedGasPrice) {
      logging.log(err ? err.message : 'Failed to fetch gas price.', 'ERROR', err ? err.stack : '');
      return undefined;
    }

    if (globalSponsor.options.legacyMultiplier) {
      return {
        gasPrice: reportedGasPrice.mul(BigNumber.from(globalSponsor.options.legacyMultiplier).mul(100)).div(100),
      };
    }

    return {
      gasPrice: reportedGasPrice,
    };
  }
};

/**
 * Returns an array of global sponsor wallets connected to their respective RPC providers
 *
 * @param walletConfig parsed walletConfig
 */
export const getGlobalSponsors = (walletConfig: WalletConfig) =>
  Object.entries(walletConfig.chains).reduce((acc: GlobalSponsor[], [chainId, chain]) => {
    if (!(chain.globalSponsorLowBalanceWarn && chain.lowBalance && chain.topUpAmount)) {
      logging.debugLog(
        `Wallet configuration for chain id ${chainId} missing lowBalance, topUpAmount or globalSponsorLowBalanceWarn. Skipping sponsor initialization.`
      );
      return acc;
    }

    const sponsor = new NonceManager(
      Wallet.fromMnemonic(walletConfig.topUpMnemonic).connect(
        new ethers.providers.StaticJsonRpcProvider(chain.rpc, {
          chainId: parseInt(chainId),
          name: chainId,
        })
      )
    );

    return [
      ...acc,
      {
        chainId,
        ...chain,
        sponsor,
      },
    ];
  }, []);

/**
 * Runs wallet watcher
 *
 * @param walletConfig parsed walletConfig
 * @param operations the parsed operations repository
 */
export const runWalletWatcher = async (walletConfig: WalletConfig, operations: OperationsRepository) => {
  const globalSponsors = getGlobalSponsors(walletConfig);
  const walletsAndBalances = await getWalletsAndBalances(walletConfig, operations);

  await promises.settleAndCheckForPromiseRejections(
    walletsAndBalances.map((wallet) => checkAndFundWallet(wallet, walletConfig, globalSponsors))
  );
};
