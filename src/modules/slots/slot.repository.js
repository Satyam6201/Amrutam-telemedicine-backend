import { query, withTransaction } from '../../../config/database.js';

export class SlotRepository {

  static async findSlotsByDoctorAndDate(doctorId, date, status) {
    const conditions = ['doctor_id = $1'];
    const params = [doctorId];
    let paramIndex = 2;

    if (date) {
      conditions.push(`slot_date = $${paramIndex++}`);
      params.push(date);
    } else {
      conditions.push(`slot_date >= CURRENT_DATE`);
    }

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    const sql = `
      SELECT id, doctor_id, slot_date, start_time, end_time, status, held_until, version
      FROM availability_slots
      WHERE ${conditions.join(' AND ')}
      ORDER BY slot_date ASC, start_time ASC
    `;

    const res = await query(sql, params);
    return res.rows;
  }

  static async findSlotById(slotId) {
    const res = await query(
      `SELECT s.*, d.consultation_fee, d.user_id as doctor_user_id
       FROM availability_slots s
       JOIN doctors d ON d.id = s.doctor_id
       WHERE s.id = $1`,
      [slotId]
    );
    return res.rows[0] || null;
  }

  static async holdSlot(slotId, patientId, ttlMinutes = 15) {
    const sql = `
      UPDATE availability_slots
      SET status = 'HELD',
          held_until = NOW() + ($1 || ' minutes')::interval,
          held_by_patient_id = $2,
          version = version + 1,
          updated_at = NOW()
      WHERE id = $3
        AND (status = 'AVAILABLE' OR (status = 'HELD' AND held_until < NOW()))
      RETURNING *
    `;

    const res = await query(sql, [ttlMinutes, patientId, slotId]);
    return res.rows[0] || null;
  }

  static async releaseSlot(slotId, patientId) {
    const sql = `
      UPDATE availability_slots
      SET status = 'AVAILABLE',
          held_until = NULL,
          held_by_patient_id = NULL,
          version = version + 1,
          updated_at = NOW()
      WHERE id = $1
        AND held_by_patient_id = $2
        AND status = 'HELD'
      RETURNING *
    `;

    const res = await query(sql, [slotId, patientId]);
    return res.rows[0] || null;
  }

  static async confirmSlot(slotId, patientId, client = null) {
    const sql = `
      UPDATE availability_slots
      SET status = 'BOOKED',
          held_until = NULL,
          version = version + 1,
          updated_at = NOW()
      WHERE id = $1
        AND (
          (status = 'HELD' AND held_by_patient_id = $2)
          OR (status = 'AVAILABLE')
        )
      RETURNING *
    `;

    if (client) {
      const res = await client.query(sql, [slotId, patientId]);
      return res.rows[0] || null;
    }

    const res = await query(sql, [slotId, patientId]);
    return res.rows[0] || null;
  }

  static async releaseAllExpiredSlots() {
    const sql = `
      UPDATE availability_slots
      SET status = 'AVAILABLE',
          held_until = NULL,
          held_by_patient_id = NULL,
          version = version + 1,
          updated_at = NOW()
      WHERE status = 'HELD'
        AND held_until < NOW()
      RETURNING id, doctor_id, slot_date, start_time
    `;
    const res = await query(sql);
    return res.rows;
  }

  static async bulkCreateSlots(doctorId, date, slots) {
    return withTransaction(async (client) => {
      const inserted = [];
      for (const slot of slots) {
        const res = await client.query(
          `INSERT INTO availability_slots (doctor_id, slot_date, start_time, end_time, status)
           VALUES ($1, $2, $3, $4, 'AVAILABLE')
           ON CONFLICT (doctor_id, slot_date, start_time) DO NOTHING
           RETURNING *`,
          [doctorId, date, slot.startTime, slot.endTime]
        );
        if (res.rows.length > 0) {
          inserted.push(res.rows[0]);
        }
      }
      return inserted;
    });
  }
}

export default SlotRepository;

