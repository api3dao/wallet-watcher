import { OperationsRepository } from '@api3/operations';
import { readOperationsRepository } from '@api3/operations/dist/utils/read-operations';
import { OpsGenieConfig, ChainsConfig } from './types';
import { sendToOpsGenieLowLevel } from './opsgenie-utils';
import { logTrace } from './logging';

export const getGlobalProvider = async (chains: ChainsConfig, opsGenieConfig: OpsGenieConfig, id: string) => {
  if (chains[id]) {
    return chains[id].rpc;
  }

  await sendToOpsGenieLowLevel(
    {
      message: `No provider found for chain id ${id}`,
      alias: `no-provider-found-${id}`,
      description: `No provider found for this chain ID, please check the config/walletConfig.json file`,
      priority: 'P2',
    },
    opsGenieConfig
  );
  return '';
};

export const resolveChainId = async (
  chainName: string,
  operationsRepository?: OperationsRepository
): Promise<string | null> => {
  const operations = operationsRepository ?? readOperationsRepository();

  const chainId = Object.values(operations.chains).find((chain) => chain.name === chainName)?.id;

  if (chainId) {
    return chainId;
  }

  await sendToOpsGenieLowLevel({
    message: 'Invalid or unknown chain',
    alias: 'invalid-chain-name-resolveChainId',
    description: `Please check the config and/or resolveChainId function: ${chainName}`,
    priority: 'P2',
  });
  return null;
};

export const resolveChainName = async (
  chainId: string,
  operationsRepository?: OperationsRepository
): Promise<string | null> => {
  const operations = operationsRepository ?? readOperationsRepository();

  const chainName = Object.values(operations.chains).find((chain) => chain.id === chainId)?.name;

  if (chainName) {
    return chainName;
  }

  await sendToOpsGenieLowLevel({
    message: 'Invalid or unknown chain',
    alias: 'invalid-chain-id-resolveChainName',
    description: `Please check the config and/or resolveChainName function: ${chainId}`,
    priority: 'P2',
  });
  return null;
};

export const resolveExplorerUrlByName = async (explorerUrls: Record<string, string>, chainName: string) => {
  const chainId = await resolveChainId(chainName);

  const explorerUrl = explorerUrls[chainId as string];

  if (chainId && !explorerUrl) {
    logTrace(`Unable to find explorer URL for chain: ${await resolveChainName(chainId)}`);
  }

  return explorerUrl;
};
