import { Config, Wallets } from '../../src/types';

export const buildConfig = (): Config => ({
  chains: {
    '31337': {
      rpc: 'http://127.0.0.1:8545/',
      name: 'hardhat',
    },
  },
  opsGenieConfig: {
    apiKey: 'opsgenie-api-key',
    responders: [
      {
        type: 'team',
        id: 'a uuid value',
        name: 'name',
      },
    ],
  },
});

export const buildWallets = (): Wallets => ({
  '31337': [
    {
      name: 'api3',
      walletType: 'Provider',
      monitorType: 'alert',
      address: '0xC26f10e1b37A1E7A7De266FeF0c19533489C3e75',
      providerXpub:
        'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
      lowThreshold: { value: 0.2, unit: 'ether', criticalValue: 0.1 },
    },
  ],
});
