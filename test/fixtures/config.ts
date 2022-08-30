export const buildAirnodeConfig = () => ({
  chains: [
    {
      maxConcurrency: 100,
      authorizers: [],
      contracts: {
        AirnodeRrp: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
      },
      id: '31337',
      providers: {
        local: {
          url: 'http://127.0.0.1:8545',
        },
      },
      type: 'evm',
      options: {
        txType: 'eip1559',
        baseFeeMultiplier: 2,
        priorityFee: {
          value: 3.12,
          unit: 'gwei',
        },
      },
    },
  ],
  nodeSettings: {
    airnodeWalletMnemonic: 'achieve climb couple wait accident symbol spy blouse reduce foil echo label',
    httpGateway: {
      enabled: false,
    },
    httpSignedDataGateway: {
      enabled: false,
    },
    heartbeat: {
      enabled: false,
    },
    logFormat: 'plain',
    logLevel: 'INFO',
    nodeVersion: '0.5.0',
    cloudProvider: {
      type: 'local',
    },
    stage: 'dev',
  },
  triggers: {
    rrp: [
      {
        endpointId: '0x13dea3311fe0d6b84f4daeab831befbc49e19e6494c41e9e065a09c3c68f43b6',
        oisTitle: 'Currency Converter API',
        endpointName: 'convertToUSD',
      },
    ],
    http: [
      {
        endpointId: '0x13dea3311fe0d6b84f4daeab831befbc49e19e6494c41e9e065a09c3c68f43b6',
        oisTitle: 'Currency Converter API',
        endpointName: 'convertToUSD',
      },
    ],
    httpSignedData: [
      {
        endpointId: '0x13dea3311fe0d6b84f4daeab831befbc49e19e6494c41e9e065a09c3c68f43b6',
        oisTitle: 'Currency Converter API',
        endpointName: 'convertToUSD',
      },
    ],
  },
  ois: [
    {
      oisFormat: '1.0.0',
      version: '1.2.3',
      title: 'Currency Converter API',
      apiSpecifications: {
        servers: [
          {
            url: 'http://localhost:5000',
          },
        ],
        paths: {
          '/convert': {
            get: {
              parameters: [
                {
                  in: 'query',
                  name: 'from',
                },
                {
                  in: 'query',
                  name: 'to',
                },
                {
                  in: 'query',
                  name: 'amount',
                },
                {
                  in: 'query',
                  name: 'date',
                },
              ],
            },
          },
        },
        components: {
          securitySchemes: {
            'Currency Converter Security Scheme': {
              in: 'query',
              type: 'apiKey',
              name: 'access_key',
            },
          },
        },
        security: {
          'Currency Converter Security Scheme': [],
        },
      },
      endpoints: [
        {
          name: 'convertToUSD',
          operation: {
            method: 'get',
            path: '/convert',
          },
          fixedOperationParameters: [
            {
              operationParameter: {
                in: 'query',
                name: 'to',
              },
              value: 'USD',
            },
          ],
          reservedParameters: [
            {
              name: '_type',
              fixed: 'int256',
            },
            {
              name: '_path',
              fixed: 'result',
            },
            {
              name: '_times',
              default: '1000000',
            },
          ],
          parameters: [
            {
              name: 'from',
              default: 'EUR',
              operationParameter: {
                in: 'query',
                name: 'from',
              },
            },
            {
              name: 'amount',
              default: '1',
              operationParameter: {
                name: 'amount',
                in: 'query',
              },
            },
          ],
        },
      ],
    },
  ],
  apiCredentials: [
    {
      oisTitle: 'Currency Converter API',
      securitySchemeName: 'Currency Converter Security Scheme',
      securitySchemeValue: 'secret',
    },
  ],
});

// Config for ETH subscription
export const buildLocalConfigETH = () => ({
  airnodeMnemonic: 'achieve climb couple wait accident symbol spy blouse reduce foil echo label',
  privateKeys: {
    deployer: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    manager: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    sponsor: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    randomPerson: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  },
  endpoint: {
    oisTitle: 'Currency Converter API',
    endpointName: 'convertToUSD',
  },
  templateParameters: [
    { type: 'string32', name: 'to', value: 'USD' },
    { type: 'string32', name: '_type', value: 'int256' },
    { type: 'string32', name: '_path', value: 'result' },
    { type: 'string32', name: '_times', value: '1000000' },
    { type: 'string32', name: 'from', value: 'ETH' },
  ],
  threshold: 10,
});

