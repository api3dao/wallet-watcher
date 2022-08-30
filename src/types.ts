import { BigNumber } from 'ethers';
import * as node from '@api3/airnode-node';
import { Api, Beacon, OperationsRepository, WalletType, ExtendedChainDescription } from '@api3/operations';
import { NonceManager } from '@ethersproject/experimental';

export interface WalletConfig {
  topUpMnemonic: string;
  opsGenieConfig: OpsGenieConfig;
  chains: ChainsConfig;
  explorerUrls: Record<string, string>;
}

export type GlobalSponsors = ({
  chainId: string;
  sponsor: NonceManager;
} & ChainConfig)[];

export enum Metric {
  API_READ_LATENCY = 'API Read Latency',
  API_LIVENESS = 'API Liveness',
  API_VALUE = 'API Value',
  BEACON_LIVE = 'Beacon Live',
  BEACON_READ_LATENCY = 'Beacon Read Latency',
  BEACON_VALUE = 'Beacon Value',
  BEACON_OUTSTANDING_REQUEST_LATENESS = 'Beacon Outstanding Request Lateness',
  FAILED_FULFILMENTS = 'Failed Fulfilments',
  API_BEACON_DEVIATION = 'API Beacon Deviation',
  BEACON_LAST_UPDATED_DELTA = 'Beacon Last Updated Delta',
  WALLET_BALANCE = 'Wallet Balance',
  GLOBAL_SPONSOR_BALANCE = 'Global Sponsor Balance',
  BACKTEST_DEVIATION = 'Backtest Deviation',
}

export type OpsGeniePriority = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export interface OpsGenieMessage {
  message: string;
  alias: string;
  description?: string;
  priority?: OpsGeniePriority;
  details?: Record<string, string>;
}

export interface OpsGenieListAlertsResponse {
  id: string;
  alias: string;
}

// As per https://docs.opsgenie.com/docs/alert-api
export interface OpsGenieResponder {
  type: 'team' | 'user' | 'escalation' | 'schedule';
  name?: string;
  id?: string;
}

export interface OpsGenieConfig {
  apiKey: string;
  responders: OpsGenieResponder[];
}

export type GlobalSponsor = {
  chainId: string;
  sponsor: NonceManager;
} & ChainConfig;

export interface HttpGetSource {
  pair: string;
  url: string;
  path: string;
  secrets?: string;
}

export interface ChainOptions {
  txType?: 'legacy' | 'eip1559';
  legacyMultiplier?: number;
}

export interface ChainConfig {
  rpc: string;
  topUpAmount?: string;
  lowBalance?: string;
  globalSponsorLowBalanceWarn?: string;
  options: ChainOptions;
}

export type ChainsConfig = Record<string, ChainConfig>;

export interface GlobalConfig {
  chains: ChainsConfig;
  topUpMnemonic: string;
  apiCredentials: node.ApiCredentials[];
  opsGenieConfig: OpsGenieConfig;
  gitUsername: string;
  gitToken: string;
  gitBranch: string;
  tickers: { binance: string[]; httpGet: HttpGetSource[] };
  monitoringResources: { url: string; expectedStatusCode: number }[];
  maxBatchSize: number;
  explorerUrls: Record<string, string>;
  deviationAlertMultiplier: number;
  beaconStalenessTimeSeconds: number;
  collectorLoopDuration?: number;
  minimumPeriodPerCall?: number;
}

export interface OutputMetric {
  logToDb?: boolean;
  metricName: Metric;
  value: BigNumber | number | null | undefined;
  metadata?: any;
}

export interface CommonChainProps {
  globalConfig: GlobalConfig;
  config: OperationsRepository;
  api: Api;
  beacon: Beacon;
  apiCredentials?: node.ApiCredentials[];
  distribute: (output: OutputMetric) => Promise<any>;
}

export type ExtendedWalletWithMetadata = {
  chainName: string;
  providerXpub: string;
  sponsor: string;
  address?: string | undefined;
  walletType: 'Provider' | 'API3' | 'Provider-Sponsor' | 'API3-Sponsor';
};

export type ExtendedChainDescriptionWithName = ExtendedChainDescription & { name: string };

export interface WalletStatus {
  address: string;
  balance: BigNumber;
  walletType: WalletType;
  chainName: string;
}

export interface EthValue {
  amount: number;
  units: 'wei' | 'kwei' | 'mwei' | 'gwei' | 'szabo' | 'finney' | 'ether';
}

export enum ErrorConditions {
  HEALTHY = 'HEALTHY',
  OFFLINE = 'OFFLINE',
  NO_RESPONSE = 'NO_RESPONSE',
  NOT_SYNCHRONIZED = 'NOT_SYNCHRONIZED',
  REF_NO_RESPONSE = 'REF_NO_RESPONSE',
  PENDING = 'PENDING',
}

export enum ErrorStatus {
  ERROR = 'ERROR',
  OK = 'OK',
  INFO = 'INFO',
  WARNING = 'WARNING',
  PENDING = 'PENDING',
}

export interface HealthResponse {
  chainName?: string;
  providerName: string;
  status: ErrorStatus;
  condition?: ErrorConditions;
  delta?: number;
  blockNumber: number;
  refBlockNumber?: number;
}

export interface Node {
  name: string;
  url: string;
}

export interface Chain {
  testNodes: Node[];
}

export interface NodeConfig {
  deltaThreshold: number;
  chains: Record<string, Chain>;
}
