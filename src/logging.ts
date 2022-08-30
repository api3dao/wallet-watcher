export const log = (message: string, logLevel: 'ERROR' | 'INFO' = 'INFO', ...args: any[]) => {
  console.log(`[${logLevel}]\t ${message}`, ...args);
};

export const logTrace = (message: string, logLevel?: 'ERROR' | 'INFO', ...args: any[]) => {
  console.trace(`[${logLevel}]\t ${message}`, ...args);
};