// Config for BTC subscription
export const buildLocalConfigBTC = () => ({
  airnodeMnemonic: 'achieve climb couple wait accident symbol spy blouse reduce foil echo label',
  privateKeys: {
    deployer: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    manager: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    sponsor: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    randomPerson: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  },
  endpoint: {
    oisTitle: 'Currency Converter API',
    endpointName: 'convertToUSD',
  },
  templateParameters: [
    { type: 'string32', name: 'to', value: 'USD' },
    { type: 'string32', name: '_type', value: 'int256' },
    { type: 'string32', name: '_path', value: 'result' },
    { type: 'string32', name: '_times', value: '1000000' },
    { type: 'string32', name: 'from', value: 'BTC' },
  ],
  threshold: 10,
});

export const beaconIdETH = '0x924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5';
export const beaconIdBTC = '0xbf7ce55d109fd196de2a8bf1515d166c56c9decbe9cb473656bbca30d5743990';

export const buildTelemetryConfig = () => ({
  chains: {
    '31337': {
      rpc: 'http://127.0.0.1:8545/',
      topUpAmount: '0.1',
      lowBalance: '0.2',
      globalSponsorLowBalanceWarn: '3',
    },
  },
  apiCredentials: [
    {
      oisTitle: 'Currency Converter API',
      securitySchemeName: 'Currency Converter Security Scheme',
      securitySchemeValue: 'secret',
    },
  ],
  topUpMnemonic: '',
  deviationAlertMultiplier: 2,
  beaconStalenessTimeSeconds: 1, // Set artificially low to make tests run faster
  gitUsername: 'abc',
  gitToken: 'abc',
  gitBranch: 'abc',
  opsGenieConfig: {
    responders: [
      {
        type: 'team',
        id: 'abc',
      },
    ],
    heartbeatServiceName: 'alerting',
  },
  tickers: {
    binance: [
      'BTCUSDT',
      'ETHDAI',
      'DAIBUSD',
      'ETHUSDT',
      'ETHBTC',
      'BTCBUSD',
      'BUSDUSDT',
      'USDCBUSD',
      'USDCBUSD',
      'ETHBUSD',
    ],
    httpGet: [
      {
        url: 'localhost',
        secrets: 'secret',
        path: 'fast.gasprice',
      },
    ],
  },
  monitoringResources: [
    {
      url: 'http://localhost:5000/monitor',
      expectedStatusCode: 200,
    },
  ],
  maxBatchSize: 100,
  explorerUrls: {
    '31337': 'http://localhost:5000/explorer',
  },
  qrng: {
    airnodeRrp: '0x9d3C147cA16DB954873A498e0af5852AB39139f2',
    blockTimes: {
      '31337': {
        averageBlockTime: 1,
      },
    },
  },
  collectorLoopDuration: 5_000,
  minimumPeriodPerCall: 0,
});

