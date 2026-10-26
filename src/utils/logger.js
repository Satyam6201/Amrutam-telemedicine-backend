import pino from 'pino';
import config from '../../config/index.js';

const isDev = config.env === 'development';

export const logger = pino({
  level: config.logging.level,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  base: {
    service: 'amrutam-backend',
    env: config.env,
  },
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});

export default logger;
