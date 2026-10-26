import pg from 'pg';
import config from './index.js';
import logger from '../src/utils/logger.js';

const { Pool } = pg;

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  min: config.db.min,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
  connectionTimeoutMillis: config.db.connectionTimeoutMillis,
});

pool.on('connect', () => {
  logger.debug('New PostgreSQL client connected to connection pool');
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error on idle client');
});

export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 150) {
      logger.warn({ query: text, duration, rows: res.rowCount }, 'Slow database query detected');
    }
    return res;
  } catch (error) {
    logger.error({ query: text, err: error.message }, 'Database query failed');
    throw error;
  }
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default { pool, query, withTransaction };

