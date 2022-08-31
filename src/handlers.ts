import 'source-map-support/register';
import path from 'path';
import fs from 'fs';
import { readOperationsRepository } from '@api3/operations/dist/utils/read-operations';
import { logging, opsGenie } from '@api3/operations-utilities/dist/index';
import { runWalletTasks } from './wallet-metrics';
import { WalletConfig } from './types';
import { go } from './promise-utils';

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
export const walletTasksHandler = async (_event: any = {}): Promise<any> => {
  console.log('Starting...');
  const startedAt = new Date();
  const walletConfig = getWalletConfig();
  await opsGenie.cacheOpenAlerts(walletConfig.opsGenieConfig);

  const [err] = await go(
    async () => {
      const opsConfig = readOperationsRepository();

      await runWalletTasks(walletConfig, opsConfig);
    },
    { timeoutMs: 120_000, retries: 3, retryDelayMs: 5_000 }
  );

  if (err) {
    await opsGenie.sendToOpsGenieLowLevel(
      {
        message: `Standalone wallet watcher encountered an error after multiple tries: ${err}`,
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
  console.log(`Wallet Tasks Handler: Run delta: ${(endedAt.getTime() - startedAt.getTime()) / 1000} s`);
};
