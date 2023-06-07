import path from 'path';
import {
  cacheOpenAlerts,
  closeOpsGenieAlertWithAlias,
  log,
  sendOpsGenieHeartbeat,
  sendToOpsGenieLowLevel,
} from '@api3/operations-utilities';
import { go } from '@api3/promise-utils';
import { Context, ScheduledEvent, ScheduledHandler } from 'aws-lambda';
import 'source-map-support/register';
import { loadConfig, loadWallets } from './config';
import { runWalletWatcher } from './wallet-watcher';

/**
 * Check wallet balances and tops up those below the threshold
 *
 * @param _event
 */
export const walletWatcherHandler: ScheduledHandler = async (
  _event: ScheduledEvent,
  _context: Context
): Promise<void> => {
  log('Starting Wallet Watcher');
  const startedAt = new Date();
  const config = loadConfig(path.join(__dirname, '../config/config.json'));
  const wallets = loadWallets(path.join(__dirname, '../config/wallets.json'));
  await cacheOpenAlerts(config.opsGenieConfig);

  const goResult = await go(() => runWalletWatcher(config, wallets), {
    totalTimeoutMs: 120_000,
    retries: 3,
    delay: { type: 'static', delayMs: 5_000 },
  });

  if (!goResult.success) {
    await sendToOpsGenieLowLevel(
      {
        message: `Wallet Watcher encountered an error after multiple tries: ${goResult.error}`,
        alias: 'serverless-wallet-watcher',
        description: goResult.error.stack,
      },
      config.opsGenieConfig
    );
  } else {
    await closeOpsGenieAlertWithAlias('serverless-wallet-watcher', config.opsGenieConfig);
  }

  await sendOpsGenieHeartbeat('wallet-watcher', config.opsGenieConfig);

  const endedAt = new Date();
  log(`Wallet Watcher run delta: ${(endedAt.getTime() - startedAt.getTime()) / 1000}s`);
};
