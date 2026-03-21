import pino from 'pino';

const logLevel = process.env.LOG_LEVEL ?? getDefaultLogLevel();
const transport = createTransport();

export const logger = pino(
  {
    level: logLevel,
    enabled: !isTestEnvironment(),
  },
  transport,
);

function createTransport() {
  if (process.env.NODE_ENV === 'development') {
    return pino.transport({
      targets: [
        {
          level: logLevel,
          target: 'pino-pretty',
          options: {
            colorize: true,
            destination: 1,
            ignore: 'pid,hostname',
            translateTime: 'SYS:standard',
          },
        },
        {
          level: logLevel,
          target: 'pino/file',
          options: {
            destination: process.env.LOG_FILE_PATH ?? './logs/web.log',
            mkdir: true,
          },
        },
      ],
    });
  }

  if (shouldUsePrettyLogs()) {
    return pino.transport({
      targets: [
        {
          level: logLevel,
          target: 'pino-pretty',
          options: {
            colorize: true,
            destination: 1,
            ignore: 'pid,hostname',
            translateTime: 'SYS:standard',
          },
        },
      ],
    });
  }

  return undefined;
}

function getDefaultLogLevel() {
  return 'info';
}

function isTestEnvironment() {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

function shouldUsePrettyLogs() {
  return process.env.NODE_ENV !== 'production';
}
