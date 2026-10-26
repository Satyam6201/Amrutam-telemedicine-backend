import redis from '../../config/redis.js';
import { TooManyRequestsError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Sliding-window rate limiter using Redis sorted sets (ZADD / ZREMRANGEBYSCORE / ZCARD)
 * @param {object} options
 * @param {number} options.windowMs - Sliding window in milliseconds (default: 60,000)
 * @param {number} options.max - Max requests within window
 * @param {string} options.keyPrefix - Prefix for Redis key
 */
export function rateLimiter({ windowMs = 60000, max = 120, keyPrefix = 'rl:global' } = {}) {
  return async (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const identifier = req.user ? `${req.user.id}` : ip;
    const redisKey = `${keyPrefix}:${identifier}`;
    const now = Date.now();
    const clearBefore = now - windowMs;

    try {
      const pipeline = redis.pipeline();
      // Remove requests older than the sliding window
      pipeline.zremrangebyscore(redisKey, 0, clearBefore);
      // Add current request timestamp
      pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);
      // Count total requests in window
      pipeline.zcard(redisKey);
      // Set key TTL to window size
      pipeline.pexpire(redisKey, windowMs);

      const results = await pipeline.exec();
      const count = results[2][1];

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));

      if (count > max) {
        logger.warn({ identifier, count, max, keyPrefix }, 'Rate limit exceeded');
        return next(
          new TooManyRequestsError(`Rate limit exceeded. Maximum ${max} requests allowed per ${windowMs / 1000}s.`)
        );
      }

      next();
    } catch (error) {
      logger.error({ err: error.message }, 'Redis rate limiter error, allowing request through');
      next();
    }
  };
}

export default rateLimiter;
