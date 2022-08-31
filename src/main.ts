import 'source-map-support/register';
import { promises } from '@api3/operations-utilities/dist/index';
import { exit } from './utils';
import { walletTasksHandler } from './handlers';

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
  await promises.settleAndCheckForPromiseRejections([walletTasksHandler({})]);
};

runAndHandleErrors(main);
