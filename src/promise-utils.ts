import { AttemptOptions, retry, sleep } from '@lifeomic/attempt';
import { DEFAULT_RETRY_DELAY_MS, DEFAULT_TIMEOUT } from './constants';

export type GoResult<T> = [Error, null] | [null, T];

export interface PromiseOptions {
  readonly retries?: number;
  readonly retryDelayMs?: number;
  readonly timeoutMs?: number;
}

export interface RetryOptions extends PromiseOptions {
  readonly retries: number;
}

function successFn<T>(value: T): [null, T] {
  return [null, value];
}
function errorFn(err: Error): [Error, null] {
  return [err, null];
}

// Go style async handling
export function goRaw<T>(fn: () => Promise<T>, options?: PromiseOptions): Promise<GoResult<T>> {
  if (options?.retries) {
    const optionsWithRetries = { ...options, retries: options.retries! };
    return retryOperation(fn, optionsWithRetries).then(successFn).catch(errorFn);
  }

  if (options?.timeoutMs) {
    return promiseTimeout(options.timeoutMs, fn()).then(successFn).catch(errorFn);
  }

  return fn().then(successFn).catch(errorFn);
}

export const go = (fn: () => Promise<any>, options?: PromiseOptions) => {
  const mergedOptions = {
    timeoutMs: DEFAULT_TIMEOUT,
    ...options,
  };

  return goRaw(fn, mergedOptions);
};

export function goSync<T>(fn: () => T): GoResult<T> {
  try {
    return successFn(fn());
  } catch (err) {
    return errorFn(err as Error);
  }
}

export async function retryOperation<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  // We may want to use some of these options in the future
  const attemptOptions: AttemptOptions<any> = {
    delay: options.retryDelayMs || DEFAULT_RETRY_DELAY_MS,
    maxAttempts: options.retries + 1,
    initialDelay: 0,
    minDelay: 0,
    maxDelay: 0,
    factor: 0,
    timeout: options.timeoutMs || 0,
    jitter: false,
    handleError: null,
    handleTimeout: null,
    beforeAttempt: null,
    calculateDelay: null,
  };
  return retry((_context) => operation(), attemptOptions);
}

export interface ContinuousRetryOptions {
  readonly delay?: number;
}

export function promiseTimeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  let mutableTimeoutId: NodeJS.Timeout;
  const timeout = new Promise((_res, reject) => {
    mutableTimeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out in ${ms} ms.`));
    }, ms);
  });

  const wrappedPromise = promise.finally(() => {
    if (mutableTimeoutId) {
      clearTimeout(mutableTimeoutId);
    }
  });

  return Promise.race([wrappedPromise, timeout]) as Promise<T>;
}

export function retryOnTimeout<T>(maxTimeoutMs: number, operation: () => Promise<T>, options?: ContinuousRetryOptions) {
  const promise = new Promise<T>((resolve, reject) => {
    function run(): Promise<any> {
      // If the promise is successful, resolve it and bubble the result up
      return operation()
        .then(resolve)
        .catch((reason: any) => {
          // Only if the error is a timeout error, do we retry the promise
          if (reason instanceof Error && reason.message.includes('Operation timed out')) {
            // Delay the new attempt slightly
            return sleep(options?.delay || DEFAULT_RETRY_DELAY_MS)
              .then(run)
              .then(resolve)
              .catch(reject);
          }

          // If the error is NOT a timeout error, then we reject immediately
          return reject(reason);
        });
    }

    return run();
  });

  return promiseTimeout(maxTimeoutMs, promise);
}

export const timedExecute = async (fn: () => Promise<any>, options?: PromiseOptions) => {
  const operation = async () => {
    const start = new Date().getTime();
    const result = await fn();
    const end = new Date().getTime();

    return [end - start, result];
  };

  return go(operation, options);
};

export const settleAndCheckForPromiseRejections = async (promises?: Promise<any>[]) => {
  if (!promises) {
    return;
  }

  const settlements = await Promise.allSettled(promises);
  const rejections = settlements.filter((settlement) => settlement.status === 'rejected') as PromiseRejectedResult[];
  rejections.forEach((rejection) => {
    console.error(`Rejection from allSettled: ${rejection.reason}`);
  });

  if (rejections.length > 0) {
    throw new Error(`Promises rejected: ${rejections.length}`);
  }
};
