import path from 'path';
import { writeFileSync } from 'fs';
import { walletsSchema } from '../src/types';
import { getChainAlias } from '../src/wallet-watcher';

// This script is to generate the wallets.json file based on values from the API3 merkle tree funder metadata files:
// https://github.com/api3dao/manager-multisig/blob/main/chain/merkle-funder/data/metadata.json and
// https://github.com/api3dao/manager-multisig/blob/main/chain/fallback/data/metadata.json

const main = async () => {
  const metadata = {
    supportedChains: {
      '1': {
        recipients: {
          dapisTeam: {
            airseekerSponsorWallet: '0xA1a3530a161A8F0e83D1090e1d9f45d96eB46C11',
            merkleFunderWorkerWallet: '0x592Ae647b543Fa7EEc38D80aE7Cdd07199F337c5',
            dapiFallbackV1: '0xEF6115B6E8461e70d26869641a228D004C67A782',
          },
          nodary: {
            airseekerSponsorWallet: '0x79f0784129448744d8d53460566A99E904dDCc6B',
            merkleFunderWorkerWallet: '0x0BC7146b28886cBd2732E80f5Abd92D9A2272e1d',
          },
        },
        thresholds: {
          airseekerSponsorWallet: {
            lowThreshold: {
              value: 2.52,
              unit: 'ether',
            },
            highThreshold: {
              value: 5.04,
              unit: 'ether',
            },
          },
          merkleFunderWorkerWallet: {
            lowThreshold: {
              value: 0.252,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.504,
              unit: 'ether',
            },
          },
          dapiFallbackV1: {
            lowThreshold: {
              value: 0.252,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.504,
              unit: 'ether',
            },
          },
        },
      },
      '10': {
        recipients: {
          dapisTeam: {
            airseekerSponsorWallet: '0xA1a3530a161A8F0e83D1090e1d9f45d96eB46C11',
            merkleFunderWorkerWallet: '0x592Ae647b543Fa7EEc38D80aE7Cdd07199F337c5',
            dapiFallbackV1: '0x705787063B11142a9a48F4D2f4bfB56214828261',
          },
          nodary: {
            airseekerSponsorWallet: '0x79f0784129448744d8d53460566A99E904dDCc6B',
            merkleFunderWorkerWallet: '0x0BC7146b28886cBd2732E80f5Abd92D9A2272e1d',
          },
        },
        thresholds: {
          airseekerSponsorWallet: {
            lowThreshold: {
              value: 0.366,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.731,
              unit: 'ether',
            },
          },
          merkleFunderWorkerWallet: {
            lowThreshold: {
              value: 0.0366,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.0731,
              unit: 'ether',
            },
          },
          dapiFallbackV1: {
            lowThreshold: {
              value: 0.0366,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.0731,
              unit: 'ether',
            },
          },
        },
      },
      '56': {
        recipients: {
          dapisTeam: {
            airseekerSponsorWallet: '0xA1a3530a161A8F0e83D1090e1d9f45d96eB46C11',
            merkleFunderWorkerWallet: '0x592Ae647b543Fa7EEc38D80aE7Cdd07199F337c5',
            dapiFallbackV1: '0xc76C18CfD7948DF351ab9BFa80f6D70c3Bf114E2',
          },
          nodary: {
            airseekerSponsorWallet: '0x79f0784129448744d8d53460566A99E904dDCc6B',
            merkleFunderWorkerWallet: '0x0BC7146b28886cBd2732E80f5Abd92D9A2272e1d',
          },
        },
        thresholds: {
          airseekerSponsorWallet: {
            lowThreshold: {
              value: 0.505,
              unit: 'ether',
            },
            highThreshold: {
              value: 1.01,
              unit: 'ether',
            },
          },
          merkleFunderWorkerWallet: {
            lowThreshold: {
              value: 0.0505,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.101,
              unit: 'ether',
            },
          },
          dapiFallbackV1: {
            lowThreshold: {
              value: 0.0505,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.101,
              unit: 'ether',
            },
          },
        },
      },
      '100': {
        recipients: {
          dapisTeam: {
            airseekerSponsorWallet: '0xA1a3530a161A8F0e83D1090e1d9f45d96eB46C11',
            merkleFunderWorkerWallet: '0x592Ae647b543Fa7EEc38D80aE7Cdd07199F337c5',
            dapiFallbackV1: '0xD54eF88A7C4D4150286941DdAe325Fe881a7f27f',
          },
          nodary: {
            airseekerSponsorWallet: '0x79f0784129448744d8d53460566A99E904dDCc6B',
            merkleFunderWorkerWallet: '0x0BC7146b28886cBd2732E80f5Abd92D9A2272e1d',
          },
        },
        thresholds: {
          airseekerSponsorWallet: {
            lowThreshold: {
              value: 0.364,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.729,
              unit: 'ether',
            },
          },
          merkleFunderWorkerWallet: {
            lowThreshold: {
              value: 0.0364,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.0729,
              unit: 'ether',
            },
          },
          dapiFallbackV1: {
            lowThreshold: {
              value: 0.0364,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.0729,
              unit: 'ether',
            },
          },
        },
      },
      '137': {
        recipients: {
          dapisTeam: {
            airseekerSponsorWallet: '0xA1a3530a161A8F0e83D1090e1d9f45d96eB46C11',
            merkleFunderWorkerWallet: '0x592Ae647b543Fa7EEc38D80aE7Cdd07199F337c5',
            dapiFallbackV1: '0xF10952F418DA8Da5ECe292b1B82a20479633F173',
          },
          nodary: {
            airseekerSponsorWallet: '0x79f0784129448744d8d53460566A99E904dDCc6B',
            merkleFunderWorkerWallet: '0x0BC7146b28886cBd2732E80f5Abd92D9A2272e1d',
          },
        },
        thresholds: {
          airseekerSponsorWallet: {
            lowThreshold: {
              value: 20.5,
              unit: 'ether',
            },
            highThreshold: {
              value: 41,
              unit: 'ether',
            },
          },
          merkleFunderWorkerWallet: {
            lowThreshold: {
              value: 2.05,
              unit: 'ether',
            },
            highThreshold: {
              value: 4.1,
              unit: 'ether',
            },
          },
          dapiFallbackV1: {
            lowThreshold: {
              value: 2.05,
              unit: 'ether',
            },
            highThreshold: {
              value: 4.1,
              unit: 'ether',
            },
          },
        },
      },
      '250': {
        recipients: {
          dapisTeam: {
            airseekerSponsorWallet: '0xA1a3530a161A8F0e83D1090e1d9f45d96eB46C11',
            merkleFunderWorkerWallet: '0x592Ae647b543Fa7EEc38D80aE7Cdd07199F337c5',
            dapiFallbackV1: '0x51c8681BB9762a6B91b96e578315E21EE094207a',
          },
          nodary: {
            airseekerSponsorWallet: '0x79f0784129448744d8d53460566A99E904dDCc6B',
            merkleFunderWorkerWallet: '0x0BC7146b28886cBd2732E80f5Abd92D9A2272e1d',
          },
        },
        thresholds: {
          airseekerSponsorWallet: {
            lowThreshold: {
              value: 306,
              unit: 'ether',
            },
            highThreshold: {
              value: 612,
              unit: 'ether',
            },
          },
          merkleFunderWorkerWallet: {
            lowThreshold: {
              value: 30.6,
              unit: 'ether',
            },
            highThreshold: {
              value: 61.2,
              unit: 'ether',
            },
          },
          dapiFallbackV1: {
            lowThreshold: {
              value: 30.6,
              unit: 'ether',
            },
            highThreshold: {
              value: 61.2,
              unit: 'ether',
            },
          },
        },
      },
      '1101': {
        recipients: {
          dapisTeam: {
            airseekerSponsorWallet: '0xA1a3530a161A8F0e83D1090e1d9f45d96eB46C11',
            merkleFunderWorkerWallet: '0x592Ae647b543Fa7EEc38D80aE7Cdd07199F337c5',
            dapiFallbackV1: '0x81A850254769a6C87d4F11B9F80bCc5bE1CcF50E',
          },
          nodary: {
            airseekerSponsorWallet: '0x79f0784129448744d8d53460566A99E904dDCc6B',
            merkleFunderWorkerWallet: '0x0BC7146b28886cBd2732E80f5Abd92D9A2272e1d',
          },
        },
        thresholds: {
          airseekerSponsorWallet: {
            lowThreshold: {
              value: 0.229,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.457,
              unit: 'ether',
            },
          },
          merkleFunderWorkerWallet: {
            lowThreshold: {
              value: 0.0229,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.0457,
              unit: 'ether',
            },
          },
          dapiFallbackV1: {
            lowThreshold: {
              value: 0.0229,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.0457,
              unit: 'ether',
            },
          },
        },
      },
      '1284': {
        recipients: {
          dapisTeam: {
            airseekerSponsorWallet: '0xA1a3530a161A8F0e83D1090e1d9f45d96eB46C11',
            merkleFunderWorkerWallet: '0x592Ae647b543Fa7EEc38D80aE7Cdd07199F337c5',
            dapiFallbackV1: '0xD54eF88A7C4D4150286941DdAe325Fe881a7f27f',
          },
          nodary: {
            airseekerSponsorWallet: '0x79f0784129448744d8d53460566A99E904dDCc6B',
            merkleFunderWorkerWallet: '0x0BC7146b28886cBd2732E80f5Abd92D9A2272e1d',
          },
        },
        thresholds: {
          airseekerSponsorWallet: {
            lowThreshold: {
              value: 24.7,
              unit: 'ether',
            },
            highThreshold: {
              value: 49.5,
              unit: 'ether',
            },
          },
          merkleFunderWorkerWallet: {
            lowThreshold: {
              value: 2.47,
              unit: 'ether',
            },
            highThreshold: {
              value: 4.95,
              unit: 'ether',
            },
          },
          dapiFallbackV1: {
            lowThreshold: {
              value: 2.47,
              unit: 'ether',
            },
            highThreshold: {
              value: 4.95,
              unit: 'ether',
            },
          },
        },
      },
      '1285': {
        recipients: {
          dapisTeam: {
            airseekerSponsorWallet: '0xA1a3530a161A8F0e83D1090e1d9f45d96eB46C11',
            merkleFunderWorkerWallet: '0x592Ae647b543Fa7EEc38D80aE7Cdd07199F337c5',
            dapiFallbackV1: '0x201ab2742e76CE9d569240B024c38702EE18D6d9',
          },
          nodary: {
            airseekerSponsorWallet: '0x79f0784129448744d8d53460566A99E904dDCc6B',
            merkleFunderWorkerWallet: '0x0BC7146b28886cBd2732E80f5Abd92D9A2272e1d',
          },
        },
        thresholds: {
          airseekerSponsorWallet: {
            lowThreshold: {
              value: 0.236,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.471,
              unit: 'ether',
            },
          },
          merkleFunderWorkerWallet: {
            lowThreshold: {
              value: 0.0236,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.0471,
              unit: 'ether',
            },
          },
          dapiFallbackV1: {
            lowThreshold: {
              value: 0.0236,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.0471,
              unit: 'ether',
            },
          },
        },
      },
      '42161': {
        recipients: {
          dapisTeam: {
            airseekerSponsorWallet: '0xA1a3530a161A8F0e83D1090e1d9f45d96eB46C11',
            merkleFunderWorkerWallet: '0x592Ae647b543Fa7EEc38D80aE7Cdd07199F337c5',
            dapiFallbackV1: '0x494E1ECd9d232d97f727002AEfDEcf4080E495f9',
          },
          nodary: {
            airseekerSponsorWallet: '0x79f0784129448744d8d53460566A99E904dDCc6B',
            merkleFunderWorkerWallet: '0x0BC7146b28886cBd2732E80f5Abd92D9A2272e1d',
          },
        },
        thresholds: {
          airseekerSponsorWallet: {
            lowThreshold: {
              value: 0.23,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.459,
              unit: 'ether',
            },
          },
          merkleFunderWorkerWallet: {
            lowThreshold: {
              value: 0.023,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.0459,
              unit: 'ether',
            },
          },
          dapiFallbackV1: {
            lowThreshold: {
              value: 0.023,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.0459,
              unit: 'ether',
            },
          },
        },
      },
      '43114': {
        recipients: {
          dapisTeam: {
            airseekerSponsorWallet: '0xA1a3530a161A8F0e83D1090e1d9f45d96eB46C11',
            merkleFunderWorkerWallet: '0x592Ae647b543Fa7EEc38D80aE7Cdd07199F337c5',
            dapiFallbackV1: '0xd9b82260eaaa2CDe8150474C94C130ca681bB127',
          },
          nodary: {
            airseekerSponsorWallet: '0x79f0784129448744d8d53460566A99E904dDCc6B',
            merkleFunderWorkerWallet: '0x0BC7146b28886cBd2732E80f5Abd92D9A2272e1d',
          },
        },
        thresholds: {
          airseekerSponsorWallet: {
            lowThreshold: {
              value: 4.7,
              unit: 'ether',
            },
            highThreshold: {
              value: 9.41,
              unit: 'ether',
            },
          },
          merkleFunderWorkerWallet: {
            lowThreshold: {
              value: 0.47,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.941,
              unit: 'ether',
            },
          },
          dapiFallbackV1: {
            lowThreshold: {
              value: 0.47,
              unit: 'ether',
            },
            highThreshold: {
              value: 0.941,
              unit: 'ether',
            },
          },
        },
      },
    },
  };

  const merkleFunderDepositories: Record<string, Record<string, string>> = {
    '42161': {
      dapisTeam: '0x536D8BB091dfD852e22b2Ff92b0e0E73bA4468C5',
      nodary: '0xddcCdcCe4EFc6d0c205Da9102e1fe0Af6b8f10CB',
    },
    '43114': {
      dapisTeam: '0x74611A8fB37e4E33af294403467224Ba3b841Ef5',
      nodary: '0xedadF04398169FcC0C9df8A1DE3fb8330Cc2607B',
    },
    '56': {
      dapisTeam: '0x7CdeEE7039BD76174ac81950A306CDf275aDd6ab',
      nodary: '0xa556C67C7fd0904B0bd377A7d82162c91411a75c',
    },
    '1': {
      dapisTeam: '0xc1E5590567300400D8884D5C07029200d287Ba5F',
      nodary: '0x603840F02c12932f064de8D01eb2B4D9Ed831985',
    },
    '250': {
      dapisTeam: '0x1b7624e7cdb7E77B52310192cde780fB9a8f17E1',
      nodary: '0xA175A0e1a7055b2599C2e63Fe64bBa93Ad191d42',
    },
    '100': {
      dapisTeam: '0x63939AE5AC3020d518508953bdeE3fc84BB373BC',
      nodary: '0x467759A95CA9fE4368A479d0685ab33c64295cA2',
    },
    '1284': {
      dapisTeam: '0x1Ba19fc8e18828e35651DF6ECc79Cb2872BB6850',
      nodary: '0x691Ec4726684aE6f98cCBBE9A1ebf7C3b0F497aa',
    },
    '1285': {
      dapisTeam: '0x1F7865341B54c45562A6EcB38dEd335173D0194d',
      nodary: '0x989Ee13772af057ac33505beeAe9bb37632Aa292',
    },
    '10': {
      dapisTeam: '0x273EF24D8e6851726728bB317a25268538775fB1',
      nodary: '0xc51425DB2DDd9DB2548078891c87BF1469a35690',
    },
    '1101': {
      dapisTeam: '0xa4Cf154574262DF5cE710494c95f136664d2735D',
      nodary: '0x563e76E8f2f1adBc9307e4f29A2531b3c46B6409',
    },
    '137': {
      dapisTeam: '0x8e02De53D5a87a5271222bE4CC689Df5a1FA2ca0',
      nodary: '0xbe4619A4582b1CeA1eaDFFE89d13058A8Dd3c1c3',
    },
  };

  const multisigSigners: Record<string, string> = {
    '0xF5944F7Fa9BAD3196f93d6D9D318f1fDC357b41c': 'jiri',
    '0x9ff07C52AC45B40422d66E0356D14F8D64B9002E': 'vekil',
    '0x80efDd3bB15F2108C407049C5575490858800D47': 'mertcan',
    '0x70cC8f7C40A8e65A73b804Ad1c49F39D40ea3050': 'aaron',
    '0x09dEa15D4E1F82787e181F23788Dc3f4b3d3DAE4': 'bedirhan',
    '0x433171908d5BAB4ac0E860c64D1333F51A310321': 'burak',
    '0x918350a01A4C259FBCc94c6Fb2ca49A3753BDb86': 'santiago',
    '0x5b2962121b4334fe563F7062feA975f51313EDE3': 'ugur',
  };

  const managerMultisigs: Record<string, string> = {
    'arbitrum-goerli-testnet': '0x55D72F0eb10e85D390B20DA57aa3122312647c0d',
    arbitrum: '0x6adD2B0D2bA7A4075d75c3E1801214c53e407418',
    'avalanche-testnet': '0x33E6C2f5Fa6aA18254927F55b0C5b5B975Ec1358',
    avalanche: '0xC3E76D8829259f2A34541746de2F8A0509Dc1987',
    'base-goerli-testnet': '0x14A9E40FcAdA95A273ce3c8d4ccF7EA3280BDd26',
    'bsc-testnet': '0xd8eC2c4158a0Cb65Dd42E2d1C1da8EA11975Ba22',
    bsc: '0x4923968942E8aae4656ae4913874EB7312e0F7c7',
    'cronos-testnet': '0x14A9E40FcAdA95A273ce3c8d4ccF7EA3280BDd26',
    'ethereum-goerli-testnet': '0x5bD69cEe3bf372d331CDCbAb0C1e2202645e4dB4',
    'ethereum-sepolia-testnet': '0x55Cf1079a115029a879ec3A11Ba5D453272eb61D',
    ethereum: '0x33E6C2f5Fa6aA18254927F55b0C5b5B975Ec1358',
    'fantom-testnet': '0x88dAA2b3a5EC5609DBEf336818E7bafdfED6c535',
    fantom: '0x8984152339F9D35742BB878D0eaD9EF9fd6469d3',
    'gnosis-testnet': '0x55D72F0eb10e85D390B20DA57aa3122312647c0d',
    gnosis: '0xd8eC2c4158a0Cb65Dd42E2d1C1da8EA11975Ba22',
    'kava-testnet': '0x14A9E40FcAdA95A273ce3c8d4ccF7EA3280BDd26',
    'linea-goerli-testnet': '0x14A9E40FcAdA95A273ce3c8d4ccF7EA3280BDd26',
    'mantle-goerli-testnet': '0x14A9E40FcAdA95A273ce3c8d4ccF7EA3280BDd26',
    'metis-goerli-testnet': '0x2ab9f26E18B64848cd349582ca3B55c2d06f507d',
    metis: '0x33E6C2f5Fa6aA18254927F55b0C5b5B975Ec1358',
    'milkomeda-c1-testnet': '0xd8eC2c4158a0Cb65Dd42E2d1C1da8EA11975Ba22',
    'milkomeda-c1': '0x6adD2B0D2bA7A4075d75c3E1801214c53e407418',
    'moonbeam-testnet': '0xd8eC2c4158a0Cb65Dd42E2d1C1da8EA11975Ba22',
    moonbeam: '0xd8eC2c4158a0Cb65Dd42E2d1C1da8EA11975Ba22',
    moonriver: '0xCC5005Bd08b8882c9A132C0067E7D3f79796C251',
    'optimism-goerli-testnet': '0x55D72F0eb10e85D390B20DA57aa3122312647c0d',
    optimism: '0x8F3A2508C45a58d4fBAd5Ce564899659626D41B6',
    polygon: '0x4923968942E8aae4656ae4913874EB7312e0F7c7',
    'polygon-testnet': '0x50f8f227DEbA0028607a37B615A4EbBbF0E5b42E',
    'polygon-zkevm': '0x55D72F0eb10e85D390B20DA57aa3122312647c0d',
    'polygon-zkevm-goerli-testnet': '0x3c92f55d5738bEf9A1D760253317411ecB63e355',
    'rsk-testnet': '0xd8eC2c4158a0Cb65Dd42E2d1C1da8EA11975Ba22',
    rsk: '0x4923968942E8aae4656ae4913874EB7312e0F7c7',
    'scroll-goerli-testnet': '0x14A9E40FcAdA95A273ce3c8d4ccF7EA3280BDd26',
    'zksync-goerli-testnet': '0x3538405a1c1c934157063fF676682C8B74f5100d',
    zksync: '0xAB3177a68F07e07047bE90509be6AEb11f71da11',
  };

  const walletsJson = Object.entries(metadata.supportedChains).reduce((acc, [chainId, chainConfig]) => {
    const teamWalletNameMap: Record<string, Record<string, string>> = {
      dapisTeam: {
        airseekerSponsorWallet: 'API3 Airseeker 1',
        merkleFunderWorkerWallet: 'API3 MerkleFunder EOA',
        merkleFunderDepository: 'API3 Depository Contract',
        dapiFallbackV1: 'API3 Fallback V1',
      },
      nodary: {
        airseekerSponsorWallet: 'Nodary Airseeker 1',
        merkleFunderWorkerWallet: 'Nodary MerkleFunder EOA',
        merkleFunderDepository: 'Nodary Depository Contract',
        dapiFallbackV1: 'Nodary Fallback V1',
      },
    };
    const baseWalletConfig = { walletType: 'API3', monitorType: 'alert' };
    const thresholds = chainConfig.thresholds as Record<
      string,
      {
        lowThreshold: {
          value: number;
          unit: string;
        };
        highThreshold: {
          value: number;
          unit: string;
        };
      }
    >;

    const wallets = Object.entries(chainConfig.recipients)
      .flatMap(([team, addresses]) =>
        Object.entries(addresses).map(([addressKey, address]) => {
          chainConfig.thresholds;

          const lowThreshold = thresholds[addressKey].lowThreshold;
          const lowThresholdValue = lowThreshold.value * 0.95;
          const criticalThresholdValue = lowThresholdValue / 2;

          return {
            ...baseWalletConfig,
            name: teamWalletNameMap[team][addressKey],
            address,
            lowThreshold: { unit: lowThreshold.unit, value: lowThresholdValue, criticalValue: criticalThresholdValue },
          };
        })
      )
      // Filter out wallets where there is no match in teamWalletNameMap
      .filter((wallet) => wallet.name);

    const merkleFunderDepositoryLowThresholdValue = Object.values(thresholds).reduce(
      (acc, threshold) => acc + (threshold.highThreshold.value - threshold.lowThreshold.value) * 2,
      0
    );

    const merkleFunderDepositoryWalletConfigs = [
      { team: 'dapisTeam', addressKey: 'merkleFunderDepository' },
      { team: 'nodary', addressKey: 'merkleFunderDepository' },
    ].map(({ team, addressKey }) => ({
      ...baseWalletConfig,
      name: teamWalletNameMap[team][addressKey],
      address: merkleFunderDepositories[chainId][team],
      lowThreshold: {
        unit: wallets[0].lowThreshold.unit,
        value: merkleFunderDepositoryLowThresholdValue * 0.95,
        criticalValue: merkleFunderDepositoryLowThresholdValue / 2,
      },
    }));

    const signerWalletConfigs = Object.entries(multisigSigners).map(([address, addressKey]) => ({
      walletType: 'Monitor',
      monitorType: 'monitor',
      address,
      name: `${addressKey.charAt(0).toUpperCase() + addressKey.slice(1)} Signer`,
      lowThreshold: {
        unit: wallets[0].lowThreshold.unit,
        value: 0.0001,
        criticalValue: 0.00001,
      },
    }));

    const chainAlias = getChainAlias(chainId);

    const managerMultisigWalletConfig = chainAlias
      ? [
          {
            walletType: 'Monitor',
            monitorType: 'monitor',
            address: managerMultisigs[chainAlias],
            name: 'Manager Multisig',
            lowThreshold: {
              unit: wallets[0].lowThreshold.unit,
              value: 0.0001,
              criticalValue: 0.00001,
            },
          },
        ]
      : [];

    return {
      ...acc,
      [chainId]: [
        ...wallets,
        ...merkleFunderDepositoryWalletConfigs,
        ...signerWalletConfigs,
        ...managerMultisigWalletConfig,
      ],
    };
  }, {});

  walletsSchema.parse(walletsJson);
  writeFileSync(path.join(__dirname, '../config', 'new-wallets.json'), JSON.stringify(walletsJson, null, 2));
};

main();
