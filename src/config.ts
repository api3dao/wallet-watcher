import fs from 'fs';
import { z } from 'zod';
import { configSchema, walletsSchema } from './types';

export const parseConfig = (config: unknown, schema: z.Schema) => {
  const parseRes = schema.safeParse(config);
  return parseRes;
};

export const readConfig = (configPath: string): unknown => {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse file. ${err}`);
  }
};

export const loadConfig = (configPath: string) => {
  const rawConfig = readConfig(configPath);
  const parsedConfigRes = parseConfig(rawConfig, configSchema);
  if (!parsedConfigRes.success) {
    throw new Error(`Invalid config.json file: ${parsedConfigRes.error}`);
  }

  const config = parsedConfigRes.data;
  return config;
};

export const loadWallets = (configPath: string) => {
  const rawConfig = readConfig(configPath);
  const parsedConfigRes = parseConfig(rawConfig, walletsSchema);
  if (!parsedConfigRes.success) {
    throw new Error(`Invalid wallets.json file: ${parsedConfigRes.error}`);
  }

  const config = parsedConfigRes.data;
  return config;
};
