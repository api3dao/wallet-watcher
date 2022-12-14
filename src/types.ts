import { z } from 'zod';
import { BigNumber, providers } from 'ethers';
import { NonceManager } from '@ethersproject/experimental';
import { config } from '@api3/airnode-validator';

export const chainConfigSchema = z
  .object({
    rpc: z.string(),
    topUpAmount: z.string(),
    lowBalance: z.string(),
    globalSponsorLowBalanceWarn: z.string(),
    options: config.chainOptionsSchema,
  })
  .strict();

export const chainsConfigSchema = z.record(z.string(), chainConfigSchema);

export const opsGenieResponderSchema = z.object({
  type: z.union([z.literal('team'), z.literal('user'), z.literal('escalation'), z.literal('schedule')]),
  name: z.string().optional(),
  id: z.string().optional(),
});

export const opsGenieConfigSchema = z.object({
  apiKey: z.string(),
  responders: z.array(opsGenieResponderSchema),
});

export const configSchema = z
  .object({
    topUpMnemonic: z.string(),
    opsGenieConfig: opsGenieConfigSchema,
    chains: chainsConfigSchema,
    explorerUrls: z.record(z.string(), z.string()),
  })
  .strict();

export const walletTypeSchema = z.union([
  z.literal('Provider'),
  z.literal('API3'),
  z.literal('Provider-Sponsor'),
  z.literal('API3-Sponsor'),
  z.literal('Airseeker'),
]);

const providerWalletSchema = z.object({
  walletType: z.literal('Provider'),
  address: config.evmAddressSchema,
  providerXpub: z.string(),
  apiName: z.string().optional(),
});

const api3WalletSchema = z.object({
  walletType: z.literal('API3'),
  address: config.evmAddressSchema,
  apiName: z.string().optional(),
});

const providerSponsorWalletSchema = z.object({
  walletType: z.literal('Provider-Sponsor'),
  sponsor: config.evmAddressSchema,
  providerXpub: z.string(),
  apiName: z.string().optional(),
});

const api3SponsorWalletSchema = z.object({
  walletType: z.literal('API3-Sponsor'),
  sponsor: config.evmAddressSchema,
  providerXpub: z.string(),
  apiName: z.string().optional(),
});

const airseekerSponsorWalletSchema = z.object({
  walletType: z.literal('Airseeker'),
  sponsor: config.evmAddressSchema,
  providerXpub: z.string(),
  apiName: z.string().optional(),
});

export const walletSchema = z.discriminatedUnion('walletType', [
  providerWalletSchema,
  api3WalletSchema,
  providerSponsorWalletSchema,
  api3SponsorWalletSchema,
  airseekerSponsorWalletSchema,
]);

export const walletsSchema = z.record(z.string(), z.array(walletSchema));

export type WalletStatus = Wallet & {
  balance: BigNumber;
  chainName: string;
  chainId: string;
  provider: providers.StaticJsonRpcProvider;
  address: EvmAddress;
};

export type GlobalSponsor = ChainConfig & { sponsor: NonceManager; chainId: string };

export type ChainConfig = z.infer<typeof chainConfigSchema>;
export type ChainsConfig = z.infer<typeof chainsConfigSchema>;
export type Config = z.infer<typeof configSchema>;
export type Wallet = z.infer<typeof walletSchema>;
export type Wallets = z.infer<typeof walletsSchema>;
export type EvmAddress = z.infer<typeof config.evmAddressSchema>;
