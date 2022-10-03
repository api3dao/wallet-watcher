import { Config, Wallets } from '../../src/types';

export const buildConfig = (): Config => ({
  chains: {
    '31337': {
      rpc: 'http://127.0.0.1:8545/',
      topUpAmount: '0.1',
      lowBalance: '0.2',
      globalSponsorLowBalanceWarn: '3',
      options: {
        fulfillmentGasLimit: 123456, // The wallet-watcher doesn't currently use this but it is required in the ChainOptions type
        gasPriceOracle: [
          {
            gasPriceStrategy: 'latestBlockPercentileGasPrice',
            percentile: 60,
            minTransactionCount: 20,
            pastToCompareInBlocks: 20,
            maxDeviationMultiplier: 2,
          },
          {
            gasPriceStrategy: 'providerRecommendedGasPrice',
            recommendedGasPriceMultiplier: 1.2,
          },
          {
            gasPriceStrategy: 'constantGasPrice',
            gasPrice: {
              value: 10,
              unit: 'gwei',
            },
          },
        ],
      },
    },
  },
  topUpMnemonic: 'test test test test test test test test test test test junk',
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
  explorerUrls: {
    '31337': 'https://explorer.test.com/',
  },
});

export const buildWallets = (): Wallets => ({
  '31337': [
    {
      apiName: 'api3',
      walletType: 'Provider',
      address: '0xC26f10e1b37A1E7A7De266FeF0c19533489C3e75',
      providerXpub:
        'xpub661MyMwAqRbcFeZ1CUvUpMs5bBSVLPHiuTqj7dZPertAGtd3xyTW1vrPspz7B34A7sdPahw7psrJjCXmn8KpF92jQssoqmsTk8fZ9PZN8xK',
    },
  ],
});
