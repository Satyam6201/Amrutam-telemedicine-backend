import { query } from '../../../config/database.js';

export class AnalyticsRepository {
  /**
   * System overview metrics
   */
  static async getOverviewMetrics() {
    const consultationsSql = `
      SELECT
        COUNT(*) as total_consultations,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_consultations,
        COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled_consultations,
        COUNT(*) FILTER (WHERE status = 'CONFIRMED' OR status = 'SCHEDULED') as upcoming_consultations,
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as active_consultations
      FROM consultations
    `;

    const revenueSql = `
      SELECT
        COALESCE(SUM(amount), 0) as total_revenue,
        COUNT(*) as total_successful_payments,
        COALESCE(AVG(amount), 0) as average_ticket_size
      FROM payments
      WHERE status = 'CAPTURED'
    `;

    const userStatsSql = `
      SELECT
        COUNT(*) FILTER (WHERE role = 'PATIENT') as total_patients,
        COUNT(*) FILTER (WHERE role = 'DOCTOR') as total_doctors,
        COUNT(*) FILTER (WHERE role = 'ADMIN') as total_admins
      FROM users
    `;

    const [consultRes, revRes, userRes] = await Promise.all([
      query(consultationsSql),
      query(revenueSql),
      query(userStatsSql),
    ]);

    return {
      consultations: consultRes.rows[0],
      financials: revRes.rows[0],
      users: userRes.rows[0],
    };
  }

  /**
   * Doctor utilization rates & performance analytics
   */
  static async getDoctorUtilization() {
    const sql = `
      SELECT
        d.id as doctor_id,
        p.first_name,
        p.last_name,
        d.qualification,
        d.rating,
        d.total_ratings,
        COUNT(s.id) as total_slots_generated,
        COUNT(s.id) FILTER (WHERE s.status = 'BOOKED') as booked_slots,
        ROUND(
          (COUNT(s.id) FILTER (WHERE s.status = 'BOOKED')::decimal / NULLIF(COUNT(s.id), 0)) * 100, 2
        ) as utilization_rate_percentage,
        COALESCE(SUM(pay.amount) FILTER (WHERE pay.status = 'CAPTURED'), 0) as total_revenue_generated
      FROM doctors d
      JOIN profiles p ON p.user_id = d.user_id
      LEFT JOIN availability_slots s ON s.doctor_id = d.id
      LEFT JOIN consultations c ON c.slot_id = s.id
      LEFT JOIN payments pay ON pay.consultation_id = c.id
      GROUP BY d.id, p.first_name, p.last_name, d.qualification, d.rating, d.total_ratings
      ORDER BY utilization_rate_percentage DESC NULLS LAST
    `;
    const res = await query(sql);
    return res.rows;
  }

  /**
   * Peak consultation booking hours and patient retention
   */
  static async getPeakHoursAndRetention() {
    // Peak hours aggregation
    const peakHoursSql = `
      SELECT
        EXTRACT(HOUR FROM scheduled_at)::int as hour_of_day,
        COUNT(*) as consultation_count
      FROM consultations
      GROUP BY hour_of_day
      ORDER BY hour_of_day ASC
    `;

    // Patient retention: % of patients who booked more than 1 consultation
    const retentionSql = `
      WITH patient_counts AS (
        SELECT patient_id, COUNT(*) as count
        FROM consultations
        GROUP BY patient_id
      )
      SELECT
        COUNT(*) as total_unique_patients,
        COUNT(*) FILTER (WHERE count > 1) as repeat_patients,
        ROUND(
          (COUNT(*) FILTER (WHERE count > 1)::decimal / NULLIF(COUNT(*), 0)) * 100, 2
        ) as retention_rate_percentage
      FROM patient_counts
    `;

    const [peakRes, retRes] = await Promise.all([
      query(peakHoursSql),
      query(retentionSql),
    ]);

    return {
      peakHours: peakRes.rows,
      retention: retRes.rows[0] || {
        total_unique_patients: 0,
        repeat_patients: 0,
        retention_rate_percentage: 0,
      },
    };
  }
}

export default AnalyticsRepository;
