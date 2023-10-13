import { ethers } from 'ethers';
import { z } from 'zod';

export const evmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

export const chainConfigSchema = z
  .object({
    rpc: z.string(),
    name: z.string(),
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
    opsGenieConfig: opsGenieConfigSchema,
    chains: chainsConfigSchema,
  })
  .strict();

export const walletTypeSchema = z.union([
  z.literal('Provider'),
  z.literal('API3'),
  z.literal('Provider-Sponsor'),
  z.literal('API3-Sponsor'),
  z.literal('Airseeker'),
  z.literal('Monitor'),
]);

export const monitorTypeSchema = z.union([z.literal('alert'), z.literal('monitor')]);

export const namedUnits = z.union([
  z.literal('wei'),
  z.literal('kwei'),
  z.literal('mwei'),
  z.literal('gwei'),
  z.literal('szabo'),
  z.literal('finney'),
  z.literal('ether'),
]);

const baseWalletSchema = z.object({
  monitorType: monitorTypeSchema,
  name: z.string(),
  lowThreshold: z
    .object({
      value: z.number().positive(),
      unit: namedUnits,
      criticalValue: z.number().positive().optional(),
    })
    .refine(
      ({ value, criticalValue }) => {
        return criticalValue === undefined || criticalValue < value;
      },
      { message: 'Critical value must be lower than value' }
    ),
});

const providerWalletSchema = baseWalletSchema.extend({
  walletType: z.literal('Provider'),
  address: evmAddressSchema,
  providerXpub: z.string(),
});

const api3WalletSchema = baseWalletSchema.extend({
  walletType: z.literal('API3'),
  address: evmAddressSchema,
});

const providerSponsorWalletSchema = baseWalletSchema.extend({
  walletType: z.literal('Provider-Sponsor'),
  sponsor: evmAddressSchema,
  providerXpub: z.string(),
});

const api3SponsorWalletSchema = baseWalletSchema.extend({
  walletType: z.literal('API3-Sponsor'),
  sponsor: evmAddressSchema,
  providerXpub: z.string(),
});

const airseekerSponsorWalletSchema = baseWalletSchema.extend({
  walletType: z.literal('Airseeker'),
  sponsor: evmAddressSchema,
  providerXpub: z.string(),
});

export const monitorWalletSchema = baseWalletSchema.extend({
  walletType: z.literal('Monitor'),
  address: evmAddressSchema,
});

export const walletSchema = z.discriminatedUnion('walletType', [
  providerWalletSchema,
  api3WalletSchema,
  providerSponsorWalletSchema,
  api3SponsorWalletSchema,
  airseekerSponsorWalletSchema,
  monitorWalletSchema,
]);

export const walletsSchema = z.record(z.string(), z.array(walletSchema));

export type ChainConfig = z.infer<typeof chainConfigSchema>;
export type ChainsConfig = z.infer<typeof chainsConfigSchema>;
export type Config = z.infer<typeof configSchema>;
export type Wallet = z.infer<typeof walletSchema>;
export type Wallets = z.infer<typeof walletsSchema>;
export type WalletType = z.infer<typeof walletTypeSchema>;
export type EvmAddress = z.infer<typeof evmAddressSchema>;

export type ChainState = ChainConfig & {
  chainName: string;
  provider: ethers.providers.StaticJsonRpcProvider;
};
export type ChainStates = Record<string, ChainState>;
