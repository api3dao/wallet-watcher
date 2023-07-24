import { evm as nodeEvm } from '@api3/airnode-node';
import { PROTOCOL_IDS } from '@api3/airnode-protocol';
import { CHAINS } from '@api3/chains';
import { getOpsGenieLimiter, log } from '@api3/operations-utilities';
import { go } from '@api3/promise-utils';
import { ethers } from 'ethers';
import { isNil, uniqBy } from 'lodash';
import { API3_XPUB } from './constants';
import { ChainStates, ChainsConfig, Config, Wallet, Wallets } from './types';

const { limitedSendToOpsGenieLowLevel, limitedCloseOpsGenieAlertWithAlias } = getOpsGenieLimiter();

/**
 * Gets the chain name from @api3/chains for the provided chain id
 *
 * @param chainId the chain id
 * @returns the chain name
 */
export const getChainName = (chainId: string) => CHAINS.find(({ id }) => id === chainId)?.name;

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
 * Extends each chain object read from config.json with the chain name and an ethers.provider object
 *
 * @param chains array of chain objects read from config.json
 * @returns the original chain object plus the chain name and an ethers.js provider object to interact with the blockchain
 */
export const initializeChainStates = (chains: ChainsConfig) => {
  return Object.entries(chains).reduce((acc: ChainStates, [chainId, chain]) => {
    const chainName = getChainName(chainId) ?? chainId;
    const provider = getProvider(chain.rpc, chainName, chainId);

    return {
      ...acc,
      [chainId]: {
        ...chain,
        chainName,
        provider,
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
      return wallet;
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
 * Runs wallet watcher
 *
 * @param config parsed config.json
 * @param wallets parsed wallets.json
 */
export const runWalletWatcher = async ({ chains, ...config }: Config, wallets: Wallets) => {
  // Initialize each chain by adding its name and an ethers.js provider object
  const chainStates = initializeChainStates(chains);

  // Sets or overrides address field with derived sponsor wallet address if walletType is not API nor Provider
  const walletsWithDerivedAddresses = Object.entries(wallets).flatMap(([chainId, wallets]) => {
    return wallets.flatMap((wallet) => ({
      ...determineWalletAddress(wallet),
      chainId,
    }));
  });

  // Unique wallets with highest lowThreshold by address and chainId
  const uniqueWalletsPerChain = uniqBy(
    [...walletsWithDerivedAddresses].sort((a, b) => b.lowThreshold.value - a.lowThreshold.value),
    (item) => `${item.address}${item.chainId}`
  );

  // Filter out wallets that do not have a matching chain object defined in config.json
  const walletsToAssess = uniqueWalletsPerChain.filter((wallet) => !isNil(chainStates[wallet.chainId]));

  // Check balances for each wallet
  const walletBalances = await Promise.allSettled(
    walletsToAssess.map(async (wallet) => {
      const opsGenieAliasSuffix = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(`${wallet.address}${wallet.chainId}`)
      );

      const chainState = chainStates[wallet.chainId];
      const getBalanceResult = await go(() => chainState.provider.getBalance(wallet.address), {
        totalTimeoutMs: 15_000,
        retries: 2,
        delay: { type: 'static', delayMs: 4_900 },
        onAttemptError: ({ error }) => log(error.message),
      });

      if (!getBalanceResult.success) {
        const message = `Unable to get balance for address ${wallet.address} on chain ${chainState.chainName}`;
        await limitedSendToOpsGenieLowLevel(
          {
            priority: 'P2',
            alias: `get-balance-error-${opsGenieAliasSuffix}`,
            message,
            description: `${getBalanceResult.error.message}\n${getBalanceResult.error.stack}`,
          },
          config.opsGenieConfig
        );
        throw new Error(message);
      } else {
        limitedCloseOpsGenieAlertWithAlias(`get-balance-error-${opsGenieAliasSuffix}`);
      }

      const balance = getBalanceResult.data;

      // Send alert if balance is equal or below threshold
      const balanceThreshold = ethers.utils.parseUnits(wallet.lowThreshold.value.toString(), wallet.lowThreshold.unit);
      if (balance.lte(balanceThreshold)) {
        if (wallet.lowThreshold.criticalValue) {
          // Send emergency alert if balance is even below a critical percentage
          const criticalBalanceThreshold = ethers.utils.parseUnits(
            wallet.lowThreshold.criticalValue.toString(),
            wallet.lowThreshold.unit
          );
          if (balance.lte(criticalBalanceThreshold)) {
            const criticalMessage = `Critical low balance alert for address ${wallet.address} on chain ${chainState.chainName}`;
            await limitedSendToOpsGenieLowLevel(
              {
                priority: 'P1',
                alias: `critical-low-balance-${opsGenieAliasSuffix}`,
                message: criticalMessage,
                description: `Current balance: ${balance.toString()}\nThreshold: ${balanceThreshold.toString()}\nCritical threshold: ${criticalBalanceThreshold.toString()}`,
              },
              config.opsGenieConfig
            );
            return;
          } else {
            limitedCloseOpsGenieAlertWithAlias(`critical-low-balance-${opsGenieAliasSuffix}`);
          }
        }

        const message = `Low balance alert for address ${wallet.address} on chain ${chainState.chainName}`;
        await limitedSendToOpsGenieLowLevel(
          {
            priority: 'P2',
            alias: `low-balance-${opsGenieAliasSuffix}`,
            message,
            description: `Current balance: ${balance.toString()}\nThreshold: ${balanceThreshold.toString()}`,
          },
          config.opsGenieConfig
        );
      } else {
        limitedCloseOpsGenieAlertWithAlias(`low-balance-${opsGenieAliasSuffix}`);
      }
    })
  );

  // Log any errors and return wallets with a balance
  walletBalances.forEach(async (settledPromise) => {
    if (settledPromise.status === 'rejected') {
      log('Failed to check wallet balance', 'ERROR', `Error: ${settledPromise.reason.message}`);
    }
  });
};
