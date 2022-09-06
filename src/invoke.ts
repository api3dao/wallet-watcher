import { promises } from '@api3/operations-utilities';
import { walletWatcherHandler } from './handlers';

const functionMap: Record<string, Function> = {
  walletWatcherHandler: walletWatcherHandler,
};

const functionsToCall: string[] = process.env.FUNCTIONS?.split(',') || [];

const main = () =>
  promises.settleAndCheckForPromiseRejections(
    functionsToCall.map(async (name: string): Promise<any> => functionMap[name]({}))
  );

main();
