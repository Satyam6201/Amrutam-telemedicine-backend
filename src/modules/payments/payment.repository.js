import { query } from '../../../config/database.js';

export class PaymentRepository {
  static async createPayment({
    consultationId,
    patientId,
    amount,
    currency = 'INR',
    paymentMethod = 'RAZORPAY_UPI',
    transactionId,
    idempotencyKey,
  }) {
    const sql = `
      INSERT INTO payments (
        consultation_id, patient_id, amount, currency, payment_method,
        transaction_id, status, idempotency_key
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7)
      RETURNING *
    `;
    const res = await query(sql, [
      consultationId,
      patientId,
      amount,
      currency,
      paymentMethod,
      transactionId,
      idempotencyKey || null,
    ]);
    return res.rows[0];
  }

  static async findById(id) {
    const res = await query('SELECT * FROM payments WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  static async updateStatus(id, status, errorMessage = null) {
    const sql = `
      UPDATE payments
      SET status = $1, error_message = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;
    const res = await query(sql, [status, errorMessage, id]);
    return res.rows[0] || null;
  }
}

export default PaymentRepository;

