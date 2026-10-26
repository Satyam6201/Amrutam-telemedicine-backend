import { query, withTransaction } from '../../../config/database.js';

export class AuthRepository {
  static async findUserByEmail(email) {
    const res = await query(
      `SELECT u.id, u.email, u.password_hash, u.role, u.phone, u.is_mfa_enabled,
              u.mfa_secret, u.is_verified, u.created_at,
              p.first_name, p.last_name
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.email = $1`,
      [email]
    );
    return res.rows[0] || null;
  }

  static async findUserById(id) {
    const res = await query(
      `SELECT u.id, u.email, u.role, u.phone, u.is_mfa_enabled, u.is_verified, u.created_at,
              p.first_name, p.last_name, p.gender, p.date_of_birth, p.blood_group,
              d.id as doctor_id, d.registration_number, d.qualification, d.consultation_fee
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN doctors d ON d.user_id = u.id
       WHERE u.id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  static async createUserWithProfile({
    email,
    passwordHash,
    role,
    phone,
    firstName,
    lastName,
    registrationNumber,
    qualification,
    consultationFee,
  }) {
    return withTransaction(async (client) => {
      // 1. Create user
      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, role, phone, is_verified)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id, email, role, phone, is_mfa_enabled, created_at`,
        [email, passwordHash, role, phone || null]
      );
      const user = userRes.rows[0];

      // 2. Create profile
      await client.query(
        `INSERT INTO profiles (user_id, first_name, last_name)
         VALUES ($1, $2, $3)`,
        [user.id, firstName, lastName]
      );

      // 3. If doctor, create doctor record
      let doctorId = null;
      if (role === 'DOCTOR') {
        const docRes = await client.query(
          `INSERT INTO doctors (user_id, registration_number, qualification, consultation_fee, is_approved)
           VALUES ($1, $2, $3, $4, false)
           RETURNING id`,
          [
            user.id,
            registrationNumber || `REG-${Date.now()}`,
            qualification || 'BAMS',
            consultationFee || 500.0,
          ]
        );
        doctorId = docRes.rows[0].id;
      }

      return {
        ...user,
        firstName,
        lastName,
        doctorId,
      };
    });
  }

  static async updateMfaSecret(userId, secret) {
    await query(
      `UPDATE users
       SET mfa_secret = $1
       WHERE id = $2`,
      [secret, userId]
    );
  }

  static async enableMfa(userId) {
    await query(
      `UPDATE users
       SET is_mfa_enabled = true
       WHERE id = $1`,
      [userId]
    );
  }

  static async disableMfa(userId) {
    await query(
      `UPDATE users
       SET is_mfa_enabled = false, mfa_secret = null
       WHERE id = $1`,
      [userId]
    );
  }
}

export default AuthRepository;
