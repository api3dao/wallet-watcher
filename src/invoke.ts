import { promises } from '@api3/operations-utilities';
import { walletTasksHandler } from './handlers';

const functionMap: Record<string, Function> = {
  walletTasksHandler: walletTasksHandler,
};

const functionsToCall: string[] = process.env.FUNCTIONS?.split(',') || [];

const main = () =>
  promises.settleAndCheckForPromiseRejections(
    functionsToCall.map(async (name: string): Promise<any> => functionMap[name]({}))
  );

main();
