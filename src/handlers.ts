import 'source-map-support/register';
import path from 'path';
import fs from 'fs';
import { logging, opsGenie } from '@api3/operations-utilities';
import { go } from '@api3/promise-utils';
import { runWalletWatcher } from './wallet-watcher';
import { Config, Wallets } from './types';

export const loadConfig = (): Config => {
  const configPath = path.join(__dirname, '../config/config.json');
  logging.debugLog('Reading file at path:', configPath);

  return JSON.parse(fs.readFileSync(configPath).toString('utf-8'));
};

export const loadWallets = (): Wallets => {
  const configPath = path.join(__dirname, '../config/wallets.json');
  logging.debugLog('Reading file at path:', configPath);

  return JSON.parse(fs.readFileSync(configPath).toString('utf-8'));
};

/**
 * Check wallet balances and tops up those below the threshold
 *
 * @param _event
 */
export const walletWatcherHandler = async (_event: any = {}) => {
  logging.log('Starting Wallet Watcher');
  const startedAt = new Date();
  const config = loadConfig();
  const wallets = loadWallets();
  await opsGenie.cacheOpenAlerts(config.opsGenieConfig);

  const goResult = await go(() => runWalletWatcher(config, wallets), {
    totalTimeoutMs: 120_000,
    retries: 3,
    delay: { type: 'static', delayMs: 5_000 },
  });

  if (!goResult.success) {
    await opsGenie.sendToOpsGenieLowLevel(
      {
        message: `Wallet Watcher encountered an error after multiple tries: ${goResult.error}`,
        alias: 'serverless-wallet-watcher',
        description: goResult.error.stack,
      },
      config.opsGenieConfig
    );
  } else {
    await opsGenie.closeOpsGenieAlertWithAlias('serverless-wallet-watcher', config.opsGenieConfig);
  }

  await opsGenie.sendOpsGenieHeartbeat('wallet-watcher', config.opsGenieConfig);

  const endedAt = new Date();
  logging.log(`Wallet Watcher run delta: ${(endedAt.getTime() - startedAt.getTime()) / 1000}s`);
};
