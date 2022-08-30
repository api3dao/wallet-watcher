import { TextEncoder } from 'util';
import axios, { AxiosResponse } from 'axios';
import { BigNumber } from 'ethers';
import { keccak256 } from 'ethers/lib/utils';
import { readOperationsRepository } from '@api3/operations/dist/utils/read-operations';
import { OperationsRepository } from '@api3/operations';
import {
  GlobalConfig,
  Metric,
  OpsGenieListAlertsResponse,
  OpsGenieMessage,
  OutputMetric,
  OpsGenieConfig,
} from './types';
import { log, logTrace } from './logging';
import { debugLog, doTimeout, getGlobalConfig } from './utils';
import { go } from './promise-utils';
import { resolveChainName } from './evm-utils';

/**
 * We cache open OpsGenie alerts to reduce API calls to not hit API limits prematurely.
 * This carries the risk of eventual state desynchronisation - but we restart every 15 minutes, which means the worst
 * desynch we could see is over a 15 minute period.
 *
 * Regardless, we forcefully re-cache OpsGenie alerts.
 *
 * Closing an OpsGenie alert requires knowing an alert's ID... but we use alert aliases for de-duplication, so to close
 * an alert we need to do at least one API call in addition to our close call - and that's assuming that we know the
 * alert is open.
 *
 * Caching alerts allows us to avoid executing either of those calls as we know from our cache whether an alert is open
 * or not and what its alias is.
 */
enum AlertsCachingStatus {
  NONE,
  IN_PROGRESS,
  DONE,
}

/**
 * A cache of open alerts. This helps reduce OpsGenie API calls.
 */
export let openAlerts: OpsGenieListAlertsResponse[] | undefined = undefined;
let openAlertsCached: AlertsCachingStatus = AlertsCachingStatus.NONE;

/**
 * Used to track whether the app should warn about a missing OpsGenie API key.
 */
let opsGenieKeyMissingWarningFirstUseComplete = false;

/**
 * Check for an OpsGenie key, warn only once per application run.
 */
export const checkForOpsGenieApiKey = () => {
  if (process.env.OPSGENIE_API_KEY) {
    return false;
  }

  if (opsGenieKeyMissingWarningFirstUseComplete) {
    return true;
  }

  opsGenieKeyMissingWarningFirstUseComplete = true;
  log('No OpsGenie key found in ENVs, this is probably a mistake.');

  return true;
};

/**
 * Resets the cache during longer running operations
 */
export const resetCachedAlerts = () => {
  openAlertsCached = AlertsCachingStatus.NONE;
};

/**
 * Resets the open alerts cache. Mainly to be used to clean the state for tests.
 */
export const resetOpenAlerts = () => {
  openAlerts = undefined;
};

/**
 * Cache open OpsGenie alerts to reduce API calls.
 *
 * @param globalConfig
 */
export const cacheOpenAlerts = async (opsGenieConfig: OpsGenieConfig) => {
  switch (openAlertsCached) {
    case AlertsCachingStatus.DONE:
      return;
    case AlertsCachingStatus.IN_PROGRESS:
      while (openAlertsCached === AlertsCachingStatus.IN_PROGRESS) {
        await doTimeout(100);
      }
      return;
    case AlertsCachingStatus.NONE:
      break;
  }

  openAlertsCached = AlertsCachingStatus.IN_PROGRESS;

  try {
    openAlerts = (await listOpenOpsGenieAlerts(opsGenieConfig)) ?? [];
    openAlertsCached = AlertsCachingStatus.DONE;

    await closeOpsGenieAlertWithAlias('opsgenie-open-alerts-cache-failure', opsGenieConfig);
  } catch (e) {
    openAlertsCached = AlertsCachingStatus.DONE;

    const typedError = e as Error;
    await sendToOpsGenieLowLevel({
      message: `Unable to cache open OpsGenie Alerts: ${typedError.message}`,
      alias: 'opsgenie-open-alerts-cache-failure',
      description: typedError.stack,
    });
  }
};

/**
 * Close an OpsGenie alert using it's alertId
 *
 * @param alertId
 * @param opsGenieConfig
 */
