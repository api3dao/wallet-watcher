import { BigNumber } from 'ethers';
import { WalletType } from '@api3/operations';
import { OpsGenieConfig, TelemetryChainConfig } from '@api3/operations-utilities';

export interface WalletConfig {
  topUpMnemonic: string;
  opsGenieConfig: OpsGenieConfig;
  chains: Record<string, TelemetryChainConfig>;
  explorerUrls: Record<string, string>;
}

export interface WalletStatus {
  address: string;
  balance: BigNumber;
  walletType: WalletType;
  chainName: string;
}

export type ExtendedWalletWithMetadata = {
  chainName: string;
  providerXpub: string;
  sponsor: string;
  address?: string;
  walletType: 'Provider' | 'API3' | 'Provider-Sponsor' | 'API3-Sponsor';
};
