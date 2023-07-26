import { mockReadFileSync } from '../test/mock-utils';
import path from 'path';
import { z } from 'zod';
import { goSync, assertGoSuccess, assertGoError } from '@api3/promise-utils';
import { loadConfig, loadWallets } from './config';
import * as fixtures from '../test/fixtures';

describe('config.json', () => {
  const config = fixtures.buildConfig();

  it('accepts valid config', () => {
    const goParse = goSync(() => loadConfig(path.join(__dirname, '../config/config.example.json')));
    assertGoSuccess(goParse);
    expect(goParse.success).toEqual(true);
  });

  it('throws on missing chain configurations', () => {
    const { chains: _chains, ...invalidConfig } = config;
    mockReadFileSync('config.example.json', JSON.stringify(invalidConfig));
    const goParse = goSync(() => loadConfig(path.join(__dirname, '../config/config.example.json')));
    assertGoError(goParse);
    expect(goParse.success).toEqual(false);
    expect(goParse.error.message).toEqual(
      `Invalid config.json file: ${new z.ZodError([
        { code: 'invalid_type', expected: 'object', received: 'undefined', path: ['chains'], message: 'Required' },
      ])}`
    );
  });

  it('throws on missing chain fields', () => {
    const invalidConfigOnce = { ...config, chains: { '31337': {} } };
    mockReadFileSync('config.example.json', JSON.stringify(invalidConfigOnce));
    const goParse = goSync(() => loadConfig(path.join(__dirname, '../config/config.example.json')));
    assertGoError(goParse);
    expect(goParse.success).toEqual(false);
    expect(goParse.error.message).toEqual(
      `Invalid config.json file: ${new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'undefined',
          path: ['chains', '31337', 'rpc'],
          message: 'Required',
        },
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'undefined',
          path: ['chains', '31337', 'name'],
          message: 'Required',
        },
      ])}`
    );
  });
});