export const closeOpsGenieAlertWithId = async (alertId: string, opsGenieConfig: OpsGenieConfig) => {
  if (checkForOpsGenieApiKey()) {
    return;
  }

  const url = `https://api.opsgenie.com/v2/alerts/${alertId}/close`;
  const apiKey = process.env.OPSGENIE_API_KEY ?? opsGenieConfig.apiKey;

  axios({
    url,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `GenieKey ${apiKey}`,
    },
    method: 'POST',
    data: {},
    timeout: 10_000,
  })
    .catch(console.error)
    .then((result) => {
      if (result) {
        const typedResult = result as AxiosResponse;

        if (typedResult.status === 202 && openAlerts?.filter) {
          openAlerts = openAlerts.filter((alert) => alert.id !== alertId);
        }
      }
    });
};

/**
 * List open OpsGenie alerts
 *
 * @param opsGenieConfig
 */
export const listOpenOpsGenieAlerts = async (opsGenieConfig: OpsGenieConfig) => {
  if (checkForOpsGenieApiKey()) {
    return;
  }

  const params = new URLSearchParams();
  params.set('query', `status: open`);

  const url = `https://api.opsgenie.com/v2/alerts`;
  const apiKey = process.env.OPSGENIE_API_KEY ?? opsGenieConfig.apiKey;

  const [err, axiosResponse] = await go(
    () =>
      axios({
        url,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `GenieKey ${apiKey}`,
        },
        params,
        method: 'GET',
        timeout: 10_000,
      }),
    { timeoutMs: 10_000, retryDelayMs: 5_000, retries: 5 }
  );

  if (err || axiosResponse.status !== 200 || !axiosResponse?.data?.data) {
    log(`Unable to list OpsGenie alerts`, 'ERROR', err as Error);
    return;
  }

  return (axiosResponse.data.data as OpsGenieListAlertsResponse[]).map(({ id, alias }) => ({ id, alias }));
};

/**
 * List open OpsGenie alerts by their alias
 *
 * @param alias
 * @param globalConfig
 */
export const getOpenAlertsForAlias = async (alias: string, globalConfig: GlobalConfig) => {
  const params = new URLSearchParams();
  params.set('query', `status: open AND alias: ${alias}`);

  const url = `https://api.opsgenie.com/v2/alerts`;
  const apiKey = process.env.OPSGENIE_API_KEY ?? globalConfig.opsGenieConfig.apiKey;

  const axiosResponse = await axios({
    url,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `GenieKey ${apiKey}`,
    },
    params,
    method: 'GET',
    timeout: 10_000,
  });

  if (axiosResponse.status !== 200) {
    log(`Unable to list OpsGenie alerts`, 'ERROR');
    return;
  }

  if (!axiosResponse?.data?.data) {
    return;
  }

  return axiosResponse.data.data as OpsGenieListAlertsResponse[];
};

export const closeOpsGenieAlertWithAlias = async (alias: string, opsGenieConfig: OpsGenieConfig) => {
  if (checkForOpsGenieApiKey()) {
    return;
  }

  await cacheOpenAlerts(opsGenieConfig);
  const cachedAlertId = openAlerts?.filter((alert) => alert.alias === alias);
  if (!cachedAlertId) {
    return;
  }

  //const alertId = cachedAlertId ? [cachedAlertId] : await getOpenAlertsForAlias(alias, globalConfig);

  const promisedResults = await Promise.allSettled(
    cachedAlertId!.map(async (alertRecord: OpsGenieListAlertsResponse) =>
      closeOpsGenieAlertWithId(alertRecord.id, opsGenieConfig)
    )
  );
  promisedResults
    .filter((result) => result.status === 'rejected')
    .map((rejection) => log('Alert close promise rejected', 'ERROR', rejection));
};

