import path from 'path';
import { cacheOpenAlerts, log, sendOpsGenieHeartbeat, sendToOpsGenieLowLevel } from '@api3/operations-utilities';
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

  try {
    const config = loadConfig(path.join(__dirname, '../config/config.json'));
    const wallets = loadWallets(path.join(__dirname, '../config/wallets.json'));

    await cacheOpenAlerts(config.opsGenieConfig);
    await runWalletWatcher(config, wallets);
    await sendOpsGenieHeartbeat('wallet-watcher');
  } catch (err) {
    const error = err as Error;
    await sendToOpsGenieLowLevel({
      message: `Serverless wallet watcher encountered an error: ${error.message}`,
      alias: 'serverless-wallet-watcher-error',
      description: error.stack,
    });
  }

  const endedAt = new Date();
  log(`Wallet Watcher run delta: ${(endedAt.getTime() - startedAt.getTime()) / 1000}s`);
};
