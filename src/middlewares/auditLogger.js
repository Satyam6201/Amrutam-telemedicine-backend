import { query } from '../../config/database.js';
import { computeAuditHash } from '../utils/crypto.js';
import logger from '../utils/logger.js';

/**
 * Persist an immutable audit log entry linked to the previous log's SHA-256 hash
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
  try {
    // 1. Fetch latest audit log hash to maintain cryptographic chain
    const latestRes = await query(
      `SELECT hash_signature FROM audit_logs
       ORDER BY timestamp DESC, id DESC
       LIMIT 1`
    );

    const prevHash = latestRes.rows.length > 0
      ? latestRes.rows[0].hash_signature
      : '0000000000000000000000000000000000000000000000000000000000000000';

    const timestamp = new Date().toISOString();

    // 2. Compute tamper-evident hash signature
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

    // 3. Insert into audit_logs table
    await query(
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

    logger.debug({ action, resourceType, resourceId }, 'Audit log recorded');
  } catch (error) {
    logger.error({ err: error.message, action, resourceId }, 'Failed to record audit log');
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
