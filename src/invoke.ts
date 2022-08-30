import { walletTasksHandler } from './handlers';
import { settleAndCheckForPromiseRejections } from './promise-utils';

const functionMap: Record<string, Function> = {
  walletTasksHandler: walletTasksHandler,
};

const functionsToCall: string[] = process.env.FUNCTIONS?.split(',') || [];

const main = () =>
  settleAndCheckForPromiseRejections(functionsToCall.map(async (name: string): Promise<any> => functionMap[name]({})));

main();
