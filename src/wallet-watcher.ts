import { ethers } from 'ethers';
import { uniqBy } from 'lodash';
import { NonceManager } from '@ethersproject/experimental';
import { parseEther } from 'ethers/lib/utils';
import { getGasPrice } from '@api3/airnode-utilities';
import { evm as nodeEvm } from '@api3/airnode-node';
import { PROTOCOL_IDS, networks } from '@api3/airnode-protocol';
import { opsGenie, promises, logging, GlobalSponsor } from '@api3/operations-utilities';
import { API3_XPUB } from './constants';
import { Wallet, WalletStatus, Config, Wallets } from './types';

/**
 * Notes
 *
 * A WALLET_ENABLE_SEND_FUNDS env must be set to any value in production to enable actual wallet top-ups.
 */

/**
 *
 * Returns networks including names and chainIds
 */
export const getNetworks = () => networks;

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

export const determineWalletAddress = (wallet: Wallet, sponsor: string) => {
  switch (wallet.walletType) {
    case 'API3':
    case 'Provider':
      return { ...wallet, address: wallet.address! };
    // Replace destination addresses for derived PSP and Airseeker wallets
    case 'API3-Sponsor':
      return { ...wallet, address: deriveSponsorWalletAddress(sponsor, API3_XPUB, PROTOCOL_IDS.PSP) };
    case 'Provider-Sponsor':
      return { ...wallet, address: deriveSponsorWalletAddress(sponsor, wallet.providerXpub, PROTOCOL_IDS.PSP) };
    case 'Airseeker':
      return { ...wallet, address: deriveSponsorWalletAddress(sponsor, wallet.providerXpub, PROTOCOL_IDS.AIRSEEKER) };
  }
};

/**
 * Calculates and deduplicates all sponsor wallets from wallets.json and populates the resulting wallets with the balances.
 *
 * @param config parsed config.json
 * @param wallets parsed wallets.json
 */
