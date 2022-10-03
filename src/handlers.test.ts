import { ethers } from 'ethers';
import * as ethersExperimental from '@ethersproject/experimental';
import { opsGenie } from '@api3/operations-utilities';
import * as nodeUtils from '@api3/airnode-utilities';
import * as walletHandlers from './handlers';
import * as walletWatcher from './wallet-watcher';
import * as configFunctions from './config';
import * as fixtures from '../test/fixtures';

jest.setTimeout(60_000);

process.env.OPSGENIE_API_KEY = 'test';
const oldEnv = process.env;

describe('walletWatcherHandler', () => {
  const config = fixtures.buildConfig();
  const wallets = fixtures.buildWallets();
  const networks = fixtures.buildNetworks();
  const sponsorBalance = ethers.utils.parseEther('10');
  const balance = ethers.utils.parseEther('0');
  const gasTarget = {
    type: 0,
    gasPrice: ethers.utils.parseUnits('10', 'gwei'),
  };
  const transactionResponseMock = { hash: '0xabc', wait: async () => jest.fn() } as any;

  let sendToOpsGenieLowLevelSpy: jest.SpyInstance;
  let closeOpsGenieAlertWithAliasSpy: jest.SpyInstance;
  let sendOpsGenieHeartbeatSpy: jest.SpyInstance;

  beforeEach(async () => {
    process.env = oldEnv;
    jest.restoreAllMocks();
    jest.clearAllTimers();

    // Reset alerts to ensure a clean state for each test
    opsGenie.resetCachedAlerts();
    opsGenie.resetOpenAlerts();

    // Mock calls to 3rd party APIs
    sendOpsGenieHeartbeatSpy = jest.spyOn(opsGenie, 'sendOpsGenieHeartbeat').mockImplementation(async () => {
      console.log('sendOpsGenieHeartbeat was called');
      return;
    });
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
    jest.spyOn(opsGenie, 'cacheOpenAlerts').mockImplementation(async () => {
      console.log('cacheOpenAlerts was called');
      return [] as any;
    });
  });

  it('closes ops genie alert for successful run', async () => {
    process.env.WALLET_ENABLE_SEND_FUNDS = 'true';
    jest.spyOn(configFunctions, 'loadConfig').mockImplementationOnce(() => config);
    jest.spyOn(configFunctions, 'loadWallets').mockImplementationOnce(() => wallets);
    jest.spyOn(walletWatcher, 'getNetworks').mockImplementationOnce(() => networks);

    const nonceManagerSendTransactionSpy = jest.spyOn(ethersExperimental.NonceManager.prototype, 'sendTransaction');
    jest.spyOn(ethersExperimental.NonceManager.prototype, 'getBalance').mockImplementation(async () => sponsorBalance);
    jest.spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getBalance').mockImplementation(async () => balance);
    jest
      .spyOn(nodeUtils, 'getGasPrice')
      .mockImplementation(async () => [[{ message: 'Returned gas price', level: 'INFO' }], gasTarget] as any);
    nonceManagerSendTransactionSpy.mockImplementation(async () => transactionResponseMock);

    await walletHandlers.walletWatcherHandler({});

    expect(closeOpsGenieAlertWithAliasSpy).toHaveBeenCalledWith('serverless-wallet-watcher', config.opsGenieConfig);
    expect(sendOpsGenieHeartbeatSpy).toHaveBeenCalledWith('wallet-watcher', config.opsGenieConfig);
  });

  it('sends ops genie alert for if the run throws an error', async () => {
    process.env.WALLET_ENABLE_SEND_FUNDS = 'true';
    jest.spyOn(configFunctions, 'loadConfig').mockImplementationOnce(() => config);
    jest.spyOn(configFunctions, 'loadWallets').mockImplementationOnce(() => wallets);
    jest.spyOn(walletWatcher, 'getNetworks').mockImplementationOnce(() => networks);

    const error = new Error('Unexpected error during runWalletWatcher');
    jest.spyOn(walletWatcher, 'runWalletWatcher').mockImplementation(() => {
      throw error;
    });
    await walletHandlers.walletWatcherHandler({});

    expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
      {
        message: `Wallet Watcher encountered an error after multiple tries: ${error}`,
        alias: 'serverless-wallet-watcher',
        description: (error as Error).stack,
      },
      config.opsGenieConfig
    );
    expect(sendOpsGenieHeartbeatSpy).toHaveBeenCalledWith('wallet-watcher', config.opsGenieConfig);
  });
});
