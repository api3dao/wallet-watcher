import 'source-map-support/register';
import path from 'path';
import fs from 'fs';
import { readOperationsRepository } from '@api3/operations/dist/utils/read-operations';
import { logging, opsGenie, promises } from '@api3/operations-utilities';
import { runWalletWatcher } from './wallet-watcher';
import { WalletConfig } from './types';

export const getWalletConfig = (): WalletConfig => {
  const configPath = path.join(__dirname, '../config/walletConfig.json');
  logging.debugLog('Config Path:', configPath, fs.readdirSync(path.join(__dirname, '..')));

  return JSON.parse(fs.readFileSync(configPath).toString('utf-8'));
};

/**
 * Tops up wallets
 *
 * @param _event
 */
export const walletWatcherHandler = async (_event: any = {}): Promise<any> => {
  logging.log('Starting Wallet Watcher');
  const startedAt = new Date();
  const walletConfig = getWalletConfig();
  await opsGenie.cacheOpenAlerts(walletConfig.opsGenieConfig);

  const [err] = await promises.go(() => runWalletWatcher(walletConfig, readOperationsRepository()), {
    timeoutMs: 120_000,
    retries: 3,
    retryDelayMs: 5_000,
  });

  if (err) {
    await opsGenie.sendToOpsGenieLowLevel(
      {
        message: `Wallet Watcher encountered an error after multiple tries: ${err}`,
        alias: 'serverless-wallet-watcher',
        description: (err as Error).stack,
      },
      walletConfig.opsGenieConfig
    );
  } else {
    await opsGenie.closeOpsGenieAlertWithAlias('serverless-wallet-watcher', walletConfig.opsGenieConfig);
  }

  await opsGenie.sendOpsGenieHeartbeat('wallet-watcher', walletConfig.opsGenieConfig);

  const endedAt = new Date();
  logging.log(`Wallet Watcher run delta: ${(endedAt.getTime() - startedAt.getTime()) / 1000} s`);
};