export const buildOperationsConfig = () => ({
  chains: {
    local: {
      name: 'local',
      fullName: 'Local Hardhat',
      decimalPlaces: 2,
      id: '31337',
      contracts: { DapiServer: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' },
      nativeToken: 'ETH',
      blockTime: 1,
      logoPath: 'logo',
      testnet: true,
      explorerUrl: 'explorer',
    },
  },
  apis: {
    localApi: {
      beacons: {
        'localApi eth_usd': {
          name: 'Local API ETH/USD',
          description: 'Local API - ETH/USD - Pair',
          beaconId: '0x924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5',
          airnodeAddress: '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
          templateId: '0xea30f92923ece1a97af69d450a8418db31be5a26a886540a13c09c739ba8eaaa',
          chains: {
            local: {
              active: true,
              sponsor: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
              topUpWallets: [
                { walletType: 'Provider-Sponsor', address: '0xTODO' },
                { walletType: 'API3', address: '0xTODO' },
              ],
              updateConditionPercentage: 2,
              airseekerConfig: { deviationThreshold: 1, heartbeatInterval: 86400, updateInterval: 30 },
            },
          },
        },
        'localApi btc_usd': {
          name: 'Local API BTC/USD',
          description: 'Local API - BTC/USD - Pair',
          beaconId: '0xbf7ce55d109fd196de2a8bf1515d166c56c9decbe9cb473656bbca30d5743990',
          airnodeAddress: '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
          templateId: '0x0bbf5f2ec4b0e9faf5b89b4ddbed9bdad7a542cc258ffd7b106b523aeae039a6',
          chains: {
            local: {
              active: true,
              sponsor: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
              topUpWallets: [
                { walletType: 'Provider-Sponsor', address: '0xTODO' },
                { walletType: 'API3', address: '0xTODO' },
              ],
              updateConditionPercentage: 2,
              airseekerConfig: { deviationThreshold: 1, heartbeatInterval: 86400, updateInterval: 30 },
            },
          },
        },
      },
      deployments: { '2022-06-14': { airnode: { aws: { config: buildAirnodeConfig() } } } },
      ois: {
        localApi: {
          oisFormat: '1.0.0',
          version: '1.2.3',
          title: 'Currency Converter API',
          apiSpecifications: {
            servers: [
              {
                url: 'http://localhost:5000',
              },
            ],
            paths: {
              '/convert': {
                get: {
                  parameters: [
                    {
                      in: 'query',
                      name: 'from',
                    },
                    {
                      in: 'query',
                      name: 'to',
                    },
                    {
                      in: 'query',
                      name: 'amount',
                    },
                    {
                      in: 'query',
                      name: 'date',
                    },
                  ],
                },
              },
            },
            components: {
              securitySchemes: {
                'Currency Converter Security Scheme': {
                  in: 'query',
                  type: 'apiKey',
                  name: 'access_key',
                },
              },
            },
            security: {
              'Currency Converter Security Scheme': [],
            },
          },
          endpoints: [
            {
              name: 'convertToUSD',
              operation: {
                method: 'get',
                path: '/convert',
              },
              fixedOperationParameters: [
                {
                  operationParameter: {
                    in: 'query',
                    name: 'to',
                  },
                  value: 'USD',
                },
              ],
              reservedParameters: [
                {
                  name: '_type',
                  fixed: 'int256',
                },
                {
                  name: '_path',
                  fixed: 'result',
                },
                {
                  name: '_times',
                  default: '1000000',
                },
              ],
              parameters: [
                {
                  name: 'from',
                  default: 'EUR',
                  operationParameter: {
                    in: 'query',
                    name: 'from',
                  },
                },
                {
                  name: 'amount',
                  default: '1',
                  operationParameter: {
                    name: 'amount',
                    in: 'query',
                  },
                },
              ],
            },
          ],
        },
      },

      templates: {
        'localApi eth_usd': {
          name: 'ETH USD',
          endpointId: '0x13dea3311fe0d6b84f4daeab831befbc49e19e6494c41e9e065a09c3c68f43b6',
          parameters:
            '0x3173737373730000000000000000000000000000000000000000000000000000746f00000000000000000000000000000000000000000000000000000000000055534400000000000000000000000000000000000000000000000000000000005f74797065000000000000000000000000000000000000000000000000000000696e7432353600000000000000000000000000000000000000000000000000005f70617468000000000000000000000000000000000000000000000000000000726573756c7400000000000000000000000000000000000000000000000000005f74696d65730000000000000000000000000000000000000000000000000000313030303030300000000000000000000000000000000000000000000000000066726f6d000000000000000000000000000000000000000000000000000000004554480000000000000000000000000000000000000000000000000000000000',
          templateId: '0xea30f92923ece1a97af69d450a8418db31be5a26a886540a13c09c739ba8eaaa',
          decodedParameters: [
            { type: 'string32', name: 'to', value: 'USD' },
            { type: 'string32', name: '_type', value: 'int256' },
            { type: 'string32', name: '_path', value: 'result' },
            { type: 'string32', name: '_times', value: '1000000' },
            { type: 'string32', name: 'from', value: 'ETH' },
          ],
        },
        'localApi btc_usd': {
          name: 'BTC USD',
          endpointId: '0x13dea3311fe0d6b84f4daeab831befbc49e19e6494c41e9e065a09c3c68f43b6',
          parameters:
            '0x3173737373730000000000000000000000000000000000000000000000000000746f00000000000000000000000000000000000000000000000000000000000055534400000000000000000000000000000000000000000000000000000000005f74797065000000000000000000000000000000000000000000000000000000696e7432353600000000000000000000000000000000000000000000000000005f70617468000000000000000000000000000000000000000000000000000000726573756c7400000000000000000000000000000000000000000000000000005f74696d65730000000000000000000000000000000000000000000000000000313030303030300000000000000000000000000000000000000000000000000066726f6d000000000000000000000000000000000000000000000000000000004254430000000000000000000000000000000000000000000000000000000000',
          templateId: '0x0bbf5f2ec4b0e9faf5b89b4ddbed9bdad7a542cc258ffd7b106b523aeae039a6',
          decodedParameters: [
            { type: 'string32', name: 'to', value: 'USD' },
            { type: 'string32', name: '_type', value: 'int256' },
            { type: 'string32', name: '_path', value: 'result' },
            { type: 'string32', name: '_times', value: '1000000' },
            { type: 'string32', name: 'from', value: 'BTC' },
          ],
        },
      },
      apiMetadata: {
        name: 'API3-testing',
        active: true,
        homepage: 'homepage',
        airnode: '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
        xpub: 'xpub6CjvSJ3sybHuVaYnQsCvNQnXfNrMusXEtfoAvYuS1pEDtKngXQE1dcTDXR9dgwfqdakksFrhNHeKiqsYKD6KS5mga1NvegzbV6nKwsNyfGd',
        logoPath: 'logo',
        description: 'Telemetry testing',
        maxSubscriptionPeriod: 3,
      },
    },
  },
});
