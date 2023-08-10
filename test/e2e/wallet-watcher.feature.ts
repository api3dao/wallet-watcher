import * as operationsUtils from '@api3/operations-utilities';
const limitedCloseOpsGenieAlertWithAliasMock = jest.fn(async () =>
  console.log('limitedCloseOpsGenieAlertWithAlias was called')
);
const limitedSendToOpsGenieLowLevelMock = jest.fn(async () => console.log('limitedSendToOpsGenieLowLevel was called'));
jest.spyOn(operationsUtils, 'getOpsGenieLimiter').mockImplementation(() => {
  return {
    opsGenieLimiter: {} as any,
    limitedCloseOpsGenieAlertWithAlias: limitedCloseOpsGenieAlertWithAliasMock,
    limitedSendToOpsGenieLowLevel: limitedSendToOpsGenieLowLevelMock,
  };
});
import hre from 'hardhat';
import { DeepMockProxy, mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import prisma from '../../src/database';
import * as walletWatcher from '../../src/wallet-watcher';
import * as fixtures from '../fixtures';

jest.mock('../../src/database', () => ({
  __esModule: true,
  default: mockDeep<PrismaClient>(),
}));

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(60_000);

describe('walletWatcher', () => {
  const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
  const config = fixtures.buildConfig();
  const wallets = fixtures.buildWallets();
  const chainId = '31337';

  beforeEach(async () => {
    mockReset(prismaMock);
    // Reset the local hardhat network state for each test
    await hre.network.provider.send('hardhat_reset');

    jest.clearAllMocks();
    jest.spyOn(walletWatcher, 'getChainName').mockImplementation(() => 'hardhat');
  });

  describe('runWalletWatcher', () => {
    it('sends alert to OpsGenie when wallet is below threshold', async () => {
      const [wallet] = wallets[chainId];
      const walletAddress = (wallet as any).address;

      const [funder] = await hre.ethers.getSigners();
      await funder.sendTransaction({ to: walletAddress, value: hre.ethers.utils.parseEther('0.15') });

      await walletWatcher.runWalletWatcher(config, wallets);

      expect(limitedCloseOpsGenieAlertWithAliasMock).toHaveBeenCalledTimes(2);
      expect(limitedSendToOpsGenieLowLevelMock).toHaveBeenCalledWith({
        alias: 'low-balance-0xa029e0cf3ff3ea6562c3e67315c9bbec596fb7ac0ac862365eb7ec783b426c0d',
        description: 'Current balance: 150000000000000000\nThreshold: 200000000000000000',
        message: 'Low balance alert for address 0xC26f10e1b37A1E7A7De266FeF0c19533489C3e75 on chain hardhat',
        priority: 'P2',
      });
      expect(prismaMock.walletBalance.create).toHaveBeenCalledWith({
        data: {
          name: 'api3',
          chainName: 'hardhat',
          walletAddress: '0xC26f10e1b37A1E7A7De266FeF0c19533489C3e75',
          balance: 0.15,
        },
      });
    });
  });
});