export const sendToOpsGenieLowLevel = async (
  message: OpsGenieMessage,
  opsGenieConfig = getGlobalConfig().opsGenieConfig
) => {
  log(message.message, 'INFO', message);
  if (checkForOpsGenieApiKey()) {
    return;
  }
  const url = 'https://api.opsgenie.com/v2/alerts';
  const apiKey = process.env.OPSGENIE_API_KEY ?? opsGenieConfig.apiKey;

  const payload = JSON.stringify({
    ...message,
    responders: opsGenieConfig.responders,
  });

  try {
    const response = await axios({
      url,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `GenieKey ${apiKey}`,
      },
      method: 'POST',
      data: payload,
      timeout: 10_000,
    });

    if (response?.data?.requestId) {
      if (openAlerts) {
        openAlerts = [
          ...openAlerts,
          {
            id: response?.data?.requestId,
            alias: message.alias,
          },
        ];
      }
    }
  } catch (e) {
    logTrace('Failed to create OpsGenie alert', 'ERROR', e);
  }
};

export const sendOpsGenieHeartbeat = async (heartBeatServiceName: string, opsGenieConfig: OpsGenieConfig) =>
  new Promise<void>((resolve) => {
    if (checkForOpsGenieApiKey()) {
      resolve();
      return;
    }

    const url = `https://api.opsgenie.com/v2/heartbeats/${heartBeatServiceName}/ping`;
    const apiKey = process.env.OPSGENIE_API_KEY ?? opsGenieConfig.apiKey;

    axios({
      url,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `GenieKey ${apiKey}`,
      },
      method: 'POST',
      data: {},
      timeout: 10_000,
    })
      .catch((e) => {
        logTrace('Failed to create OpsGenie heartbeat', e);
        resolve();
      })
      .then((data) => {
        if (data) debugLog(JSON.stringify(data.data, null, 2));
        resolve();
      });
  });

export const makeOpsGenieMessage = (
  metric: OutputMetric,
  headline: string,
  unitPretext?: string,
  unitPostText?: string,
  modifier?: BigNumber
): OpsGenieMessage => {
  const reportedValue = modifier ? BigNumber.from(metric.value).div(modifier) : metric.value;
  return {
    message: `${headline} : ${unitPretext ?? ''} ${reportedValue} ${unitPostText ?? ''}`,
    alias: `${metric.metricName}-${keccak256(new TextEncoder().encode(JSON.stringify(metric.metadata)))}`,
    description: JSON.stringify(metric, null, 2),
  };
};

export const sendToOpsGenie = async (
  metric: OutputMetric,
  globalConfig: GlobalConfig,
  _operations: OperationsRepository
) => {
  const potentialAlarmPayload = (await evaluateThreshold(metric, makeOpsGenieMessage, globalConfig)) as OpsGenieMessage;
  if (!potentialAlarmPayload) {
    return;
  }

  if (process.env.DEBUG) {
    log(`ops genie payload`, 'INFO', potentialAlarmPayload);
  }

  await sendToOpsGenieLowLevel(potentialAlarmPayload);
};

const prettyPrintPercentage = (percentage: BigNumber) => {
  try {
    return (percentage.div(100000).toNumber() / Math.pow(10, 11)).toPrecision(3);
  } catch (e) {
    logTrace('Failed to pretty-print percentage', 'ERROR', (e as Error).stack);
  }

  return '(out of range)';
};

export const calculateEvaluationThreshold = (updateConditionPercentage: number, deviationAlertMultiplier: number) =>
  BigNumber.from(updateConditionPercentage * 10000 * deviationAlertMultiplier).mul(
    BigNumber.from(10).pow(BigNumber.from(12))
  );

