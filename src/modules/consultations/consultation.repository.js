import { query, withTransaction } from '../../../config/database.js';
import SlotRepository from '../slots/slot.repository.js';

export class ConsultationRepository {
  /**
   * Insert new consultation and atomically confirm slot within a transaction
   */
  static async createConsultation({
    doctorId,
    patientId,
    slotId,
    scheduledAt,
    encryptedSymptoms,
    videoRoomUrl,
  }) {
    return withTransaction(async (client) => {
      // 1. Confirm slot atomically
      const updatedSlot = await SlotRepository.confirmSlot(slotId, patientId, client);
      if (!updatedSlot) {
        throw new Error('SLOT_UNAVAILABLE');
      }

      // 2. Insert into partitioned consultations table
      const consultRes = await client.query(
        `INSERT INTO consultations (
          doctor_id, patient_id, slot_id, scheduled_at, status,
          encrypted_symptoms, video_room_url
         )
         VALUES ($1, $2, $3, $4, 'CONFIRMED', $5, $6)
         RETURNING *`,
        [
          doctorId,
          patientId,
          slotId,
          scheduledAt,
          encryptedSymptoms,
          videoRoomUrl,
        ]
      );

      return consultRes.rows[0];
    });
  }

  static async findById(id) {
    const sql = `
      SELECT c.*,
             d.user_id as doctor_user_id,
             d.consultation_fee, d.qualification, d.registration_number,
             dp.first_name as doctor_first_name, dp.last_name as doctor_last_name,
             pp.first_name as patient_first_name, pp.last_name as patient_last_name,
             u_pat.email as patient_email, u_pat.phone as patient_phone,
             u_doc.email as doctor_email
      FROM consultations c
      JOIN doctors d ON d.id = c.doctor_id
      JOIN profiles dp ON dp.user_id = d.user_id
      JOIN users u_doc ON u_doc.id = d.user_id
      JOIN users u_pat ON u_pat.id = c.patient_id
      JOIN profiles pp ON pp.user_id = c.patient_id
      WHERE c.id = $1
    `;
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  static async listConsultations({ userId, role, status, page = 1, limit = 20 }) {
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (role === 'PATIENT') {
      conditions.push(`c.patient_id = $${paramIndex++}`);
      params.push(userId);
    } else if (role === 'DOCTOR') {
      conditions.push(`d.user_id = $${paramIndex++}`);
      params.push(userId);
    } // ADMIN has no filter, sees all

    if (status) {
      conditions.push(`c.status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const countSql = `
      SELECT COUNT(*) as total
      FROM consultations c
      JOIN doctors d ON d.id = c.doctor_id
      ${whereClause}
    `;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0].total, 10);

    const dataSql = `
      SELECT c.id, c.doctor_id, c.patient_id, c.slot_id, c.scheduled_at, c.status,
             c.video_room_url, c.cancellation_reason, c.created_at,
             dp.first_name as doctor_first_name, dp.last_name as doctor_last_name,
             pp.first_name as patient_first_name, pp.last_name as patient_last_name,
             d.consultation_fee
      FROM consultations c
      JOIN doctors d ON d.id = c.doctor_id
      JOIN profiles dp ON dp.user_id = d.user_id
      JOIN profiles pp ON pp.user_id = c.patient_id
      ${whereClause}
      ORDER BY c.scheduled_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const dataParams = [...params, limit, offset];
    const dataRes = await query(dataSql, dataParams);

    return {
      consultations: dataRes.rows,
      total,
      page,
      limit,
    };
  }

  static async updateStatus({ id, status, scheduledAt, cancellationReason, encryptedNotes }) {
    const updates = ['status = $1', 'updated_at = NOW()'];
    const params = [status];
    let paramIndex = 2;

    if (cancellationReason) {
      updates.push(`cancellation_reason = $${paramIndex++}`);
      params.push(cancellationReason);
    }

    if (encryptedNotes) {
      updates.push(`encrypted_clinical_notes = $${paramIndex++}`);
      params.push(encryptedNotes);
    }

    // Partition key scheduled_at must be used if available for fast partition pruning
    let whereClause = `WHERE id = $${paramIndex++}`;
    params.push(id);

    if (scheduledAt) {
      whereClause += ` AND scheduled_at = $${paramIndex++}`;
      params.push(scheduledAt);
    }

    const sql = `
      UPDATE consultations
      SET ${updates.join(', ')}
      ${whereClause}
      RETURNING *
    `;

    const res = await query(sql, params);
    return res.rows[0] || null;
  }
}

export default ConsultationRepository;
