import { ethers } from 'ethers';
import * as ethersExperimental from '@ethersproject/experimental';
import { opsGenie } from '@api3/operations-utilities';
import * as nodeUtils from '@api3/airnode-utilities';
import { WalletType } from '@api3/operations';
import * as walletWatcher from './wallet-watcher';
import * as fixtures from '../test/fixtures';
import * as constants from '../src/constants';
import { ChainConfig, ChainsConfig, Wallet } from '../src/types';

process.env.OPSGENIE_API_KEY = 'test';
const oldEnv = process.env;

describe('walletWatcher', () => {
  const wallets = fixtures.buildWallets();
  const config = fixtures.buildConfig();
  console.log('CONFIG', config);
  const networks = fixtures.buildNetworks();
  const apiName = 'api3';
  const chainName = 'localhost';
  const chainId = '31337';
  const providerXpub =
    'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK';
  const sponsorAddress = '0x9fEe9F24ab79adacbB51af82fb82CFb9D818c6d9';
  const topUpWalletAddress = '0xC26f10e1b37A1E7A7De266FeF0c19533489C3e75';
  const provider = new ethers.providers.StaticJsonRpcProvider(config.chains[chainId].rpc, {
    chainId: parseInt(chainId),
    name: chainName,
  });
  const providerWallet: Wallet = {
    walletType: 'Provider',
    address: topUpWalletAddress,
    apiName,
    providerXpub,
    topUpAmount: '0.1',
    lowBalance: '0.2',
  };
  const sponsorBalance = ethers.utils.parseEther('10');
  const balance = ethers.utils.parseEther('0');
  const walletAndBalance = { ...providerWallet, chainName, chainId, provider, balance };
  const sponsor = new ethersExperimental.NonceManager(
    ethers.Wallet.fromMnemonic(config.topUpMnemonic).connect(
      new ethers.providers.StaticJsonRpcProvider(config.chains[chainId].rpc, {
        chainId: parseInt(chainId),
        name: chainId,
      })
    )
  );
  const globalSponsors = [{ chainId, ...config.chains[chainId], sponsor }];
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

    // Mock airnode-protocol networks
    jest.spyOn(walletWatcher, 'getNetworks').mockImplementationOnce(() => networks);
  });

  describe('getGlobalSponsors', () => {
    it('returns global sponsors', () => {
      const globalSponsors = walletWatcher.getGlobalSponsors(config);
      const sponsor = new ethersExperimental.NonceManager(
        ethers.Wallet.fromMnemonic(config.topUpMnemonic).connect(
          new ethers.providers.StaticJsonRpcProvider(config.chains[chainId].rpc, {
            chainId: parseInt(chainId),
            name: chainId,
          })
        )
      );

      // Stringifying results as a work around for 'Received: serializes to the same string' error (https://github.com/facebook/jest/issues/8475)
      expect(JSON.stringify(globalSponsors)).toEqual(JSON.stringify([{ chainId, ...config.chains[chainId], sponsor }]));
    });
  });

  describe('deriveSponsorWalletAddress', () => {
    it('derives sponsor address', () => {
      const xpub =
        'xpub6Cqm1pKEocHJDZ6Ghdau2wmwaCxRUfnmFUrEvuTcsjj6c4bVMuq8MCypeJxMeYNgCupj23hrrpkWmdrTB7Q5MpGFMFtVuyYx7nGSRXhc8rH';
      const wallet = ethers.Wallet.fromMnemonic(config.topUpMnemonic);
      const sponsorAddress = walletWatcher.deriveSponsorWalletAddress(wallet.address, xpub, '2');

      expect(sponsorAddress).toEqual('0x31D50143dC863Feab4b35834415B7b3F9f6f6B35');
    });
  });

  describe('determineWalletAddress', () => {
    const walletTypes: Extract<WalletType, 'Provider' | 'API3'>[] = ['Provider', 'API3'];
    walletTypes.forEach((walletType) =>
      it(`returns wallet for type ${walletType}`, () => {
        const { walletType: _walletType, ...baseWallet } = providerWallet;
        const walletResult = walletWatcher.determineWalletAddress({
          ...baseWallet,
          walletType,
        });
        expect(walletResult).toEqual({
          apiName: 'api3',
          address: topUpWalletAddress,
          providerXpub:
            'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
          walletType,
          topUpAmount: '0.1',
          lowBalance: '0.2',
        });
      })
    );

    const sponsorWalletTypes: {
      walletType: Extract<WalletType, 'Provider-Sponsor' | 'API3-Sponsor'>;
      xpub: string;
    }[] = [
      { walletType: 'API3-Sponsor', xpub: constants.API3_XPUB },
      { walletType: 'Provider-Sponsor', xpub: providerXpub },
    ];
    sponsorWalletTypes.forEach((sponsorWalletType) =>
      it(`returns wallet for type ${sponsorWalletType.walletType}`, () => {
        const { walletType: _walletType, address: _address, ...baseWallet } = providerWallet;
        const derivedAddress = walletWatcher.deriveSponsorWalletAddress(sponsorAddress, sponsorWalletType.xpub, '2');
        const walletResult = walletWatcher.determineWalletAddress({
          ...baseWallet,
          sponsor: sponsorAddress,
          walletType: sponsorWalletType.walletType,
        });
        expect(walletResult).toEqual({
          apiName: 'api3',
          address: derivedAddress,
          providerXpub:
            'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
          sponsor: sponsorAddress,
          walletType: sponsorWalletType.walletType,
          topUpAmount: '0.1',
          lowBalance: '0.2',
        });
      })
    );

    it(`returns wallet for type Airseeker`, () => {
      const { walletType: _walletType, ...baseWallet } = providerWallet;
      const derivedAddress = walletWatcher.deriveSponsorWalletAddress(sponsorAddress, providerWallet.providerXpub, '5');
      const walletResult = walletWatcher.determineWalletAddress({
        ...baseWallet,
        sponsor: sponsorAddress,
        walletType: 'Airseeker',
      });
      expect(walletResult).toEqual({
        apiName: 'api3',
        address: derivedAddress,
        providerXpub:
          'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
        sponsor: sponsorAddress,
        walletType: 'Airseeker',
        topUpAmount: '0.1',
        lowBalance: '0.2',
      });
    });
  });

  describe('getWalletsAndBalances', () => {
    it('returns wallet with balances', async () => {
      const balance = ethers.utils.parseEther('12');
      jest
        .spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance')
        .mockImplementation(async () => balance);
      const walletsAndBalances = await walletWatcher.getWalletsAndBalances(config, wallets);

      expect(walletsAndBalances).toEqual([{ ...providerWallet, provider, balance, chainId, chainName }]);
    });

    it('handles invalid providers', async () => {
      const configOnce = {
        ...config,
        chains: {
          ...config.chains,
          ['123']: {
            rpc: 'http://127.0.0.1:8545/',
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
          } as ChainConfig,
        } as ChainsConfig,
      };

      const balance = ethers.utils.parseEther('12');
      jest
        .spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance')
        .mockImplementation(async () => balance);
      const walletsAndBalances = await walletWatcher.getWalletsAndBalances(configOnce, wallets);

      expect(walletsAndBalances).toEqual([{ ...providerWallet, provider, balance, apiName, chainId, chainName }]);
    });

    it('handles failing to get balance', async () => {
      const configOnce = {
        ...config,
        chains: {
          ...config.chains,
          ['3']: {
            rpc: 'https://ropsten-provider.com/',
          } as any,
        } as ChainsConfig,
      };

      const addressOnce = '0xfailure';
      const walletsOnce = {
        ...wallets,
        '3': [
          {
            apiName: 'api3',
            walletType: 'Provider',
            address: addressOnce,
            providerXpub:
              'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
          } as Wallet,
        ],
      };

      const balance = ethers.utils.parseEther('12');
      jest
        .spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance')
        .mockImplementation(async (address: any) => {
          if (address === addressOnce) throw new Error('Error getting balance.');
          return balance;
        });
      const walletsAndBalances = await walletWatcher.getWalletsAndBalances(configOnce, walletsOnce);

      expect(walletsAndBalances).toEqual([{ ...providerWallet, provider, balance, chainId, chainName }]);
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

      await walletWatcher.checkAndFundWallet(walletAndBalance, config, globalSponsors);

      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: providerWallet.address,
        value: ethers.utils.parseEther(providerWallet.topUpAmount!),
        ...gasTarget,
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
            `Transaction: ${config.explorerUrls[chainId]}tx/${'0xabc'}`,
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
      jest
        .spyOn(ethersExperimental.NonceManager.prototype, 'getBalance')
        .mockImplementation(async () => sponsorBalance);

      jest
        .spyOn(nodeUtils, 'getGasPrice')
        .mockImplementation(async () => [[{ message: 'Returned gas price', level: 'INFO' }], gasTarget] as any);
      nonceManagerSendTransactionSpy.mockImplementation(async () => transactionResponseMock);

      await walletWatcher.checkAndFundWallet(walletAndBalance, config, globalSponsors);

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
      const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');
      jest
        .spyOn(ethersExperimental.NonceManager.prototype, 'getBalance')
        .mockImplementation(async () => sponsorBalance);

      jest
        .spyOn(nodeUtils, 'getGasPrice')
        .mockImplementation(async () => [[{ message: 'Returned gas price', level: 'INFO' }], gasTarget] as any);
      nonceManagerSendTransactionSpy.mockImplementation(async () => transactionResponseMock);
      const walletAndBalanceOnce = { ...walletAndBalance, balance: ethers.utils.parseEther('3') };

      await walletWatcher.checkAndFundWallet(walletAndBalanceOnce, config, globalSponsors);

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

      await walletWatcher.checkAndFundWallet(walletAndBalanceOnce, config, []);

      expect(nonceManagerSendTransactionSpy).not.toHaveBeenCalled();
      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: `Can't find a valid global sponsor for ${providerWallet.address} on ${chainName}`,
          alias: `no-sponsor-${providerWallet.address}-${chainName}`,
          priority: 'P1',
        },
        config.opsGenieConfig
      );
      expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith(
        `freshly-topped-up-${providerWallet.address}-${chainName}`,
        config.opsGenieConfig
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
      const configOnce = {
        ...config,
        chains: { [chainId]: { rpc: 'http://127.0.0.1:8545/' } },
      } as any;

      await walletWatcher.checkAndFundWallet(walletAndBalance, configOnce, globalSponsors);

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

      await walletWatcher.checkAndFundWallet(walletAndBalance, config, globalSponsors);

      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: providerWallet.address,
        value: ethers.utils.parseEther(providerWallet.topUpAmount),
        ...gasTarget,
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
          message: 'An error occurred while trying to up up a wallet',
          alias: `error-while-topping-up-wallet-${providerWallet.address}-${chainName}`,
          priority: 'P1',
          description: `Error: ${txError}\nStack Trace: ${(txError as Error)?.stack}`,
        },
        config.opsGenieConfig
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

      await walletWatcher.checkAndFundWallet(walletAndBalance, config, globalSponsors);

      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: providerWallet.address,
        value: ethers.utils.parseEther(providerWallet.topUpAmount),
        ...gasTarget,
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
      expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
        {
          message: `Just topped up ${providerWallet.address} on ${chainName}`,
          alias: `freshly-topped-up-${providerWallet.address}-${chainName}`,
          description: [
            `Type of wallet: ${providerWallet.walletType}`,
            `Address: ${config.explorerUrls[chainId]}address/${providerWallet.address} )`,
            `Transaction: ${config.explorerUrls[chainId]}tx/${'0xabc'}`,
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

      await walletWatcher.runWalletWatcher(config, wallets);

      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: providerWallet.address,
        value: ethers.utils.parseEther(providerWallet.topUpAmount),
        ...gasTarget,
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
            `Transaction: ${config.explorerUrls[chainId]}tx/${'0xabc'}`,
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

      const configOnce = {
        ...config,
        chains: {
          ...config.chains,
          ['3']: {
            rpc: 'https://ropsten-provider.com/',
          } as any,
        } as ChainsConfig,
      };
      await walletWatcher.runWalletWatcher(configOnce, wallets);

      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: providerWallet.address,
        value: ethers.utils.parseEther(providerWallet.topUpAmount),
        ...gasTarget,
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
            `Transaction: ${config.explorerUrls[chainId]}tx/${'0xabc'}`,
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
      await walletWatcher.runWalletWatcher(configOnce, walletsOnce);

      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: providerWallet.address,
        value: ethers.utils.parseEther(providerWallet.topUpAmount),
        ...gasTarget,
      });
      expect(nonceManagerSendTransactionSpy).toHaveBeenCalledWith({
        to: providerWallet.address,
        value: ethers.utils.parseEther(providerWallet.topUpAmount),
        ...gasTarget,
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
            `Transaction: ${config.explorerUrls[chainId]}tx/${'0xabc'}`,
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
  });
});
