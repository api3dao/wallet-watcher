export const buildWalletConfig = () => ({
  chains: {
    '31337': {
      rpc: 'http://127.0.0.1:8545/',
      topUpAmount: '0.1',
      lowBalance: '0.2',
      globalSponsorLowBalanceWarn: '3',
    },
  },
  topUpMnemonic: 'test test test test test test test test test test test junk',
  opsGenieConfig: {
    apiKey: 'opsgenie-api-key',
    responders: [
      {
        type: 'team',
        id: 'a uuid value',
      },
    ],
  },
  explorerUrls: {
    '31337': 'https://explorer.test.com/',
  },
});
