import { BigNumber } from 'ethers';
import { evaluateThreshold } from './opsgenie-utils';
import { Metric, OutputMetric } from './types';
import { getGlobalConfig } from './utils';

jest.mock('axios', () => jest.fn(() => Promise.resolve('teresa teng')));

describe('alert utilities', () => {
  describe('evaluateThreshold', () => {
    it("tests for an alert being generated if a beacon's deviation is over the configured threshold", async () => {
      const fnToCall = jest.fn();

      const metric: OutputMetric = {
        metadata: {
          name: 'A cool beacon',
          chainId: '80001',
          beaconId: '0x000',
          beaconResponse: { lastUpdated: Date.now() - 24 * 60 * 60 * 1_000 },
          chains: {
            'polygon-testnet': {
              airseekerConfig: {
                deviationThreshold: 1,
              },
            },
          },
          deviationAlertMultiplier: 3,
        },
        metricName: Metric.API_BEACON_DEVIATION,
        value: BigNumber.from(4).mul(BigNumber.from(10).pow(18)),
        logToDb: false,
      };

      const message = await evaluateThreshold(metric, fnToCall, getGlobalConfig());
      expect(message).toBeDefined();
      expect(message.headline).toEqual(
        `Beacon deviation exceeded: ${metric.metadata.name} on ${Object.keys(metric.metadata.chains)[0]}`
      );

      expect(fnToCall).toHaveBeenCalledTimes(0);
    });

    it("tests for an alert not being generated if a beacon's deviation is under the configured threshold", async () => {
      const fnToCall = jest.fn();

      const metric: OutputMetric = {
        metadata: {
          name: 'A cool beacon',
          chainId: '80001',
          beaconId: '0x000',
          beaconResponse: { lastUpdated: Date.now() - 24 * 60 * 60 * 1_000 },
          chains: {
            'polygon-testnet': {
              airseekerConfig: {
                deviationThreshold: 1,
              },
            },
          },
          deviationAlertMultiplier: 3,
        },
        metricName: Metric.API_BEACON_DEVIATION,
        value: BigNumber.from(0).mul(BigNumber.from(10).pow(18)),
        logToDb: false,
      };

      const message = await evaluateThreshold(metric, fnToCall, getGlobalConfig());
      expect(message).toEqual(null);

      expect(fnToCall).toHaveBeenCalledTimes(0);
    });
  });
});
