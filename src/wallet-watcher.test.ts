import { join } from 'path';
import { ethers } from 'ethers';
import * as ethersExperimental from '@ethersproject/experimental';
import { opsGenie } from '@api3/operations-utilities';
import * as nodeUtils from '@api3/airnode-utilities';
import { WalletType } from '@api3/operations';
import * as operationsUtils from '@api3/operations/dist/utils/read-operations';
import * as walletWatcher from './wallet-watcher';
import * as fixtures from '../test/fixtures';
import * as constants from '../src/constants';
import { ChainsConfig } from '../src/types';

process.env.OPSGENIE_API_KEY = 'test';
const oldEnv = process.env;

// Mock operations repository data
const operationsRepository = operationsUtils.readOperationsRepository(
  join(__dirname, '..', 'test', 'fixtures', 'data')
);

describe('walletWatcher', () => {
  const walletConfig = fixtures.buildWalletConfig();
  const chainName = 'local';
  const chainId = '31337';
  const providerXpub =
    'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK';
  const sponsorAddress = '0x9fEe9F24ab79adacbB51af82fb82CFb9D818c6d9';
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
  const sponsorBalance = ethers.utils.parseEther('10');
  const balance = ethers.utils.parseEther('0');
  const walletAndBalance = { ...wallet, provider, balance };
  const sponsor = new ethersExperimental.NonceManager(
    ethers.Wallet.fromMnemonic(walletConfig.topUpMnemonic).connect(
      new ethers.providers.StaticJsonRpcProvider(walletConfig.chains[chainId].rpc, {
        chainId: parseInt(chainId),
        name: chainId,
      })
    )
  );
  const globalSponsors = [{ chainId, ...walletConfig.chains[chainId], sponsor }];
  const gasTarget = {
    type: 0,
    gasPrice: ethers.utils.parseUnits('10', 'gwei'),
  };
  const transactionResponseMock = { hash: '0xabc', wait: async () => jest.fn() } as any;

  let sendToOpsGenieLowLevelSpy: jest.SpyInstance;
  let closeOpsGenieAlertWithAliasSpy: jest.SpyInstance;

  beforeEach(async () => {
    process.env = oldEnv;
    jest.restoreAllMocks();
    jest.clearAllTimers();

    // Reset alerts to ensure a clean state for each test
    opsGenie.resetCachedAlerts();
    opsGenie.resetOpenAlerts();

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

  describe('getProvider', () => {
    it('returns provider', async () => {
      // jest.spyOn(operationsUtils, 'readOperationsRepository').mockImplementation(() => operationsRepository);
      const providerResult = await walletWatcher.getProvider(walletConfig, chainName, operationsRepository);

      expect(providerResult).toEqual(provider);
      expect(sendToOpsGenieLowLevelSpy).not.toHaveBeenCalled();
      // Closes open alerts
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `invalid-chain-name-${chainName}`,
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `no-provider-found-${chainId}`,
        walletConfig.opsGenieConfig
      );
    });

    it('sends ops genie alert for invalid chain', async () => {
      const invalidChainName = 'invalid-chain';
      const provider = await walletWatcher.getProvider(walletConfig, invalidChainName, operationsRepository);

      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: 'Invalid chain name',
          alias: `invalid-chain-name-${invalidChainName}`,
          description: `Check that the chains specified in the ops repository and in config/walletConfig.json match`,
          priority: 'P3',
        },
        walletConfig.opsGenieConfig
      );
      expect(provider).toBeUndefined();
    });

    it('sends ops genie alert for missing chain in walletConfig', async () => {
      process.env.OPSGENIE_API_KEY = 'test';
      const missingChainName = 'ropsten';
      const missingChainId = '3';
      const provider = await walletWatcher.getProvider(walletConfig, missingChainName, operationsRepository);

      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: `No provider found for chain id ${missingChainId} (${missingChainName})`,
          alias: `no-provider-found-${missingChainId}`,
          description: `No provider found for this chain ID, please check the config/walletConfig.json file`,
          priority: 'P2',
        },
        walletConfig.opsGenieConfig
      );
      expect(provider).toBeUndefined();
    });
  });

  describe('getGlobalSponsors', () => {
    it('returns global sponsors', () => {
      const globalSponsors = walletWatcher.getGlobalSponsors(walletConfig);
      const sponsor = new ethersExperimental.NonceManager(
        ethers.Wallet.fromMnemonic(walletConfig.topUpMnemonic).connect(
          new ethers.providers.StaticJsonRpcProvider(walletConfig.chains[chainId].rpc, {
            chainId: parseInt(chainId),
            name: chainId,
          })
        )
      );

      // Stringifying results as a work around for 'Received: serializes to the same string' error (https://github.com/facebook/jest/issues/8475)
      expect(JSON.stringify(globalSponsors)).toEqual(
        JSON.stringify([{ chainId, ...walletConfig.chains[chainId], sponsor }])
      );
    });

    it('does not return global sponsor if missing configuration', () => {
      const walletConfigOnce = {
        ...walletConfig,
        chains: { [chainId]: { rpc: 'http://127.0.0.1:8545/' } },
      } as any;
      const globalSponsors = walletWatcher.getGlobalSponsors(walletConfigOnce);
      expect(globalSponsors).toEqual([]);
    });
  });

  describe('derivePspAddress', () => {
    it('derives sponsor address', () => {
      const xpub =
        'xpub6Cqm1pKEocHJDZ6Ghdau2wmwaCxRUfnmFUrEvuTcsjj6c4bVMuq8MCypeJxMeYNgCupj23hrrpkWmdrTB7Q5MpGFMFtVuyYx7nGSRXhc8rH';
      const wallet = ethers.Wallet.fromMnemonic(walletConfig.topUpMnemonic);
      const sponsorAddress = walletWatcher.derivePspAddress(wallet.address, xpub, '2');

      expect(sponsorAddress).toEqual('0x31D50143dC863Feab4b35834415B7b3F9f6f6B35');
    });
  });

  describe('determineWalletAddress', () => {
    const walletTypes: WalletType[] = ['Provider', 'API3'];
    walletTypes.forEach((walletType) =>
      it(`returns wallet for type ${walletType}`, () => {
        const wallet = walletWatcher.determineWalletAddress(
          {
            walletType,
            address: topUpWalletAddress,
            chainName,
            providerXpub: providerXpub,
            sponsor: sponsorAddress,
          },
          sponsorAddress
        );
        expect(wallet).toEqual({
          address: topUpWalletAddress,
          providerXpub:
            'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
          walletType,
          chainName,
          sponsor: sponsorAddress,
        });
      })
    );

    const sponsorWalletTypes: { walletType: WalletType; xpub: string }[] = [
      { walletType: 'API3-Sponsor', xpub: constants.API3_XPUB },
      { walletType: 'Provider-Sponsor', xpub: providerXpub },
    ];
    sponsorWalletTypes.forEach(({ walletType, xpub }) =>
      it(`returns wallet for type ${walletType}`, () => {
        const derivedAddress = walletWatcher.derivePspAddress(sponsorAddress, xpub, '2');
        const wallet = walletWatcher.determineWalletAddress(
          {
            walletType,
            address: topUpWalletAddress,
            chainName,
            providerXpub: providerXpub,
            sponsor: sponsorAddress,
          },
          sponsorAddress
        );
        expect(wallet).toEqual({
          address: derivedAddress,
          providerXpub:
            'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
          walletType,
          chainName,
          sponsor: sponsorAddress,
        });
      })
    );
  });

  describe('getWalletsAndBalances', () => {
    it('returns wallet with balances', async () => {
      const balance = ethers.utils.parseEther('12');
      jest
        .spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance')
        .mockImplementation(async () => balance);
      const walletsAndBalances = await walletWatcher.getWalletsAndBalances(walletConfig, operationsRepository);

      expect(walletsAndBalances).toEqual([{ ...wallet, provider, balance }]);
    });

    it('handles invalid providers', async () => {
      const walletConfigOnce = {
        ...walletConfig,
        chains: {
          ...walletConfig.chains,
          ['123']: {
            rpc: 'http://127.0.0.1:8545/',
            topUpAmount: '0.1',
            lowBalance: '0.2',
            globalSponsorLowBalanceWarn: '3',
            options: {
              fulfillmentGasLimit: 123456, // The wallet-watcher doesn't currently use this but it is required in the ChainOptions type
              gasPriceOracle: [
                {
                  gasPriceStrategy: 'latestBlockPercentileGasPrice',
                  percentile: 60,
                  minTransactionCount: 20,
                  pastToCompareInBlocks: 20,
                  maxDeviationMultiplier: 2,
                },
                {
                  gasPriceStrategy: 'providerRecommendedGasPrice',
                  recommendedGasPriceMultiplier: 1.2,
                },
                {
                  gasPriceStrategy: 'constantGasPrice',
                  gasPrice: {
                    value: 10,
                    unit: 'gwei',
                  },
                },
              ],
            },
          },
        } as ChainsConfig,
      };

      const balance = ethers.utils.parseEther('12');
      jest
        .spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance')
        .mockImplementation(async () => balance);
      const walletsAndBalances = await walletWatcher.getWalletsAndBalances(walletConfigOnce, operationsRepository);

      expect(walletsAndBalances).toEqual([{ ...wallet, provider, balance }]);
    });

    it('handles failing to get balance', async () => {
      const walletConfigOnce = {
        ...walletConfig,
        chains: {
          ...walletConfig.chains,
          ['3']: {
            rpc: 'https://ropsten-provider.com/',
          } as any,
        } as ChainsConfig,
      };

      const balance = ethers.utils.parseEther('12');
      jest
        .spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance')
        .mockImplementationOnce(() => {
          throw new Error('Error getting balance.');
        })
        .mockImplementation(async () => balance);
      const walletsAndBalances = await walletWatcher.getWalletsAndBalances(walletConfigOnce, operationsRepository);

      expect(walletsAndBalances).toEqual([{ ...wallet, provider, balance }]);
    });
  });

  describe('checkAndFundWallet', () => {
    it('tops up wallet succesfully if WALLET_ENABLE_SEND_FUNDS is enabled', async () => {
      process.env.WALLET_ENABLE_SEND_FUNDS = 'true';
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');
      jest
        .spyOn(ethersExperimental.NonceManager.prototype, 'getBalance')
        .mockImplementation(async () => sponsorBalance);

      jest
        .spyOn(nodeUtils, 'getGasPrice')
        .mockImplementation(async () => [[{ message: 'Returned gas price', level: 'INFO' }], gasTarget] as any);
      nonceManagerSendTransactionSpy.mockImplementation(async () => transactionResponseMock);

      await walletWatcher.checkAndFundWallet(walletAndBalance, walletConfig, globalSponsors, operationsRepository);

      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: wallet.address,
        value: ethers.utils.parseEther(walletConfig.chains[chainId].topUpAmount!),
        ...gasTarget,
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
            `Transaction: ${walletConfig.explorerUrls[chainId]}tx/${'0xabc'}`,
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
      jest
        .spyOn(ethersExperimental.NonceManager.prototype, 'getBalance')
        .mockImplementation(async () => sponsorBalance);

      jest
        .spyOn(nodeUtils, 'getGasPrice')
        .mockImplementation(async () => [[{ message: 'Returned gas price', level: 'INFO' }], gasTarget] as any);
      nonceManagerSendTransactionSpy.mockImplementation(async () => transactionResponseMock);

      await walletWatcher.checkAndFundWallet(walletAndBalance, walletConfig, globalSponsors, operationsRepository);

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
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');
      jest
        .spyOn(ethersExperimental.NonceManager.prototype, 'getBalance')
        .mockImplementation(async () => sponsorBalance);

      jest
        .spyOn(nodeUtils, 'getGasPrice')
        .mockImplementation(async () => [[{ message: 'Returned gas price', level: 'INFO' }], gasTarget] as any);
      nonceManagerSendTransactionSpy.mockImplementation(async () => transactionResponseMock);
      const walletAndBalanceOnce = { ...walletAndBalance, balance: ethers.utils.parseEther('3') };

      await walletWatcher.checkAndFundWallet(walletAndBalanceOnce, walletConfig, globalSponsors, operationsRepository);

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

    it('does not top up wallet if missing global sponsor', async () => {
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');
      jest
        .spyOn(ethersExperimental.NonceManager.prototype, 'getBalance')
        .mockImplementation(async () => sponsorBalance);

      jest
        .spyOn(nodeUtils, 'getGasPrice')
        .mockImplementation(async () => [[{ message: 'Returned gas price', level: 'INFO' }], gasTarget] as any);
      nonceManagerSendTransactionSpy.mockImplementation(async () => transactionResponseMock);
      const walletAndBalanceOnce = { ...walletAndBalance, balance: ethers.utils.parseEther('3') };

      await walletWatcher.checkAndFundWallet(walletAndBalanceOnce, walletConfig, [], operationsRepository);

      expect(nonceManagerSendTransactionSpy).not.toHaveBeenCalled();
      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: `Can't find a valid global sponsor for ${wallet.address} on ${wallet.chainName}`,
          alias: `no-sponsor-${wallet.address}-${wallet.chainName}`,
          priority: 'P1',
        },
        walletConfig.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
        walletConfig.opsGenieConfig
      );
    });

    it('does not top up wallet if missing wallet configuration', async () => {
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');
      jest
        .spyOn(ethersExperimental.NonceManager.prototype, 'getBalance')
        .mockImplementation(async () => sponsorBalance);

      jest
        .spyOn(nodeUtils, 'getGasPrice')
        .mockImplementation(async () => [[{ message: 'Returned gas price', level: 'INFO' }], gasTarget] as any);
      nonceManagerSendTransactionSpy.mockImplementation(async () => transactionResponseMock);
      const walletConfigOnce = {
        ...walletConfig,
        chains: { [chainId]: { rpc: 'http://127.0.0.1:8545/' } },
      } as any;

      await walletWatcher.checkAndFundWallet(walletAndBalance, walletConfigOnce, globalSponsors, operationsRepository);

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

    it('handles throwing an error', async () => {
      process.env.WALLET_ENABLE_SEND_FUNDS = 'true';
      const txError = new Error('Failed to submit top up transaction');
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');
      jest
        .spyOn(ethersExperimental.NonceManager.prototype, 'getBalance')
        .mockImplementation(async () => sponsorBalance);

      jest
        .spyOn(nodeUtils, 'getGasPrice')
        .mockImplementation(async () => [[{ message: 'Returned gas price', level: 'INFO' }], gasTarget] as any);
      nonceManagerSendTransactionSpy.mockImplementation(async () => {
        throw txError;
      });

      await walletWatcher.checkAndFundWallet(walletAndBalance, walletConfig, globalSponsors, operationsRepository);

      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: wallet.address,
        value: ethers.utils.parseEther(walletConfig.chains[chainId].topUpAmount!),
        ...gasTarget,
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
          message: 'An error occurred while trying to up up a wallet',
          alias: `error-while-topping-up-wallet-${wallet.address}-${wallet.chainName}`,
          priority: 'P1',
          description: `Error: ${txError}\nStack Trace: ${(txError as Error)?.stack}`,
        },
        walletConfig.opsGenieConfig
      );
    });

    it('sends ops genie alert for low global sponsor wallet balance', async () => {
      process.env.WALLET_ENABLE_SEND_FUNDS = 'true';
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');
      jest
        .spyOn(ethersExperimental.NonceManager.prototype, 'getBalance')
        .mockImplementation(async () => ethers.utils.parseEther('2'));

      jest
        .spyOn(nodeUtils, 'getGasPrice')
        .mockImplementation(async () => [[{ message: 'Returned gas price', level: 'INFO' }], gasTarget] as any);
      nonceManagerSendTransactionSpy.mockImplementation(async () => transactionResponseMock);

      await walletWatcher.checkAndFundWallet(walletAndBalance, walletConfig, globalSponsors, operationsRepository);

      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: wallet.address,
        value: ethers.utils.parseEther(walletConfig.chains[chainId].topUpAmount!),
        ...gasTarget,
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
      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: `Just topped up ${wallet.address} on ${wallet.chainName}`,
          alias: `freshly-topped-up-${wallet.address}-${wallet.chainName}`,
          description: [
            `Type of wallet: ${wallet.walletType}`,
            `Address: ${walletConfig.explorerUrls[chainId]}address/${wallet.address} )`,
            `Transaction: ${walletConfig.explorerUrls[chainId]}tx/${'0xabc'}`,
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

  describe('runWalletWatcher', () => {
    it('tops up wallet succesfully', async () => {
      process.env.WALLET_ENABLE_SEND_FUNDS = 'true';
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');
      jest
        .spyOn(ethersExperimental.NonceManager.prototype, 'getBalance')
        .mockImplementation(async () => sponsorBalance);
      jest
        .spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance')
        .mockImplementation(async () => balance);
      jest
        .spyOn(nodeUtils, 'getGasPrice')
        .mockImplementation(async () => [[{ message: 'Returned gas price', level: 'INFO' }], gasTarget] as any);
      nonceManagerSendTransactionSpy.mockImplementation(async () => transactionResponseMock);

      await walletWatcher.runWalletWatcher(walletConfig, operationsRepository);

      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: wallet.address,
        value: ethers.utils.parseEther(walletConfig.chains[chainId].topUpAmount!),
        ...gasTarget,
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
            `Transaction: ${walletConfig.explorerUrls[chainId]}tx/${'0xabc'}`,
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

    it('handles invalid wallet configuration', async () => {
      process.env.WALLET_ENABLE_SEND_FUNDS = 'true';
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');
      jest
        .spyOn(ethersExperimental.NonceManager.prototype, 'getBalance')
        .mockImplementation(async () => sponsorBalance);
      jest
        .spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance')
        .mockImplementation(async () => balance);
      jest
        .spyOn(nodeUtils, 'getGasPrice')
        .mockImplementation(async () => [[{ message: 'Returned gas price', level: 'INFO' }], gasTarget] as any);
      nonceManagerSendTransactionSpy.mockImplementation(async () => transactionResponseMock);

      const walletConfigOnce = {
        ...walletConfig,
        chains: {
          ...walletConfig.chains,
          ['3']: {
            rpc: 'https://ropsten-provider.com/',
          } as any,
        } as ChainsConfig,
      };
      await walletWatcher.runWalletWatcher(walletConfigOnce, operationsRepository);

      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: wallet.address,
        value: ethers.utils.parseEther(walletConfig.chains[chainId].topUpAmount!),
        ...gasTarget,
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
            `Transaction: ${walletConfig.explorerUrls[chainId]}tx/${'0xabc'}`,
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

    it('handles failing to submit transaction for a provider', async () => {
      process.env.WALLET_ENABLE_SEND_FUNDS = 'true';
      const txError = new Error('Failed to submit top up transaction');
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');
      jest
        .spyOn(ethersExperimental.NonceManager.prototype, 'getBalance')
        .mockImplementation(async () => sponsorBalance);
      jest
        .spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance')
        .mockImplementation(async () => balance);
      jest
        .spyOn(nodeUtils, 'getGasPrice')
        .mockImplementation(async () => [[{ message: 'Returned gas price', level: 'INFO' }], gasTarget] as any);
      nonceManagerSendTransactionSpy
        .mockImplementationOnce(async () => {
          throw txError;
        })
        .mockImplementation(async () => transactionResponseMock);

      const walletConfigOnce = {
        ...walletConfig,
        chains: {
          ...walletConfig.chains,
          ['3']: { ...walletConfig.chains[chainId], topUpAmount: '1' },
        } as ChainsConfig,
      };
      await walletWatcher.runWalletWatcher(walletConfigOnce, operationsRepository);

      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: wallet.address,
        value: ethers.utils.parseEther(walletConfigOnce.chains[chainId].topUpAmount!),
        ...gasTarget,
      });
      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: wallet.address,
        value: ethers.utils.parseEther(walletConfigOnce.chains['3'].topUpAmount!),
        ...gasTarget,
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
            `Transaction: ${walletConfig.explorerUrls[chainId]}tx/${'0xabc'}`,
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
  });
});
