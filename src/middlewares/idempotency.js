import config from '../../config/index.js';
import { query } from '../../config/database.js';
import redis from '../../config/redis.js';
import { hashPayload } from '../utils/crypto.js';
import { BadRequestError, ConflictError, UnprocessableEntityError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export function idempotency({ required = false } = {}) {
  return async (req, res, next) => {
    // Only apply to write requests
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers['idempotency-key'];

    if (!idempotencyKey) {
      if (required) {
        return next(new BadRequestError('Missing required Idempotency-Key header for this write operation.'));
      }
      return next();
    }

    const requestHash = hashPayload({
      path: req.originalUrl,
      body: req.body,
    });

    const redisKey = `idempotency:${idempotencyKey}`;
    const ttlSeconds = config.idempotency.ttlSeconds;

    try {
      // 1. Check Redis first for low latency (<2ms)
      const cached = await redis.get(redisKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.status === 'PROCESSING') {
          return next(new ConflictError('A request with this Idempotency-Key is currently being processed.'));
        }

        if (parsed.requestHash !== requestHash) {
          return next(
            new UnprocessableEntityError('Idempotency key reuse detected with differing request payload.')
          );
        }

        res.set('X-Idempotent-Replay', 'true');
        return res.status(parsed.statusCode).json(parsed.body);
      }

      // 2. Check Database record if Redis missed
      const dbCheck = await query(
        'SELECT idempotency_key, request_hash, status, response_code, response_body FROM idempotency_records WHERE idempotency_key = $1',
        [idempotencyKey]
      );

      if (dbCheck.rows.length > 0) {
        const record = dbCheck.rows[0];
        if (record.status === 'PROCESSING') {
          return next(new ConflictError('A request with this Idempotency-Key is currently being processed.'));
        }

        if (record.request_hash !== requestHash) {
          return next(
            new UnprocessableEntityError('Idempotency key reuse detected with differing request payload.')
          );
        }

        // Populate Redis cache for future reads
        await redis.set(
          redisKey,
          JSON.stringify({
            status: record.status,
            requestHash: record.request_hash,
            statusCode: record.response_code,
            body: record.response_body,
          }),
          'EX',
          ttlSeconds
        );

        res.set('X-Idempotent-Replay', 'true');
        return res.status(record.response_code).json(record.response_body);
      }

      // 3. Mark as PROCESSING in Redis & DB
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      await redis.set(
        redisKey,
        JSON.stringify({
          status: 'PROCESSING',
          requestHash,
        }),
        'EX',
        60 // Processing lock expires in 60s if crashed
      );

      await query(
        `INSERT INTO idempotency_records (idempotency_key, request_hash, status, expires_at)
         VALUES ($1, $2, 'PROCESSING', $3)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [idempotencyKey, requestHash, expiresAt]
      );

      // 4. Intercept response to record final payload
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        const statusCode = res.statusCode;
        const status = statusCode >= 200 && statusCode < 400 ? 'COMPLETED' : 'FAILED';

        // Background update in Redis and DB
        Promise.all([
          redis.set(
            redisKey,
            JSON.stringify({
              status,
              requestHash,
              statusCode,
              body,
            }),
            'EX',
            ttlSeconds
          ),
          query(
            `UPDATE idempotency_records
             SET status = $1, response_code = $2, response_body = $3
             WHERE idempotency_key = $4`,
            [status, statusCode, JSON.stringify(body), idempotencyKey]
          ),
        ]).catch((err) => {
          logger.error({ err: err.message, idempotencyKey }, 'Failed to persist idempotency completion');
        });

        return originalJson(body);
      };

      next();
    } catch (error) {
      logger.error({ err: error.message, idempotencyKey }, 'Error in idempotency middleware');
      next(error);
    }
  };
}

export default idempotency;
