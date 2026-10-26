import { pool } from '../../config/database.js';
import { computeAuditHash } from '../utils/crypto.js';
import logger from '../utils/logger.js';

/**
 * Persist an immutable audit log entry linked to the previous log's SHA-256 hash
 * Employs a transaction-level PostgreSQL advisory lock to ensure strictly linear,
 * concurrency-safe cryptographic hash chaining under high parallel load.
 */
export async function logAuditEvent({
  userId,
  action,
  resourceType,
  resourceId,
  ipAddress,
  userAgent,
  previousState = null,
  newState = null,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 1. Transaction-scoped advisory lock serializes cryptographic chain construction
    await client.query("SELECT pg_advisory_xact_lock(hashtext('amrutam_audit_log_chain'))");

    // 2. Fetch latest audit log hash to maintain cryptographic chain
    const latestRes = await client.query(
      `SELECT hash_signature FROM audit_logs
       ORDER BY id DESC
       LIMIT 1`
    );

    const prevHash = latestRes.rows.length > 0
      ? latestRes.rows[0].hash_signature
      : '0000000000000000000000000000000000000000000000000000000000000000';

    const timestamp = new Date().toISOString();

    // 3. Compute tamper-evident hash signature
    const hashSignature = computeAuditHash({
      prevHash,
      userId,
      action,
      resourceType,
      resourceId: String(resourceId),
      timestamp,
      oldVal: previousState,
      newVal: newState,
    });

    // 4. Insert into audit_logs table
    await client.query(
      `INSERT INTO audit_logs (
        user_id, action, resource_type, resource_id, ip_address, user_agent,
        previous_state, new_state, prev_hash, hash_signature, timestamp
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        userId || null,
        action,
        resourceType,
        String(resourceId),
        ipAddress || '127.0.0.1',
        userAgent || 'API-Client',
        previousState ? JSON.stringify(previousState) : null,
        newState ? JSON.stringify(newState) : null,
        prevHash,
        hashSignature,
        timestamp,
      ]
    );

    await client.query('COMMIT');
    logger.debug({ action, resourceType, resourceId }, 'Audit log recorded');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ err: error.message, action, resourceId }, 'Failed to record audit log');
  } finally {
    client.release();
  }
}

/**
 * Express middleware helper to log action automatically
 */
export function auditTrail(action, resourceType, getResourceId = (req) => req.params.id) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        const resourceId = getResourceId(req) || (body && body.data && body.data.id);
        logAuditEvent({
          userId: req.user ? req.user.id : null,
          action,
          resourceType,
          resourceId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          previousState: null,
          newState: body.data,
        });
      }
      return originalJson(body);
    };
    next();
  };
}

export default { logAuditEvent, auditTrail };
