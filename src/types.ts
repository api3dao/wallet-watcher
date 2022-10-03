import { BigNumber, providers } from 'ethers';
import { OpsGenieConfig, TelemetryChainConfig } from '@api3/operations-utilities';
import { config } from '@api3/airnode-validator';

export type ChainConfig = TelemetryChainConfig & {
  options: config.ChainOptions;
};

export type ChainsConfig = Record<string, ChainConfig>;

export interface Config {
  topUpMnemonic: string;
  opsGenieConfig: OpsGenieConfig;
  chains: ChainsConfig;
  explorerUrls: Record<string, string>;
}

export interface WalletStatus extends Wallet {
  balance: BigNumber;
  chainName: string;
  chainId: string;
  provider: providers.StaticJsonRpcProvider;
}

type WalletType = 'Provider' | 'API3' | 'Provider-Sponsor' | 'API3-Sponsor' | 'Airseeker';

export interface Wallet {
  walletType: WalletType;
  providerXpub: string;
  sponsor: string;
  apiName?: string;
  address?: string;
}

export type Wallets = Record<string, Wallet[]>;
