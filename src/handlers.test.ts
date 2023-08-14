import * as operationsUtils from '@api3/operations-utilities';
import { DeepMockProxy, mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import * as configFunctions from './config';
import * as walletHandlers from './handlers';
import * as walletWatcher from './wallet-watcher';
import prisma from './database';
import * as fixtures from '../test/fixtures';

jest.mock('./database', () => ({
  __esModule: true,
  default: mockDeep<PrismaClient>(),
}));

jest.setTimeout(20_000);

process.env.OPSGENIE_API_KEY = 'test';
const oldEnv = process.env;

describe('walletWatcherHandler', () => {
  const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
  const config = fixtures.buildConfig();
  const wallets = fixtures.buildWallets();

  let sendToOpsGenieLowLevelSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockReset(prismaMock);
    process.env = oldEnv;
    jest.restoreAllMocks();
    jest.clearAllTimers();

    // prismaMock.walletBalance.create.mockImplementation()
    // Reset alerts to ensure a clean state for each test
    operationsUtils.resetCachedAlerts();
    operationsUtils.resetOpenAlerts();

    // Mock calls to 3rd party APIs
    sendToOpsGenieLowLevelSpy = jest.spyOn(operationsUtils, 'sendToOpsGenieLowLevel').mockImplementation(async () => {
      console.log('sendToOpsGenieLowLevel was called');
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
    jest.spyOn(operationsUtils, 'cacheOpenAlerts').mockImplementation(async () => {
      console.log('cacheOpenAlerts was called');
      return [] as any;
    });
  });

  it('sends ops genie alert for if the run throws an error', async () => {
    jest.spyOn(configFunctions, 'loadConfig').mockImplementationOnce(() => config);
    jest.spyOn(configFunctions, 'loadWallets').mockImplementationOnce(() => wallets);

    const error = new Error('Unexpected error during runWalletWatcher');
    jest.spyOn(walletWatcher, 'runWalletWatcher').mockImplementation(() => {
      throw error;
    });
    await walletHandlers.walletWatcherHandler({} as any, {} as any, {} as any);

    expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith({
      message: `Serverless wallet watcher encountered an error: ${error.message}`,
      alias: 'serverless-wallet-watcher-error',
      description: error.stack,
    });
  });
});
