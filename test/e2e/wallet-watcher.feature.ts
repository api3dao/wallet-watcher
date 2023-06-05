import * as nodeUtils from '@api3/airnode-utilities';
import * as operationsUtils from '@api3/operations-utilities';
import * as ethersExperimental from '@ethersproject/experimental';
import { ethers } from 'ethers';
import * as hre from 'hardhat';
import { ChainsConfig, Wallet } from '../../src/types';
import * as walletWatcher from '../../src/wallet-watcher';
import * as fixtures from '../fixtures';

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(60_000);

const oldEnv = process.env;

describe('walletWatcher', () => {
  const config = fixtures.buildConfig();
  const wallets = fixtures.buildWallets();
  const networks = fixtures.buildNetworks();
  const chainName = 'localhost';
  const chainId = '31337';
  const globalSponsorAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
  const topUpWalletAddress = '0xC26f10e1b37A1E7A7De266FeF0c19533489C3e75';
  const provider = new ethers.providers.StaticJsonRpcProvider(config.chains[chainId].rpc, {
    chainId: parseInt(chainId),
    name: chainName,
  });
  const providerWallet: Wallet = {
    walletType: 'Provider',
    address: topUpWalletAddress,
    providerXpub:
      'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
    topUpAmount: '0.1',
    lowBalance: '0.2',
  };

  let sendToOpsGenieLowLevelSpy: jest.SpyInstance;
  let closeOpsGenieAlertWithAliasSpy: jest.SpyInstance;
  let getGasPriceSpy: jest.SpyInstance;

  beforeEach(async () => {
    process.env = oldEnv;
    // Reset the local hardhat network state for each test
    await hre.network.provider.send('hardhat_reset');
    jest.restoreAllMocks();
    jest.clearAllTimers();

    // Reset alerts to ensure a clean state for each test
    operationsUtils.resetCachedAlerts();
    operationsUtils.resetOpenAlerts();

    //Spy on getGasPrice
    getGasPriceSpy = jest.spyOn(nodeUtils, 'getGasPrice');

    // Mock calls to 3rd party APIs
    sendToOpsGenieLowLevelSpy = jest.spyOn(operationsUtils, 'sendToOpsGenieLowLevel').mockImplementation(async () => {
      console.log('sendToOpsGenieLowLevel was called');
      return;
    });
    closeOpsGenieAlertWithAliasSpy = jest
      .spyOn(operationsUtils, 'closeOpsGenieAlertWithAlias')
      .mockImplementation(async () => {
        console.log('closeOpsGenieAlertWithAlias was called');
        return;
      });
    jest.spyOn(operationsUtils, 'getOpenAlertsForAlias').mockImplementation(async () => {
      console.log('getOpenAlertsForAlias was called');
      return '' as any;
    });
    jest.spyOn(operationsUtils, 'listOpenOpsGenieAlerts').mockImplementation(async () => {
      console.log('listOpenOpsGenieAlerts was called');
      return '' as any;
    });

    // Mock airnode-protocol networks
    jest.spyOn(walletWatcher, 'getNetworks').mockImplementationOnce(() => networks);
  });

  describe('runWalletWatcher', () => {
    it('tops up wallet succesfully if WALLET_ENABLE_SEND_FUNDS is enabled', async () => {
      process.env.WALLET_ENABLE_SEND_FUNDS = 'true';
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');

      const balanceBefore = await provider.getBalance(topUpWalletAddress);
      await walletWatcher.runWalletWatcher(config, wallets);
      const balanceAfter = await provider.getBalance(topUpWalletAddress);
      const getGasPriceResolvedPromises = await Promise.all(getGasPriceSpy.mock.results.map((r) => r.value));
      const sendTransactionResolvedPromises = await Promise.all(
        nonceManagerSendTransactionSpy.mock.results.map((r) => r.value)
      );
      const { gasLimit: _gasLimit, ...restGasTarget } = getGasPriceResolvedPromises[0][1];
      const { hash } = sendTransactionResolvedPromises[0];

      expect(balanceBefore).toEqual(ethers.utils.parseEther('0'));
      expect(balanceAfter).toEqual(ethers.utils.parseEther(providerWallet.topUpAmount));
      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: providerWallet.address,
        value: ethers.utils.parseEther(providerWallet.topUpAmount),
        ...restGasTarget,
      });
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `freshly-topped-up-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `no-sponsor-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `low-master-sponsor-balance-${chainName}`,
        config.opsGenieConfig
      );
      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: `Just topped up ${providerWallet.address} on ${chainName}`,
          alias: `freshly-topped-up-${providerWallet.address}-${chainName}`,
          description: [
            `Type of wallet: ${providerWallet.walletType}`,
            `Address: ${config.explorerUrls[chainId]}address/${providerWallet.address} )`,
            `Transaction: ${config.explorerUrls[chainId]}tx/${hash}`,
          ].join('\n'),
          priority: 'P5',
        },
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `error-while-topping-up-wallet-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
    });

    it('does not top up wallet if WALLET_ENABLE_SEND_FUNDS is not enabled', async () => {
      delete process.env.WALLET_ENABLE_SEND_FUNDS;
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');

      const balanceBefore = await provider.getBalance(topUpWalletAddress);
      await walletWatcher.runWalletWatcher(config, wallets);
      const balanceAfter = await provider.getBalance(topUpWalletAddress);

      expect(balanceBefore).toEqual(ethers.utils.parseEther('0'));
      expect(balanceAfter).toEqual(ethers.utils.parseEther('0'));
      expect(nonceManagerSendTransactionSpy).not.toHaveBeenCalled();
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `freshly-topped-up-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `no-sponsor-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `low-master-sponsor-balance-${chainName}`,
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `error-while-topping-up-wallet-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
    });

    it('does not top up wallet if wallet balance threshold is not exceeded', async () => {
      process.env.WALLET_ENABLE_SEND_FUNDS = 'true';
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');
      const balanceOnce = ethers.utils.parseEther('1');
      await hre.network.provider.send('hardhat_setBalance', [
        topUpWalletAddress,
        ethers.utils.hexStripZeros(balanceOnce.toHexString()),
      ]);

      const balanceBefore = await provider.getBalance(topUpWalletAddress);
      await walletWatcher.runWalletWatcher(config, wallets);
      const balanceAfter = await provider.getBalance(topUpWalletAddress);

      expect(balanceBefore).toEqual(balanceOnce);
      expect(balanceAfter).toEqual(balanceOnce);
      expect(nonceManagerSendTransactionSpy).not.toHaveBeenCalled();
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `freshly-topped-up-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `no-sponsor-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
    });

    it('handles invalid wallet configuration', async () => {
      process.env.WALLET_ENABLE_SEND_FUNDS = 'true';
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');

      const configOnce = {
        ...config,
        chains: {
          ...config.chains,
          ['3']: {
            rpc: 'https://ropsten-provider.com/',
          } as any,
        } as ChainsConfig,
      };
      const balanceBefore = await provider.getBalance(topUpWalletAddress);
      await walletWatcher.runWalletWatcher(configOnce, wallets);
      const balanceAfter = await provider.getBalance(topUpWalletAddress);
      const getGasPriceResolvedPromises = await Promise.all(getGasPriceSpy.mock.results.map((r) => r.value));
      const sendTransactionResolvedPromises = await Promise.all(
        nonceManagerSendTransactionSpy.mock.results.map((r) => r.value)
      );
      const { gasLimit: _gasLimit, ...restGasTarget } = getGasPriceResolvedPromises[0][1];
      const { hash } = sendTransactionResolvedPromises[0];

      expect(balanceBefore).toEqual(ethers.utils.parseEther('0'));
      expect(balanceAfter).toEqual(ethers.utils.parseEther(providerWallet.topUpAmount));
      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: providerWallet.address,
        value: ethers.utils.parseEther(providerWallet.topUpAmount),
        ...restGasTarget,
      });
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `freshly-topped-up-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `no-sponsor-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `low-master-sponsor-balance-${chainName}`,
        config.opsGenieConfig
      );
      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: `Just topped up ${providerWallet.address} on ${chainName}`,
          alias: `freshly-topped-up-${providerWallet.address}-${chainName}`,
          description: [
            `Type of wallet: ${providerWallet.walletType}`,
            `Address: ${config.explorerUrls[chainId]}address/${providerWallet.address} )`,
            `Transaction: ${config.explorerUrls[chainId]}tx/${hash}`,
          ].join('\n'),
          priority: 'P5',
        },
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `error-while-topping-up-wallet-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
    });

    it('handles throwing an error while submitting a transaction', async () => {
      process.env.WALLET_ENABLE_SEND_FUNDS = 'true';
      const txError = new Error('Failed to submit top up transaction');
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');
      nonceManagerSendTransactionSpy.mockImplementationOnce(async () => {
        throw txError;
      });

      const configOnce = {
        ...config,
        chains: {
          ...config.chains,
          ['3']: { ...config.chains[chainId], topUpAmount: '1' },
        } as ChainsConfig,
      };
      const walletsOnce = {
        ...wallets,
        '3': [
          {
            apiName: 'api3',
            walletType: 'Provider',
            address: '0xC26f10e1b37A1E7A7De266FeF0c19533489C3e75',
            providerXpub:
              'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
            sponsor: '0x9fEe9F24ab79adacbB51af82fb82CFb9D818c6d9',
            topUpAmount: '0.1',
            lowBalance: '0.2',
          } as Wallet,
        ],
      };
      const balanceBefore = await provider.getBalance(topUpWalletAddress);

      await walletWatcher.runWalletWatcher(configOnce, walletsOnce);

      const balanceAfter = await provider.getBalance(topUpWalletAddress);
      const getGasPriceResolvedPromises = await Promise.all(getGasPriceSpy.mock.results.map((r) => r.value));
      const sendTransactionResolvedPromises = (
        await Promise.allSettled(nonceManagerSendTransactionSpy.mock.results.map((r) => r.value))
      ).filter((result) => result.status === 'fulfilled');
      const { gasLimit: _gasLimit, ...restGasTarget } = getGasPriceResolvedPromises[0][1];
      const { hash } = (
        sendTransactionResolvedPromises[0] as PromiseFulfilledResult<ethers.providers.TransactionResponse>
      ).value;

      expect(balanceBefore).toEqual(ethers.utils.parseEther('0'));
      expect(balanceAfter).toEqual(ethers.utils.parseEther(providerWallet.topUpAmount));
      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: providerWallet.address,
        value: ethers.utils.parseEther(providerWallet.topUpAmount),
        ...restGasTarget,
      });
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `freshly-topped-up-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `no-sponsor-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `low-master-sponsor-balance-${chainName}`,
        config.opsGenieConfig
      );
      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: `Just topped up ${providerWallet.address} on ${chainName}`,
          alias: `freshly-topped-up-${providerWallet.address}-${chainName}`,
          description: [
            `Type of wallet: ${providerWallet.walletType}`,
            `Address: ${config.explorerUrls[chainId]}address/${providerWallet.address} )`,
            `Transaction: ${config.explorerUrls[chainId]}tx/${hash}`,
          ].join('\n'),
          priority: 'P5',
        },
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `error-while-topping-up-wallet-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: 'An error occurred while trying to up up a wallet',
          alias: `error-while-topping-up-wallet-${providerWallet.address}-${'ropsten'}`,
          priority: 'P1',
          description: `Error: ${txError}\nStack Trace: ${(txError as Error)?.stack}`,
        },
        config.opsGenieConfig
      );
    });

    it('sends ops genie alert for low global sponsor wallet balance and still tops up wallet', async () => {
      process.env.WALLET_ENABLE_SEND_FUNDS = 'true';
      await hre.network.provider.send('hardhat_setBalance', [
        globalSponsorAddress,
        ethers.utils.hexStripZeros(ethers.utils.parseEther('2').toHexString()),
      ]);
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');

      const balanceBefore = await provider.getBalance(topUpWalletAddress);
      await walletWatcher.runWalletWatcher(config, wallets);
      const balanceAfter = await provider.getBalance(topUpWalletAddress);
      const getGasPriceResolvedPromises = await Promise.all(getGasPriceSpy.mock.results.map((r) => r.value));
      const sendTransactionResolvedPromises = await Promise.all(
        nonceManagerSendTransactionSpy.mock.results.map((r) => r.value)
      );
      const { gasLimit: _gasLimit, ...restGasTarget } = getGasPriceResolvedPromises[0][1];
      const { hash } = sendTransactionResolvedPromises[0];

      // Test the ops genie functionality
      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: `Low balance on primary top-up sponsor for chain ${chainName}`,
          alias: `low-master-sponsor-balance-${chainName}`,
          priority: 'P3',
        },
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).not.toHaveBeenCalledWith(
        `low-master-sponsor-balance-${chainName}`,
        config.opsGenieConfig
      );

      // Test the rest of the top up
      expect(balanceBefore).toEqual(ethers.utils.parseEther('0'));
      expect(balanceAfter).toEqual(ethers.utils.parseEther(providerWallet.topUpAmount));
      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: providerWallet.address,
        value: ethers.utils.parseEther(providerWallet.topUpAmount),
        ...restGasTarget,
      });
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `freshly-topped-up-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `no-sponsor-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: `Just topped up ${providerWallet.address} on ${chainName}`,
          alias: `freshly-topped-up-${providerWallet.address}-${chainName}`,
          description: [
            `Type of wallet: ${providerWallet.walletType}`,
            `Address: ${config.explorerUrls[chainId]}address/${providerWallet.address} )`,
            `Transaction: ${config.explorerUrls[chainId]}tx/${hash}`,
          ].join('\n'),
          priority: 'P5',
        },
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `error-while-topping-up-wallet-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
      );
    });
  });
});
