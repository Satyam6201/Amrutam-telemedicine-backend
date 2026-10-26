import Redis from 'ioredis';
import config from './index.js';
import logger from '../src/utils/logger.js';

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  keyPrefix: config.redis.keyPrefix,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    logger.warn({ attempt: times, delay }, 'Redis reconnecting...');
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('connect', () => {
  logger.info('Connected to Redis');
});

redis.on('ready', () => {
  logger.info('Redis connection ready for commands');
});

redis.on('error', (err) => {
  logger.error({ err: err.message }, 'Redis connection error');
});

export default redis;

