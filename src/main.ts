import 'source-map-support/register';
import { exit, settleAndCheckForPromiseRejections } from '@api3/operations-utilities';
import { walletWatcherHandler } from './handlers';

export const runAndHandleErrors = (fn: () => Promise<unknown>) => {
  fn()
    .then(() => {
      // defaults to a heartbeat which allows the serverless watcher to determine if the app ran
      exit();
    })
    .catch((e) => {
      console.trace('Wallet Watcher Error - Parent Scope', e.stack);
    });
};

const main = async () => {
  await settleAndCheckForPromiseRejections([walletWatcherHandler({} as any, {} as any, {} as any) as any]);
};

runAndHandleErrors(main);
