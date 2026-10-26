import { query } from '../../../config/database.js';

export class PrescriptionRepository {
  static async createPrescription({
    consultationId,
    doctorId,
    patientId,
    encryptedDiagnosis,
    medications,
    advice,
    followUpDate,
    digitalSignature,
  }) {
    const sql = `
      INSERT INTO prescriptions (
        consultation_id, doctor_id, patient_id, encrypted_diagnosis,
        medications, advice, follow_up_date, digital_signature
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (consultation_id) DO UPDATE SET
        encrypted_diagnosis = EXCLUDED.encrypted_diagnosis,
        medications = EXCLUDED.medications,
        advice = EXCLUDED.advice,
        follow_up_date = EXCLUDED.follow_up_date,
        digital_signature = EXCLUDED.digital_signature,
        updated_at = NOW()
      RETURNING *
    `;

    const res = await query(sql, [
      consultationId,
      doctorId,
      patientId,
      encryptedDiagnosis,
      JSON.stringify(medications),
      advice || null,
      followUpDate || null,
      digitalSignature,
    ]);

    return res.rows[0];
  }

  static async findByConsultationId(consultationId) {
    const sql = `
      SELECT p.*,
             d.user_id as doctor_user_id,
             d.registration_number, d.qualification,
             dp.first_name as doctor_first_name, dp.last_name as doctor_last_name,
             pp.first_name as patient_first_name, pp.last_name as patient_last_name,
             u_pat.email as patient_email
      FROM prescriptions p
      JOIN doctors d ON d.id = p.doctor_id
      JOIN profiles dp ON dp.user_id = d.user_id
      JOIN profiles pp ON pp.user_id = p.patient_id
      JOIN users u_pat ON u_pat.id = p.patient_id
      WHERE p.consultation_id = $1
    `;
    const res = await query(sql, [consultationId]);
    return res.rows[0] || null;
  }

  static async findById(id) {
    const sql = `
      SELECT p.*,
             d.registration_number, d.qualification,
             dp.first_name as doctor_first_name, dp.last_name as doctor_last_name,
             pp.first_name as patient_first_name, pp.last_name as patient_last_name
      FROM prescriptions p
      JOIN doctors d ON d.id = p.doctor_id
      JOIN profiles dp ON dp.user_id = d.user_id
      JOIN profiles pp ON pp.user_id = p.patient_id
      WHERE p.id = $1
    `;
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }
}

export default PrescriptionRepository;

