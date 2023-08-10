const limitedSendToOpsGenieLowLevel = jest.fn();
const limitedCloseOpsGenieAlertWithAlias = jest.fn();

jest.mock('@api3/operations-utilities', () => ({
  getOpsGenieLimiter: () => ({
    limitedSendToOpsGenieLowLevel: limitedSendToOpsGenieLowLevel,
    limitedCloseOpsGenieAlertWithAlias: limitedCloseOpsGenieAlertWithAlias,
  }),
  log: (message: string, logLevel?: 'ERROR' | 'INFO', ...args: any[]) => console.log(message, logLevel, ...args),
}));

import { ethers } from 'ethers';
import { DeepMockProxy, mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import * as walletWatcher from './wallet-watcher';
import prisma from './database';
import * as constants from '../src/constants';
import { WalletType } from '../src/types';
import * as fixtures from '../test/fixtures';

jest.mock('./database', () => ({
  __esModule: true,
  default: mockDeep<PrismaClient>(),
}));

process.env.OPSGENIE_API_KEY = 'test';

describe('walletWatcher', () => {
  const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
  const config = fixtures.buildConfig();
  const wallets = fixtures.buildWallets();
  const name = 'api3';
  const chainName = 'localhost';
  const chainId = '31337';
  const providerXpub =
    'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK';
  const sponsorAddress = '0x9fEe9F24ab79adacbB51af82fb82CFb9D818c6d9';
  const addressToBeFunded = '0xC26f10e1b37A1E7A7De266FeF0c19533489C3e75';
  const provider = new ethers.providers.StaticJsonRpcProvider(config.chains[chainId].rpc, {
    chainId: parseInt(chainId),
    name: chainName,
  });

  jest.setTimeout(16_000);

  beforeEach(async () => {
    mockReset(prismaMock);
    jest.resetAllMocks();

    jest.spyOn(walletWatcher, 'getChainName').mockReturnValue(chainName);
  });

  describe('initializeChainStates', () => {
    it('returns augmented chains', () => {
      const chainStates = walletWatcher.initializeChainStates(config.chains);

      // Stringifying results as a work around for 'Received: serializes to the same string' error (https://github.com/facebook/jest/issues/8475)
      expect(JSON.stringify(chainStates)).toEqual(
        JSON.stringify({ [chainId]: { ...config.chains[chainId], chainName, provider } })
      );
    });
  });

  describe('deriveSponsorWalletAddress', () => {
    it('derives sponsor address', () => {
      const xpub =
        'xpub6Cqm1pKEocHJDZ6Ghdau2wmwaCxRUfnmFUrEvuTcsjj6c4bVMuq8MCypeJxMeYNgCupj23hrrpkWmdrTB7Q5MpGFMFtVuyYx7nGSRXhc8rH';
      const sponsorWalletAddress = walletWatcher.deriveSponsorWalletAddress(sponsorAddress, xpub, '2');

      expect(sponsorWalletAddress).toEqual('0x39634c6f035DfEcC1da51bbd7dA9a26f5871BA9F');
    });
  });

  describe('determineWalletAddress', () => {
    const walletTypes: Extract<WalletType, 'Provider' | 'API3'>[] = ['Provider', 'API3'];
    walletTypes.forEach((walletType) =>
      it(`returns wallet for type ${walletType}`, () => {
        const walletResult = walletWatcher.determineWalletAddress({
          name,
          walletType,
          address: addressToBeFunded,
          providerXpub,
          lowThreshold: { value: 0.2, unit: 'ether' },
          monitorType: 'alert',
        });
        expect(walletResult).toEqual({
          name: 'api3',
          walletType,
          address: '0xC26f10e1b37A1E7A7De266FeF0c19533489C3e75',
          providerXpub:
            'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
          lowThreshold: { value: 0.2, unit: 'ether' },
          monitorType: 'alert',
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
        const derivedAddress = walletWatcher.deriveSponsorWalletAddress(sponsorAddress, sponsorWalletType.xpub, '2');
        const walletResult = walletWatcher.determineWalletAddress({
          name: 'api3',
          providerXpub,
          lowThreshold: { value: 0.2, unit: 'ether' },
          monitorType: 'alert',
          sponsor: sponsorAddress,
          walletType: sponsorWalletType.walletType,
        });
        expect(walletResult).toEqual({
          name: 'api3',
          address: derivedAddress,
          lowThreshold: { value: 0.2, unit: 'ether' },
          monitorType: 'alert',
          providerXpub:
            'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
          sponsor: sponsorAddress,
          walletType: sponsorWalletType.walletType,
        });
      })
    );

    it(`returns wallet for type Airseeker`, () => {
      const derivedAddress = walletWatcher.deriveSponsorWalletAddress(sponsorAddress, providerXpub, '5');
      const walletResult = walletWatcher.determineWalletAddress({
        name,
        providerXpub,
        lowThreshold: { value: 0.2, unit: 'ether' },
        monitorType: 'alert',
        sponsor: sponsorAddress,
        walletType: 'Airseeker',
      });
      expect(walletResult).toEqual({
        name: 'api3',
        address: derivedAddress,
        providerXpub:
          'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
        sponsor: sponsorAddress,
        walletType: 'Airseeker',
        lowThreshold: { value: 0.2, unit: 'ether' },
        monitorType: 'alert',
      });
    });
  });

  describe('runWalletWatcher', () => {
    it('should send alert for low balance on wallet', async () => {
      jest
        .spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance')
        .mockImplementation(async () => ethers.utils.parseEther('0.19'));

      await walletWatcher.runWalletWatcher(config, wallets);

      const opsGenieAliasSuffix = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`${addressToBeFunded}${chainId}`));

      expect(limitedCloseOpsGenieAlertWithAlias).toHaveBeenNthCalledWith(1, `get-balance-error-${opsGenieAliasSuffix}`);
      expect(limitedCloseOpsGenieAlertWithAlias).toHaveBeenNthCalledWith(
        2,
        `critical-low-balance-${opsGenieAliasSuffix}`
      );
      expect(limitedSendToOpsGenieLowLevel).toHaveBeenCalledWith({
        priority: 'P2',
        alias: `low-balance-${opsGenieAliasSuffix}`,
        message: `Low balance alert for address ${addressToBeFunded} on chain ${chainName}`,
        description: `Current balance: 190000000000000000\nThreshold: 200000000000000000`,
      });
    });

    it('should send critical alert for low balance on wallet', async () => {
      jest
        .spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance')
        .mockImplementation(async () => ethers.utils.parseEther('0.09'));

      await walletWatcher.runWalletWatcher(config, wallets);

      const opsGenieAliasSuffix = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`${addressToBeFunded}${chainId}`));

      expect(limitedCloseOpsGenieAlertWithAlias).toHaveBeenCalledWith(`get-balance-error-${opsGenieAliasSuffix}`);

      expect(limitedSendToOpsGenieLowLevel).toHaveBeenCalledWith({
        priority: 'P1',
        alias: `critical-low-balance-${opsGenieAliasSuffix}`,
        message: `Critical low balance alert for address ${addressToBeFunded} on chain ${chainName}`,
        description: `Current balance: 90000000000000000\nThreshold: 200000000000000000\nCritical threshold: 100000000000000000`,
      });
    });

    it('should not send alert if balance is above threshold', async () => {
      jest
        .spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance')
        .mockImplementation(async () => ethers.utils.parseEther('0.21'));

      await walletWatcher.runWalletWatcher(config, wallets);

      const opsGenieAliasSuffix = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`${addressToBeFunded}${chainId}`));

      expect(limitedCloseOpsGenieAlertWithAlias).toHaveBeenNthCalledWith(1, `get-balance-error-${opsGenieAliasSuffix}`);
      expect(limitedCloseOpsGenieAlertWithAlias).toHaveBeenNthCalledWith(2, `low-balance-${opsGenieAliasSuffix}`);

      expect(limitedSendToOpsGenieLowLevel).not.toHaveBeenCalled();
    });

    it('should send single alert for same wallet (wallet with highest threshold)', async () => {
      jest
        .spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance')
        .mockImplementation(async () => ethers.utils.parseEther('0.14'));

      await walletWatcher.runWalletWatcher(config, {
        ...wallets,
        '31337': [
          {
            name: 'api3',
            walletType: 'API3',
            address: '0xC26f10e1b37A1E7A7De266FeF0c19533489C3e75',
            lowThreshold: { value: 0.15, unit: 'ether' },
            monitorType: 'alert',
          },
          ...wallets['31337'],
        ],
      });

      const opsGenieAliasSuffix = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`${addressToBeFunded}${chainId}`));

      expect(limitedCloseOpsGenieAlertWithAlias).toHaveBeenNthCalledWith(1, `get-balance-error-${opsGenieAliasSuffix}`);
      expect(limitedCloseOpsGenieAlertWithAlias).toHaveBeenNthCalledWith(
        2,
        `critical-low-balance-${opsGenieAliasSuffix}`
      );
      expect(limitedSendToOpsGenieLowLevel).toHaveBeenCalledTimes(1);
      expect(limitedSendToOpsGenieLowLevel).toHaveBeenCalledWith({
        priority: 'P2',
        alias: `low-balance-${opsGenieAliasSuffix}`,
        message: `Low balance alert for address ${addressToBeFunded} on chain ${chainName}`,
        description: `Current balance: 140000000000000000\nThreshold: 200000000000000000`,
      });
    });

    it('should retry provider.getBalance() on error', async () => {
      const getBalanceMock = jest
        .spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance')
        .mockRejectedValueOnce(new Error('Unexpected RPC error'))
        .mockResolvedValueOnce(ethers.utils.parseEther('0.19'));

      await walletWatcher.runWalletWatcher(config, wallets);

      const opsGenieAliasSuffix = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`${addressToBeFunded}${chainId}`));

      expect(getBalanceMock).toHaveBeenCalledTimes(2);

      expect(limitedCloseOpsGenieAlertWithAlias).toHaveBeenNthCalledWith(1, `get-balance-error-${opsGenieAliasSuffix}`);
      expect(limitedCloseOpsGenieAlertWithAlias).toHaveBeenNthCalledWith(
        2,
        `critical-low-balance-${opsGenieAliasSuffix}`
      );
      expect(limitedSendToOpsGenieLowLevel).toHaveBeenCalledWith({
        priority: 'P2',
        alias: `low-balance-${opsGenieAliasSuffix}`,
        message: `Low balance alert for address ${addressToBeFunded} on chain ${chainName}`,
        description: `Current balance: 190000000000000000\nThreshold: 200000000000000000`,
      });
    });

    it('should send alert when provider.getBalance() fails on wallet', async () => {
      const getBalanceMock = jest
        .spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance')
        .mockRejectedValue(new Error('Unexpected RPC error'));

      await walletWatcher.runWalletWatcher(config, wallets);

      const opsGenieAliasSuffix = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`${addressToBeFunded}${chainId}`));

      expect(getBalanceMock).toHaveBeenCalledTimes(3);

      expect(limitedSendToOpsGenieLowLevel).toHaveBeenCalledWith({
        priority: 'P2',
        alias: `get-balance-error-${opsGenieAliasSuffix}`,
        message: `Unable to get balance for address ${addressToBeFunded} on chain ${chainName}`,
        description: expect.stringContaining('Unexpected RPC error'),
      });
    });
  });
});
