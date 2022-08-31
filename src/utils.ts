import path, { join } from 'path';
import fs, { readdirSync, readFileSync } from 'fs';
import axios from 'axios';
import { parseUnits } from 'ethers/lib/utils';
import { keyBy } from 'lodash';
import { logging } from '@api3/operations-utilities/dist';
import { EthValue, GlobalConfig, NodeConfig, ErrorConditions, ErrorStatus, HealthResponse, Node } from './types';

export const doTimeout = (interval: number) => new Promise((resolve) => setTimeout(() => resolve(null), interval));

export const convertEtherValue = (input: EthValue) => parseUnits(`${input.amount}`, input.units);

export const exit = (code = 0) => {
  logging.log(`Exiting, code: ${code}`);
  process.exit(code);
};

export const getGlobalConfig = (): GlobalConfig => {
  const configPath = path.join(__dirname, '../config/walletConfig.json');
  logging.debugLog('Config Path:', configPath, fs.readdirSync(path.join(__dirname, '..')));

  return JSON.parse(fs.readFileSync(configPath).toString('utf-8'));
};

export const isCloudFunction = () => process.env.LAMBDA_TASK_ROOT || process.env.FUNCTION_TARGET;

export const readJsonFile = (filePath: string) => JSON.parse(readFileSync(filePath).toString('utf8'));

export const readJsonDirectoryAsArray = (directoryPath: string): FilePayload[] =>
  readdirSync(directoryPath).map((filename) => ({
    ...readJsonFile(join(directoryPath, filename)),
    filename,
  }));

interface FilePayload {
  readonly filename: string;
}

export const readJsonDirectoryAsObject = (directoryPath: string): Record<string, {}> =>
  keyBy(readJsonDirectoryAsArray(directoryPath), 'filename');

export const getNodeConfig = (): NodeConfig =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '../config/nodeConfig.json')).toString('utf-8'));

export const getBlockNumber = async (node: Node): Promise<HealthResponse> => {
  const healthResponse: HealthResponse = {
    providerName: node.name,
    status: ErrorStatus.OK,
    condition: ErrorConditions.HEALTHY,
    blockNumber: 0,
  };
  const method = 'eth_blockNumber';
  try {
    const { data } = await axios.post(node.url, { jsonrpc: '2.0', id: 1, method, params: [] }, { timeout: 10_000 });

    return {
      ...healthResponse,
      blockNumber: hexToDec(data.result),
    };
  } catch (err) {
    return {
      ...healthResponse,
      status: ErrorStatus.ERROR,
      condition: ErrorConditions.NO_RESPONSE,
    };
  }
};

export const hexToDec = (resultString: number | string) =>
  typeof resultString === 'number' ? resultString : parseInt(resultString, 16);

export const updateHealthResponse = (
  hr: HealthResponse,
  refBlockNumber: number,
  chain: string,
  deltaThreshold: number
): HealthResponse => {
  if (hr.condition === ErrorConditions.NO_RESPONSE) return { ...hr, refBlockNumber: refBlockNumber, chainName: chain };

  const delta = refBlockNumber - hr.blockNumber;
  const nodeIsNotSynced = Boolean(Math.max(0, Math.abs(delta) - deltaThreshold));

  if (nodeIsNotSynced) {
    return {
      ...hr,
      status: ErrorStatus.ERROR,
      condition: ErrorConditions.NOT_SYNCHRONIZED,
      delta: delta,
      refBlockNumber: refBlockNumber,
      chainName: chain,
    };
  }

  return {
    ...hr,
    delta: delta,
    refBlockNumber: refBlockNumber,
    chainName: chain,
  };
};

/**
 * Prints out Node's memory usage in MB
 */
export const prettyPrintMemoryUsage = () => {
  const usage = Object.fromEntries(
    Object.entries(process.memoryUsage()).map(([key, value]) => [key, `${value / 1024 / 1024}`])
  );

  logging.debugLog(usage);
};
