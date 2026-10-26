import { query } from '../../../config/database.js';

export class DoctorRepository {

  static async searchDoctors({
    specialty,
    query: searchKeyword,
    minFee,
    maxFee,
    minRating,
    language,
    page = 1,
    limit = 20,
  }) {
    const conditions = ['d.is_approved = true'];
    const params = [];
    let paramIndex = 1;

    if (specialty) {
      conditions.push(`s.slug = $${paramIndex++}`);
      params.push(specialty);
    }

    if (searchKeyword) {
      conditions.push(
        `(p.first_name ILIKE $${paramIndex} OR p.last_name ILIKE $${paramIndex} OR d.qualification ILIKE $${paramIndex} OR d.bio ILIKE $${paramIndex})`
      );
      params.push(`%${searchKeyword}%`);
      paramIndex++;
    }

    if (minFee !== undefined) {
      conditions.push(`d.consultation_fee >= $${paramIndex++}`);
      params.push(minFee);
    }

    if (maxFee !== undefined) {
      conditions.push(`d.consultation_fee <= $${paramIndex++}`);
      params.push(maxFee);
    }

    if (minRating !== undefined) {
      conditions.push(`d.rating >= $${paramIndex++}`);
      params.push(minRating);
    }

    if (language) {
      conditions.push(`$${paramIndex++} = ANY(d.languages)`);
      params.push(language);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const countSql = `
      SELECT COUNT(DISTINCT d.id) as total
      FROM doctors d
      JOIN profiles p ON p.user_id = d.user_id
      LEFT JOIN doctor_specialties ds ON ds.doctor_id = d.id
      LEFT JOIN specialties s ON s.id = ds.specialty_id
      ${whereClause}
    `;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0].total, 10);

    const dataSql = `
      SELECT d.id, d.user_id, d.registration_number, d.experience_years, d.qualification,
             d.consultation_fee, d.rating, d.total_ratings, d.bio, d.languages,
             p.first_name, p.last_name,
             COALESCE(
               json_agg(
                 json_build_object('id', s.id, 'name', s.name, 'slug', s.slug)
               ) FILTER (WHERE s.id IS NOT NULL), '[]'
             ) as specialties
      FROM doctors d
      JOIN profiles p ON p.user_id = d.user_id
      LEFT JOIN doctor_specialties ds ON ds.doctor_id = d.id
      LEFT JOIN specialties s ON s.id = ds.specialty_id
      ${whereClause}
      GROUP BY d.id, p.first_name, p.last_name
      ORDER BY d.rating DESC, d.experience_years DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const dataParams = [...params, limit, offset];
    const dataRes = await query(dataSql, dataParams);

    return {
      doctors: dataRes.rows,
      total,
      page,
      limit,
    };
  }

  static async findDoctorById(id) {
    const sql = `
      SELECT d.id, d.user_id, d.registration_number, d.experience_years, d.qualification,
             d.consultation_fee, d.rating, d.total_ratings, d.bio, d.languages, d.is_approved,
             p.first_name, p.last_name, u.email, u.phone,
             COALESCE(
               json_agg(
                 json_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'description', s.description)
               ) FILTER (WHERE s.id IS NOT NULL), '[]'
             ) as specialties
      FROM doctors d
      JOIN users u ON u.id = d.user_id
      JOIN profiles p ON p.user_id = d.user_id
      LEFT JOIN doctor_specialties ds ON ds.doctor_id = d.id
      LEFT JOIN specialties s ON s.id = ds.specialty_id
      WHERE d.id = $1
      GROUP BY d.id, p.first_name, p.last_name, u.email, u.phone
    `;
    const res = await query(sql, [id]);
    return res.rows[0] || null;
  }

  static async getAllSpecialties() {
    const res = await query('SELECT * FROM specialties ORDER BY name ASC');
    return res.rows;
  }

  static async approveDoctor(id) {
    const res = await query(
      `UPDATE doctors
       SET is_approved = true, updated_at = NOW()
       WHERE id = $1
       RETURNING id, is_approved`,
      [id]
    );
    return res.rows[0] || null;
  }
}

export default DoctorRepository;