describe('wallets.json', () => {
  it('accepts valid wallets', () => {
    const goParse = goSync(() => loadWallets(path.join(__dirname, '../config/wallets.example.json')));
    assertGoSuccess(goParse);
    expect(goParse.success).toEqual(true);
  });

  it('throws on missing address', () => {
    const invalidWallets = {
      1: [
        {
          apiName: 'api3',
          walletType: 'Provider',
          providerXpub:
            'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
          lowThreshold: { value: 0.2, unit: 'ether' },
        },
      ],
    };
    mockReadFileSync('wallets.example.json', JSON.stringify(invalidWallets));
    const goParse = goSync(() => loadWallets(path.join(__dirname, '../config/wallets.example.json')));
    assertGoError(goParse);
    expect(goParse.success).toEqual(false);
    expect(goParse.error.message).toEqual(
      `Invalid wallets.json file: ${new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'undefined',
          path: ['1', 0, 'address'],
          message: 'Required',
        },
      ])}`
    );
  });

  it('throws on missing sponsor', () => {
    const invalidWallets = {
      1: [
        {
          apiName: 'api3',
          walletType: 'Provider-Sponsor',
          providerXpub:
            'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
          lowThreshold: { value: 0.2, unit: 'ether' },
        },
      ],
    };
    mockReadFileSync('wallets.example.json', JSON.stringify(invalidWallets));
    const goParse = goSync(() => loadWallets(path.join(__dirname, '../config/wallets.example.json')));
    assertGoError(goParse);
    expect(goParse.success).toEqual(false);
    expect(goParse.error.message).toEqual(
      `Invalid wallets.json file: ${new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'undefined',
          path: ['1', 0, 'sponsor'],
          message: 'Required',
        },
      ])}`
    );
  });

  it('throws on missing providerXpub', () => {
    const invalidWallets = {
      1: [
        {
          apiName: 'api3',
          walletType: 'Provider-Sponsor',
          sponsor: '0x9fEe9F24ab79adacbB51af82fb82CFb9D818c6d9',
          lowThreshold: { value: 0.2, unit: 'ether' },
        },
      ],
    };
    mockReadFileSync('wallets.example.json', JSON.stringify(invalidWallets));
    const goParse = goSync(() => loadWallets(path.join(__dirname, '../config/wallets.example.json')));
    assertGoError(goParse);
    expect(goParse.success).toEqual(false);
    expect(goParse.error.message).toEqual(
      `Invalid wallets.json file: ${new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'undefined',
          path: ['1', 0, 'providerXpub'],
          message: 'Required',
        },
      ])}`
    );
  });

  it('throws on missing lowThreshold', () => {
    const invalidWallets = {
      1: [
        {
          apiName: 'api3',
          walletType: 'API3',
          address: '0x9fEe9F24ab79adacbB51af82fb82CFb9D818c6d9',
        },
      ],
    };
    mockReadFileSync('wallets.example.json', JSON.stringify(invalidWallets));
    const goParse = goSync(() => loadWallets(path.join(__dirname, '../config/wallets.example.json')));
    assertGoError(goParse);
    expect(goParse.success).toEqual(false);
    expect(goParse.error.message).toEqual(
      `Invalid wallets.json file: ${new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'object',
          received: 'undefined',
          path: ['1', 0, 'lowThreshold'],
          message: 'Required',
        },
      ])}`
    );
  });

  it('throws on invalid lowThreshold', () => {
    const invalidWallets = {
      1: [
        {
          apiName: 'api3',
          walletType: 'API3',
          address: '0x9fEe9F24ab79adacbB51af82fb82CFb9D818c6d9',
          lowThreshold: { value: '0.2', unit: 'satoshi', criticalValue: '0.1' },
        },
      ],
    };
    mockReadFileSync('wallets.example.json', JSON.stringify(invalidWallets));
    const goParse = goSync(() => loadWallets(path.join(__dirname, '../config/wallets.example.json')));
    assertGoError(goParse);
    expect(goParse.success).toEqual(false);
    expect(goParse.error.message).toEqual(
      `Invalid wallets.json file: ${new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'number',
          received: 'string',
          path: ['1', 0, 'lowThreshold', 'value'],
          message: 'Expected number, received string',
        },
        {
          code: 'invalid_union',
          unionErrors: [
            {
              issues: [
                {
                  received: 'satoshi',
                  code: 'invalid_literal',
                  expected: 'wei',
                  path: ['1', 0, 'lowThreshold', 'unit'],
                  message: 'Invalid literal value, expected "wei"',
                },
              ],
              name: 'ZodError',
            },
            {
              issues: [
                {
                  received: 'satoshi',
                  code: 'invalid_literal',
                  expected: 'kwei',
                  path: ['1', 0, 'lowThreshold', 'unit'],
                  message: 'Invalid literal value, expected "kwei"',
                },
              ],
              name: 'ZodError',
            },
            {
              issues: [
                {
                  received: 'satoshi',
                  code: 'invalid_literal',
                  expected: 'mwei',
                  path: ['1', 0, 'lowThreshold', 'unit'],
                  message: 'Invalid literal value, expected "mwei"',
                },
              ],
              name: 'ZodError',
            },
            {
              issues: [
                {
                  received: 'satoshi',
                  code: 'invalid_literal',
                  expected: 'gwei',
                  path: ['1', 0, 'lowThreshold', 'unit'],
                  message: 'Invalid literal value, expected "gwei"',
                },
              ],
              name: 'ZodError',
            },
            {
              issues: [
                {
                  received: 'satoshi',
                  code: 'invalid_literal',
                  expected: 'szabo',
                  path: ['1', 0, 'lowThreshold', 'unit'],
                  message: 'Invalid literal value, expected "szabo"',
                },
              ],
              name: 'ZodError',
            },
            {
              issues: [
                {
                  received: 'satoshi',
                  code: 'invalid_literal',
                  expected: 'finney',
                  path: ['1', 0, 'lowThreshold', 'unit'],
                  message: 'Invalid literal value, expected "finney"',
                },
              ],
              name: 'ZodError',
            },
            {
              issues: [
                {
                  received: 'satoshi',
                  code: 'invalid_literal',
                  expected: 'ether',
                  path: ['1', 0, 'lowThreshold', 'unit'],
                  message: 'Invalid literal value, expected "ether"',
                },
              ],
              name: 'ZodError',
            } as any,
          ],
          path: ['1', 0, 'lowThreshold', 'unit'],
          message: 'Invalid input',
        },
        {
          code: 'invalid_type',
          expected: 'number',
          received: 'string',
          path: ['1', 0, 'lowThreshold', 'criticalValue'],
          message: 'Expected number, received string',
        },
      ])}`
    );
  });

  it('throws on missing walletType', () => {
    const invalidWallets = {
      1: [
        {
          apiName: 'api3',
          sponsor: '0x9fEe9F24ab79adacbB51af82fb82CFb9D818c6d9',
          providerXpub:
            'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
        },
      ],
    };
    mockReadFileSync('wallets.example.json', JSON.stringify(invalidWallets));
    const goParse = goSync(() => loadWallets(path.join(__dirname, '../config/wallets.example.json')));
    assertGoError(goParse);
    expect(goParse.success).toEqual(false);
    expect(goParse.error.message).toEqual(
      `Invalid wallets.json file: ${new z.ZodError([
        {
          code: 'invalid_union_discriminator',
          options: ['Provider', 'API3', 'Provider-Sponsor', 'API3-Sponsor', 'Airseeker'],
          path: ['1', 0, 'walletType'],
          message:
            "Invalid discriminator value. Expected 'Provider' | 'API3' | 'Provider-Sponsor' | 'API3-Sponsor' | 'Airseeker'",
        },
      ])}`
    );
  });

  it('throws on invalid walletType', () => {
    const invalidWallets = {
      1: [
        {
          walletType: 'invalid',
          apiName: 'api3',
          sponsor: '0x9fEe9F24ab79adacbB51af82fb82CFb9D818c6d9',
          providerXpub:
            'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
        },
      ],
    };
    mockReadFileSync('wallets.example.json', JSON.stringify(invalidWallets));
    const goParse = goSync(() => loadWallets(path.join(__dirname, '../config/wallets.example.json')));
    assertGoError(goParse);
    expect(goParse.success).toEqual(false);
    expect(goParse.error.message).toEqual(
      `Invalid wallets.json file: ${new z.ZodError([
        {
          code: 'invalid_union_discriminator',
          options: ['Provider', 'API3', 'Provider-Sponsor', 'API3-Sponsor', 'Airseeker'],
          path: ['1', 0, 'walletType'],
          message:
            "Invalid discriminator value. Expected 'Provider' | 'API3' | 'Provider-Sponsor' | 'API3-Sponsor' | 'Airseeker'",
        },
      ])}`
    );
  });
});
