import crypto from 'crypto';
import redis from '../../config/redis.js';
import { ConflictError } from './errors.js';
import logger from './logger.js';

const RELEASE_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

export class DistributedLock {

  static async acquire(resourceKey, ttlMs = 10000) {
    const token = crypto.randomUUID();
    const key = `lock:${resourceKey}`;

    try {

      const result = await redis.set(key, token, 'PX', ttlMs, 'NX');
      if (result === 'OK') {
        logger.debug({ resourceKey, token }, 'Acquired distributed lock');
        return token;
      }
      return null;
    } catch (error) {
      logger.error({ error: error.message, resourceKey }, 'Failed to acquire distributed lock');
      return null;
    }
  }

  static async release(resourceKey, token) {
    if (!token) return false;
    const key = `lock:${resourceKey}`;

    try {
      const result = await redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
      const released = result === 1;
      if (released) {
        logger.debug({ resourceKey, token }, 'Released distributed lock');
      } else {
        logger.warn({ resourceKey, token }, 'Lock was already expired or owned by another process');
      }
      return released;
    } catch (error) {
      logger.error({ error: error.message, resourceKey }, 'Error releasing distributed lock');
      return false;
    }
  }

  static async withLock(resourceKey, ttlMs, callback) {
    const token = await DistributedLock.acquire(resourceKey, ttlMs);
    if (!token) {
      throw new ConflictError(
        `Resource is currently locked by a concurrent operation. Please retry: ${resourceKey}`
      );
    }

    try {
      return await callback();
    } finally {
      await DistributedLock.release(resourceKey, token);
    }
  }
}

export default DistributedLock;

