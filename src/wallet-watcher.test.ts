import { join } from 'path';
import { ethers } from 'ethers';
import { NonceManager } from '@ethersproject/experimental';
import { opsGenie } from '@api3/operations-utilities';
import { WalletType } from '@api3/operations';
import * as operationsUtils from '@api3/operations/dist/utils/read-operations';
import * as walletWatcher from './wallet-watcher';
import * as fixtures from '../test/fixtures';
import * as constants from '../src/constants';

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
  const sponsor = '0x9fEe9F24ab79adacbB51af82fb82CFb9D818c6d9';
  const topUpWalletAddress = '0xC26f10e1b37A1E7A7De266FeF0c19533489C3e75';
  const provider = new ethers.providers.StaticJsonRpcProvider(walletConfig.chains[chainId].rpc, {
    chainId: parseInt(chainId),
    name: chainName,
  });

  let sendToOpsGenieLowLevelSpy: jest.SpyInstance;
  let closeOpsGenieAlertWithAliasSpy: jest.SpyInstance;

  beforeEach(async () => {
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
      process.env.OPSGENIE_API_KEY = 'test';
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
      const sponsor = new NonceManager(
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
            sponsor,
          },
          sponsor
        );
        expect(wallet).toEqual({
          address: topUpWalletAddress,
          providerXpub:
            'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
          walletType,
          chainName,
          sponsor,
        });
      })
    );

    const sponsorWalletTypes: { walletType: WalletType; xpub: string }[] = [
      { walletType: 'API3-Sponsor', xpub: constants.API3_XPUB },
      { walletType: 'Provider-Sponsor', xpub: providerXpub },
    ];
    sponsorWalletTypes.forEach(({ walletType, xpub }) =>
      it(`returns wallet for type ${walletType}`, () => {
        const derivedAddress = walletWatcher.derivePspAddress(sponsor, xpub, '2');
        const wallet = walletWatcher.determineWalletAddress(
          {
            walletType,
            address: topUpWalletAddress,
            chainName,
            providerXpub: providerXpub,
            sponsor,
          },
          sponsor
        );
        expect(wallet).toEqual({
          address: derivedAddress,
          providerXpub:
            'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
          walletType,
          chainName,
          sponsor,
        });
      })
    );
  });

  describe('getWalletsAndBalances', () => {
    const wallet = {
      walletType: 'Provider',
      address: topUpWalletAddress,
      chainName,
    };
    const provider = new ethers.providers.StaticJsonRpcProvider(walletConfig.chains[chainId].rpc, {
      chainId: parseInt(chainId),
      name: chainName,
    });
    it('returns wallet with balances', async () => {
      const balance = ethers.BigNumber.from(12);
      jest
        .spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance')
        .mockImplementation(async () => balance);
      const walletsAndBalances = await walletWatcher.getWalletsAndBalances(walletConfig, operationsRepository);

      expect(walletsAndBalances).toEqual([{ ...wallet, provider, balance }]);
    });
  });

  describe('checkAndFundWallet', () => {});
});
