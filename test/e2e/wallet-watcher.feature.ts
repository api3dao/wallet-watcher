import { join } from 'path';
import { ethers } from 'ethers';
import * as hre from 'hardhat';
import * as ethersExperimental from '@ethersproject/experimental';
import { opsGenie } from '@api3/operations-utilities';
import * as nodeUtils from '@api3/airnode-utilities';
import { WalletType } from '@api3/operations';
import * as operationsUtils from '@api3/operations/dist/utils/read-operations';
import * as walletWatcher from '../../src/wallet-watcher';
import * as fixtures from '../fixtures';
import { ChainsConfig } from '../../src/types';

const oldEnv = process.env;

// Mock operations repository data
const operationsRepository = operationsUtils.readOperationsRepository(join(__dirname, '..', 'fixtures', 'data'));

describe('walletWatcher', () => {
  const walletConfig = fixtures.buildWalletConfig();
  const chainName = 'local';
  const chainId = '31337';
  const globalSponsorAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
  const topUpWalletAddress = '0xC26f10e1b37A1E7A7De266FeF0c19533489C3e75';
  const provider = new ethers.providers.StaticJsonRpcProvider(walletConfig.chains[chainId].rpc, {
    chainId: parseInt(chainId),
    name: chainName,
  });
  const wallet = {
    walletType: 'Provider' as WalletType,
    address: topUpWalletAddress,
    chainName,
  };

  let sendToOpsGenieLowLevelSpy: jest.SpyInstance;
  let closeOpsGenieAlertWithAliasSpy: jest.SpyInstance;
  let getGasPriceSpy: jest.SpyInstance;

  beforeEach(async () => {
    process.env = oldEnv;
    // Ensure that Ops Genie requests are not made
    delete process.env.OPSGENIE_API_KEY;

    // Reset the local hardhat network state for each test
    await hre.network.provider.send('hardhat_reset');
    jest.restoreAllMocks();
    jest.clearAllTimers();

    // Reset alerts to ensure a clean state for each test
    opsGenie.resetCachedAlerts();
    opsGenie.resetOpenAlerts();

    //Spy on getGasPrice
    getGasPriceSpy = jest.spyOn(nodeUtils, 'getGasPrice');

    // Mock calls to 3rd party APIs
    sendToOpsGenieLowLevelSpy = jest.spyOn(opsGenie, 'sendToOpsGenieLowLevel').mockImplementation(async () => {
      console.log('sendToOpsGenieLowLevel was called');
      return;
    });
    closeOpsGenieAlertWithAliasSpy = jest
      .spyOn(opsGenie, 'closeOpsGenieAlertWithAlias')
      .mockImplementation(async () => {
        console.log('closeOpsGenieAlertWithAlias was called');
        return;
      });
    jest.spyOn(opsGenie, 'getOpenAlertsForAlias').mockImplementation(async () => {
      console.log('getOpenAlertsForAlias was called');
      return '' as any;
    });
    jest.spyOn(opsGenie, 'listOpenOpsGenieAlerts').mockImplementation(async () => {
      console.log('listOpenOpsGenieAlerts was called');
      return '' as any;
    });
  });

  describe('runWalletWatcher', () => {
    it('tops up wallet succesfully if WALLET_ENABLE_SEND_FUNDS is enabled', async () => {
      process.env.WALLET_ENABLE_SEND_FUNDS = 'true';
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');

      const balanceBefore = await provider.getBalance(topUpWalletAddress);
      await walletWatcher.runWalletWatcher(walletConfig, operationsRepository);
      const balanceAfter = await provider.getBalance(topUpWalletAddress);
      const getGasPriceResolvedPromises = await Promise.all(getGasPriceSpy.mock.results.map((r) => r.value));
      const sendTransactionResolvedPromises = await Promise.all(
        nonceManagerSendTransactionSpy.mock.results.map((r) => r.value)
      );
      const { gasLimit: _gasLimit, ...restGasTarget } = getGasPriceResolvedPromises[0][1];
      const { hash } = sendTransactionResolvedPromises[0];

      expect(balanceBefore).toEqual(ethers.utils.parseEther('0'));
      expect(balanceAfter).toEqual(ethers.utils.parseEther(walletConfig.chains[chainId].topUpAmount!));
      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: wallet.address,
        value: ethers.utils.parseEther(walletConfig.chains[chainId].topUpAmount!),
        ...restGasTarget,
      });
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `no-sponsor-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `low-master-sponsor-balance-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: `Just topped up ${wallet.address} on ${wallet.chainName}`,
          alias: `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
          description: [
            `Type of wallet: ${wallet.walletType}`,
            `Address: ${walletConfig.explorerUrls[chainId]}address/${wallet.address} )`,
            `Transaction: ${walletConfig.explorerUrls[chainId]}tx/${hash}`,
          ].join('\n'),
          priority: 'P5',
        },
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `error-while-topping-up-wallet-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
    });

    it('does not top up wallet if WALLET_ENABLE_SEND_FUNDS is not enabled', async () => {
      delete process.env.WALLET_ENABLE_SEND_FUNDS;
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');

      const balanceBefore = await provider.getBalance(topUpWalletAddress);
      await walletWatcher.runWalletWatcher(walletConfig, operationsRepository);
      const balanceAfter = await provider.getBalance(topUpWalletAddress);

      expect(balanceBefore).toEqual(ethers.utils.parseEther('0'));
      expect(balanceAfter).toEqual(ethers.utils.parseEther('0'));
      expect(nonceManagerSendTransactionSpy).not.toHaveBeenCalled();
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `no-sponsor-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `low-master-sponsor-balance-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `error-while-topping-up-wallet-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
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
      await walletWatcher.runWalletWatcher(walletConfig, operationsRepository);
      const balanceAfter = await provider.getBalance(topUpWalletAddress);

      expect(balanceBefore).toEqual(balanceOnce);
      expect(balanceAfter).toEqual(balanceOnce);
      expect(nonceManagerSendTransactionSpy).not.toHaveBeenCalled();
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `no-sponsor-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
    });

    it('handles invalid wallet configuration', async () => {
      process.env.WALLET_ENABLE_SEND_FUNDS = 'true';
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');

      const walletConfigOnce = {
        ...walletConfig,
        chains: {
          ...walletConfig.chains,
          ['3']: {
            rpc: 'https://ropsten-provider.com/',
          } as any,
        } as ChainsConfig,
      };
      const balanceBefore = await provider.getBalance(topUpWalletAddress);
      await walletWatcher.runWalletWatcher(walletConfigOnce, operationsRepository);
      const balanceAfter = await provider.getBalance(topUpWalletAddress);
      const getGasPriceResolvedPromises = await Promise.all(getGasPriceSpy.mock.results.map((r) => r.value));
      const sendTransactionResolvedPromises = await Promise.all(
        nonceManagerSendTransactionSpy.mock.results.map((r) => r.value)
      );
      const { gasLimit: _gasLimit, ...restGasTarget } = getGasPriceResolvedPromises[0][1];
      const { hash } = sendTransactionResolvedPromises[0];

      expect(balanceBefore).toEqual(ethers.utils.parseEther('0'));
      expect(balanceAfter).toEqual(ethers.utils.parseEther(walletConfig.chains[chainId].topUpAmount!));
      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: wallet.address,
        value: ethers.utils.parseEther(walletConfig.chains[chainId].topUpAmount!),
        ...restGasTarget,
      });
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `no-sponsor-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `low-master-sponsor-balance-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: `Just topped up ${wallet.address} on ${wallet.chainName}`,
          alias: `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
          description: [
            `Type of wallet: ${wallet.walletType}`,
            `Address: ${walletConfig.explorerUrls[chainId]}address/${wallet.address} )`,
            `Transaction: ${walletConfig.explorerUrls[chainId]}tx/${hash}`,
          ].join('\n'),
          priority: 'P5',
        },
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `error-while-topping-up-wallet-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
    });

    it('handles throwing an error while submitting a transaction', async () => {
      process.env.WALLET_ENABLE_SEND_FUNDS = 'true';
      const txError = new Error('Failed to submit top up transaction');
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');
      nonceManagerSendTransactionSpy.mockImplementationOnce(async () => {
        throw txError;
      });

      const walletConfigOnce = {
        ...walletConfig,
        chains: {
          ...walletConfig.chains,
          ['3']: { ...walletConfig.chains[chainId], topUpAmount: '1' },
        } as ChainsConfig,
      };
      const balanceBefore = await provider.getBalance(topUpWalletAddress);

      await walletWatcher.runWalletWatcher(walletConfigOnce, operationsRepository);

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
      expect(balanceAfter).toEqual(ethers.utils.parseEther(walletConfig.chains[chainId].topUpAmount!));
      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: wallet.address,
        value: ethers.utils.parseEther(walletConfig.chains[chainId].topUpAmount!),
        ...restGasTarget,
      });
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `no-sponsor-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `low-master-sponsor-balance-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: `Just topped up ${wallet.address} on ${wallet.chainName}`,
          alias: `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
          description: [
            `Type of wallet: ${wallet.walletType}`,
            `Address: ${walletConfig.explorerUrls[chainId]}address/${wallet.address} )`,
            `Transaction: ${walletConfig.explorerUrls[chainId]}tx/${hash}`,
          ].join('\n'),
          priority: 'P5',
        },
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `error-while-topping-up-wallet-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: 'An error occurred while trying to up up a wallet',
          alias: `error-while-topping-up-wallet-${wallet.address}-${'ropsten'}`,
          priority: 'P1',
          description: `Error: ${txError}\nStack Trace: ${(txError as Error)?.stack}`,
        },
        walletConfig.opsGenieConfig
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
      await walletWatcher.runWalletWatcher(walletConfig, operationsRepository);
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
          message: `Low balance on primary top-up sponsor for chain ${wallet.chainName}`,
          alias: `low-master-sponsor-balance-${wallet.chainName}`,
          priority: 'P3',
        },
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).not.toHaveBeenCalledWith(
        `low-master-sponsor-balance-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );

      // Test the rest of the top up
      expect(balanceBefore).toEqual(ethers.utils.parseEther('0'));
      expect(balanceAfter).toEqual(ethers.utils.parseEther(walletConfig.chains[chainId].topUpAmount!));
      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: wallet.address,
        value: ethers.utils.parseEther(walletConfig.chains[chainId].topUpAmount!),
        ...restGasTarget,
      });
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `no-sponsor-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: `Just topped up ${wallet.address} on ${wallet.chainName}`,
          alias: `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
          description: [
            `Type of wallet: ${wallet.walletType}`,
            `Address: ${walletConfig.explorerUrls[chainId]}address/${wallet.address} )`,
            `Transaction: ${walletConfig.explorerUrls[chainId]}tx/${hash}`,
          ].join('\n'),
          priority: 'P5',
        },
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `error-while-topping-up-wallet-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
    });
  });
});