export const getWalletsAndBalances = async (config: Config, wallets: Wallets) => {
  const networkMap = getNetworks();
  const walletsWithDerivedAddresses = Object.entries(wallets).flatMap(([chainId, wallets]) =>
    wallets.flatMap((wallet) => ({
      ...determineWalletAddress(wallet, wallet.sponsor),
      chainId,
      chainName: networkMap[chainId].name,
    }))
  );

  // There must be a chain in the config for this
  const walletsToAssess = uniqBy(walletsWithDerivedAddresses, (item) => `${item.address}${item.chainName}`).filter(
    (wallet) => Object.keys(config.chains).find((chainId) => chainId === wallet.chainId)
  );

  const walletPromises = walletsToAssess.map(async (wallet) => {
    const provider = getProvider(config.chains[wallet.chainId].rpc, wallet.chainName, wallet.chainId);
    if (!provider) throw new Error(`Unable to initialize provider for chain (${wallet.chainName})`);

    const balance = await provider.getBalance(wallet.address);
    if (!balance)
      throw new Error(`Unable to get balance for chain (${wallet.chainName}) and address (${wallet.address})`);
    return {
      ...wallet,
      balance,
      provider,
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
 * @param config parsed config.json
 * @param globalSponsors a set of wallets used as the source of funds for top-ups. Different wallets represent funds on different chains.
 */
export const checkAndFundWallet = async (wallet: WalletStatus, config: Config, globalSponsors: GlobalSponsor[]) => {
  try {
    const globalSponsor = globalSponsors.find((sponsor) => sponsor.chainId === wallet.chainId);

    // Close previous cycle alerts
    await opsGenie.closeOpsGenieAlertWithAlias(
      `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
      config.opsGenieConfig
    );

    if (!globalSponsor) {
      await opsGenie.sendToOpsGenieLowLevel(
        {
          message: `Can't find a valid global sponsor for ${wallet.address} on ${wallet.chainName}`,
          alias: `no-sponsor-${wallet.address}-${wallet.chainName}`,
          priority: 'P1',
        },
        config.opsGenieConfig
      );
      return;
    }

    await opsGenie.closeOpsGenieAlertWithAlias(
      `no-sponsor-${wallet.address}-${wallet.chainName}`,
      config.opsGenieConfig
    );

    if (!(globalSponsor.lowBalance && globalSponsor.topUpAmount && globalSponsor.globalSponsorLowBalanceWarn)) {
      logging.debugLog(
        `Wallet configuration for chain (${wallet.chainName}) missing lowBalance, topUpAmount or globalSponsorLowBalanceWarn. Skipping threshold check.`
      );
      return;
    }

    const walletBalanceThreshold = parseEther(globalSponsor.lowBalance);
    if (wallet.balance.gt(walletBalanceThreshold)) {
      return;
    }

    const globalSponsorBalanceThreshold = parseEther(globalSponsor.globalSponsorLowBalanceWarn);
    if ((await globalSponsor.sponsor.getBalance()).lt(globalSponsorBalanceThreshold)) {
      await opsGenie.sendToOpsGenieLowLevel(
        {
          message: `Low balance on primary top-up sponsor for chain ${wallet.chainName}`,
          alias: `low-master-sponsor-balance-${wallet.chainName}`,
          priority: 'P3',
        },
        config.opsGenieConfig
      );
    } else {
      await opsGenie.closeOpsGenieAlertWithAlias(
        `low-master-sponsor-balance-${wallet.chainName}`,
        config.opsGenieConfig
      );
    }

    const [logs, gasTarget] = await getGasPrice(wallet.provider, config.chains[wallet.chainId].options);
    logs.forEach((log) =>
      logging.log(log.message, log.level === 'INFO' || log.level === 'ERROR' ? log.level : undefined)
    );

    const { gasLimit: _gasLimit, ...restGasTarget } = gasTarget;

    if (!process.env.WALLET_ENABLE_SEND_FUNDS) {
      await opsGenie.sendToOpsGenieLowLevel(
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

      await opsGenie.closeOpsGenieAlertWithAlias(
        `error-while-topping-up-wallet-${wallet.address}-${wallet.chainName}`,
        config.opsGenieConfig
      );

      return;
    }

    const receipt = await globalSponsor.sponsor.sendTransaction({
      to: wallet.address,
      value: parseEther(globalSponsor.topUpAmount),
      ...restGasTarget,
    });
    await receipt.wait(1);

    await opsGenie.sendToOpsGenieLowLevel(
      {
        message: `Just topped up ${wallet.address} on ${wallet.chainName}`,
        alias: `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
        description: [
          `Type of wallet: ${wallet.walletType}`,
          `Address: ${config.explorerUrls[wallet.chainId]}address/${wallet.address} )`,
          `Transaction: ${config.explorerUrls[wallet.chainId]}tx/${
            receipt?.hash ?? 'WALLET_ENABLE_SEND_FUNDS disabled'
          }`,
        ].join('\n'),
        priority: 'P5',
      },
      config.opsGenieConfig
    );

    await opsGenie.closeOpsGenieAlertWithAlias(
      `error-while-topping-up-wallet-${wallet.address}-${wallet.chainName}`,
      config.opsGenieConfig
    );
  } catch (e) {
    await opsGenie.sendToOpsGenieLowLevel(
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
 * Returns an array of global sponsor wallets connected to their respective RPC providers
 *
 * @param config parsed config
 */
export const getGlobalSponsors = (config: Config) =>
  Object.entries(config.chains).reduce((acc: GlobalSponsor[], [chainId, chain]) => {
    if (!(chain.globalSponsorLowBalanceWarn && chain.lowBalance && chain.topUpAmount)) {
      logging.debugLog(
        `Wallet configuration for chain id ${chainId} missing lowBalance, topUpAmount or globalSponsorLowBalanceWarn. Skipping sponsor initialization.`
      );
      return acc;
    }

    const sponsor = new NonceManager(
      ethers.Wallet.fromMnemonic(config.topUpMnemonic).connect(
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
 * @param config parsed config.json
 * @param wallets parsed wallets.json
 */
export const runWalletWatcher = async (config: Config, wallets: Wallets) => {
  const globalSponsors = getGlobalSponsors(config);
  const walletsAndBalances = await getWalletsAndBalances(config, wallets);

  await promises.settleAndCheckForPromiseRejections(
    walletsAndBalances.map((wallet) => checkAndFundWallet(wallet, config, globalSponsors))
  );
};
