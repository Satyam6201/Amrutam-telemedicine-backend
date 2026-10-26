import { query } from '../../../config/database.js';

export class AuditRepository {
  static async listLogs({ resourceType, resourceId, userId, action, page = 1, limit = 50 }) {
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (resourceType) {
      conditions.push(`resource_type = $${paramIndex++}`);
      params.push(resourceType);
    }

    if (resourceId) {
      conditions.push(`resource_id = $${paramIndex++}`);
      params.push(resourceId);
    }

    if (userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(userId);
    }

    if (action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(action);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const countSql = `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0].total, 10);

    const dataSql = `
      SELECT id, user_id, action, resource_type, resource_id, ip_address,
             user_agent, previous_state, new_state, prev_hash, hash_signature, timestamp
      FROM audit_logs
      ${whereClause}
      ORDER BY timestamp DESC, id DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const dataParams = [...params, limit, offset];
    const dataRes = await query(dataSql, dataParams);

    return {
      logs: dataRes.rows,
      total,
      page,
      limit,
    };
  }

  static async getLogsForIntegrityCheck(limit = 500) {
    const sql = `
      SELECT id, user_id, action, resource_type, resource_id, timestamp,
             previous_state, new_state, prev_hash, hash_signature
      FROM audit_logs
      ORDER BY id ASC
      LIMIT $1
    `;
    const res = await query(sql, [limit]);
    return res.rows;
  }
}

export default AuditRepository;

