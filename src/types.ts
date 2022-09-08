import { BigNumber, providers } from 'ethers';
import { WalletType } from '@api3/operations';
import { OpsGenieConfig, TelemetryChainConfig } from '@api3/operations-utilities';
import { config } from '@api3/airnode-validator';

export type ChainConfig = TelemetryChainConfig & {
  options: config.ChainOptions;
};

export type ChainsConfig = Record<string, ChainConfig>;

export interface WalletConfig {
  topUpMnemonic: string;
  opsGenieConfig: OpsGenieConfig;
  chains: ChainsConfig;
  explorerUrls: Record<string, string>;
}

export interface WalletStatus {
  address: string;
  balance: BigNumber;
  walletType: WalletType;
  chainName: string;
  provider: providers.StaticJsonRpcProvider;
}

export type ExtendedWalletWithMetadata = {
  chainName: string;
  providerXpub: string;
  sponsor: string;
  address?: string;
  walletType: 'Provider' | 'API3' | 'Provider-Sponsor' | 'API3-Sponsor';
};