// TODO make more generic so it can be used for OpsGenie/other services
export const evaluateThreshold = async (
  metric: OutputMetric,
  makeMessage: (
    metric: OutputMetric,
    headline: string,
    unitPretext?: string,
    unitPostText?: string,
    modifier?: BigNumber
  ) => {},
  globalConfig: GlobalConfig
) => {
  debugLog(JSON.stringify(metric, null, 2));
  const operationsRepository = readOperationsRepository();
  try {
    const compare = (funcName: 'lt' | 'gt' | 'eq', threshold: number | BigNumber, returnable: any) => {
      if (BigNumber.from(metric.value)[funcName](threshold)) {
        return returnable;
      }
      return null;
    };

    // TODO These should be made configurable in master config
    // TODO some values are chain-related (eg. block lateness) - they should be configured as such
    switch (metric.metricName) {
      case Metric.BEACON_OUTSTANDING_REQUEST_LATENESS:
        return compare('gt', 30, makeMessage(metric, `Beacon Outstanding Request Late`, 'Late-ness', 'blocks'));
      case Metric.FAILED_FULFILMENTS:
        return compare('gt', 5, makeMessage(metric, `Failed Fulfilments detected`));
      case Metric.BACKTEST_DEVIATION: {
        const actualValue = metric.value as BigNumber;
        const evaluationThreshold = calculateEvaluationThreshold(
          metric.metadata.deviationPercentage,
          metric.metadata.deviationAlertMultiplier
        );

        if (actualValue.gt(evaluationThreshold)) {
          const opsGenieMessage = {
            headline: `Beacon deviation exceeded: ${metric.metadata.name}`,
            message: `Current value: ${prettyPrintPercentage(
              actualValue
            )}% vs evaluation threshold: ${prettyPrintPercentage(evaluationThreshold)}% (${
              globalConfig.deviationAlertMultiplier
            }x)`,
            description: `Beacon Metadata: \n${JSON.stringify(metric.metadata)}`,
            timestamp: metric.metadata.unixtime,
            alias: `${metric.metadata.name}`,
          } as OpsGenieMessage & { timestamp: number };

          return opsGenieMessage;
        } else {
          return null;
        }
      }
      case Metric.API_BEACON_DEVIATION: {
        debugLog(JSON.stringify(metric, null, 2));
        if (!metric.value) {
          console.debug('Metric value undefined', metric);
          return;
        }

        const beaconResponse = metric?.metadata?.beaconResponse;
        if (!beaconResponse) {
          console.debug('Metric beaconResponse undefined', metric);
          return;
        }

        const chainName = Object.values(operationsRepository.chains).find(
          (chain) => chain.id === metric.metadata.chainId
        )?.name;
        if (!chainName) {
          console.debug('No chain name found', metric);
          return;
        }
        const updateConditionPercentage = metric.metadata.chains[chainName].airseekerConfig.deviationThreshold;

        const actualValue = metric.value as BigNumber;

        const evaluationThreshold = calculateEvaluationThreshold(
          updateConditionPercentage,
          globalConfig.deviationAlertMultiplier
        );

        if (actualValue.gt(evaluationThreshold)) {
          debugLog('Inside evaluateThreshold where actualValue greater than evaluationThreshold');
          const opsGenieMessage = {
            headline: `Beacon deviation exceeded: ${metric.metadata.name} on ${await resolveChainName(
              metric.metadata.chainId
            )}`,
            priority: 'P2',
            message: `Current value: ${prettyPrintPercentage(
              actualValue
            )}% vs evaluation threshold: ${prettyPrintPercentage(evaluationThreshold)}% (${
              globalConfig.deviationAlertMultiplier
            }x) on chain ${await resolveChainName(metric.metadata.chainId)}`,
            description: `Beacon Metadata: \n${JSON.stringify(metric.metadata)}`,
            alias: `${metric.metricName}-dev-tol-${keccak256(
              new TextEncoder().encode(`${metric.metadata.chainId}${metric.metadata.beaconId}`)
            )}`,
          } as OpsGenieMessage;

          return opsGenieMessage;
        } else {
          const alias = `${metric.metricName}-dev-tol-${keccak256(
            new TextEncoder().encode(`${metric.metadata.chainId}${metric.metadata.beaconId}`)
          )}`;

          await go(() => closeOpsGenieAlertWithAlias(alias, globalConfig.opsGenieConfig), {
            retries: 3,
            retryDelayMs: 5_000,
          });
          return null;
        }
      }
      default:
        return null;
    }
  } catch (e) {
    // We won't wait for the promise to resolve
    await sendToOpsGenieLowLevel({
      message: `Error in metric evaluation function`,
      alias: 'metric-evaluation-error',
      description: JSON.stringify(e, null, 2),
      priority: 'P2',
    });
  }
};
