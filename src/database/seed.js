import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { pool, query } from '../../config/database.js';
import { encryptPHI, computeAuditHash, generatePrescriptionSignature } from '../utils/crypto.js';
import logger from '../utils/logger.js';

export async function seedDatabase() {
  logger.info('Seeding database with production reference data...');

  try {
    // 1. Seed Specialties
    const specialties = [
      { name: 'Ayurveda General', slug: 'ayurveda-general', description: 'Holistic Ayurvedic primary care' },
      { name: 'Kayachikitsa', slug: 'kayachikitsa', description: 'Ayurvedic internal medicine & chronic disease management' },
      { name: 'Panchakarma', slug: 'panchakarma', description: 'Ayurvedic cellular detoxification & rejuvenation' },
      { name: 'Nadi Pariksha', slug: 'nadi-pariksha', description: 'Traditional Ayurvedic pulse diagnosis' },
      { name: 'Prasuti & Stri Roga', slug: 'prasuti-stri-roga', description: "Ayurvedic gynecology & women's holistic wellness" },
      { name: 'Shalya Tantra', slug: 'shalya-tantra', description: 'Ayurvedic surgery, kshara sutra, and wound healing' },
    ];

    const specialtyMap = {};
    for (const spec of specialties) {
      const res = await query(
        `INSERT INTO specialties (name, slug, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
         RETURNING id, slug`,
        [spec.name, spec.slug, spec.description]
      );
      specialtyMap[res.rows[0].slug] = res.rows[0].id;
    }
    logger.info('Specialties seeded');

    // 2. Seed Admin User
    const adminPasswordHash = await bcrypt.hash('Admin@Amrutam2026', 10);
    const adminRes = await query(
      `INSERT INTO users (email, password_hash, role, phone, is_verified)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
       RETURNING id`,
      ['admin@amrutam.co.in', adminPasswordHash, 'ADMIN', '+919876543210', true]
    );
    const adminId = adminRes.rows[0].id;

    await query(
      `INSERT INTO profiles (user_id, first_name, last_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO NOTHING`,
      [adminId, 'Amrutam', 'Administrator']
    );
    logger.info('Admin user seeded');

    // 3. Seed Patient User
    const patientPasswordHash = await bcrypt.hash('Patient@Amrutam2026', 10);
    const patientRes = await query(
      `INSERT INTO users (email, password_hash, role, phone, is_verified)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET is_verified = EXCLUDED.is_verified
       RETURNING id`,
      ['patient@amrutam.co.in', patientPasswordHash, 'PATIENT', '+919876543211', true]
    );
    const patientId = patientRes.rows[0].id;

    const encryptedPatientHistory = encryptPHI('No history of diabetes or hypertension. Mild acid peptic disorder.');
    await query(
      `INSERT INTO profiles (user_id, first_name, last_name, date_of_birth, gender, blood_group, encrypted_medical_history)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET encrypted_medical_history = EXCLUDED.encrypted_medical_history`,
      [patientId, 'Rohan', 'Mehta', '1992-05-15', 'Male', 'O+', encryptedPatientHistory]
    );
    logger.info('Patient user seeded');

    // 4. Seed Doctors
    const doctorPasswordHash = await bcrypt.hash('Doctor@Amrutam2026', 10);
    const doctorSeedList = [
      {
        email: 'dr.priya@amrutam.co.in',
        phone: '+919876543212',
        firstName: 'Priya',
        lastName: 'Sharma',
        regNo: 'AYU-DEL-2012-0891',
        experienceYears: 12,
        qualification: 'BAMS, MD (Ayurveda - Panchakarma)',
        fee: 800.00,
        rating: 4.95,
        totalRatings: 142,
        bio: 'Senior Ayurvedic Physician specializing in chronic autoimmune disorders, gut health, and authentic Panchakarma detoxification protocols.',
        languages: ['English', 'Hindi', 'Sanskrit'],
        specialties: ['panchakarma', 'kayachikitsa'],
      },
      {
        email: 'dr.rajesh@amrutam.co.in',
        phone: '+919876543213',
        firstName: 'Rajesh',
        lastName: 'Varma',
        regNo: 'AYU-MUM-2016-0412',
        experienceYears: 8,
        qualification: 'BAMS, Fellowship in Nadi Pariksha',
        fee: 600.00,
        rating: 4.88,
        totalRatings: 98,
        bio: 'Expert in Nadi Pariksha (Pulse Diagnosis), metabolic lifestyle disorders, stress management, and customized herbal formulations.',
        languages: ['English', 'Hindi', 'Marathi'],
        specialties: ['nadi-pariksha', 'ayurveda-general'],
      },
      {
        email: 'dr.ananya@amrutam.co.in',
        phone: '+919876543214',
        firstName: 'Ananya',
        lastName: 'Sen',
        regNo: 'AYU-BLR-2009-0115',
        experienceYears: 15,
        qualification: 'BAMS, MD (Ayurveda - Prasuti & Stri Roga)',
        fee: 1000.00,
        rating: 4.98,
        totalRatings: 215,
        bio: 'Consultant Ayurvedic Gynecologist specializing in hormonal imbalances, PCOS/PCOD, fertility wellness, and post-natal care.',
        languages: ['English', 'Hindi', 'Bengali'],
        specialties: ['prasuti-stri-roga', 'kayachikitsa'],
      },
    ];

    const doctorIds = [];
    for (const doc of doctorSeedList) {
      const userRes = await query(
        `INSERT INTO users (email, password_hash, role, phone, is_verified)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE SET is_verified = EXCLUDED.is_verified
         RETURNING id`,
        [doc.email, doctorPasswordHash, 'DOCTOR', doc.phone, true]
      );
      const docUserId = userRes.rows[0].id;

      await query(
        `INSERT INTO profiles (user_id, first_name, last_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO NOTHING`,
        [docUserId, doc.firstName, doc.lastName]
      );

      const docRes = await query(
        `INSERT INTO doctors (
          user_id, registration_number, experience_years, qualification,
          consultation_fee, rating, total_ratings, bio, languages, is_approved
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id) DO UPDATE SET
          consultation_fee = EXCLUDED.consultation_fee,
          rating = EXCLUDED.rating
         RETURNING id`,
        [
          docUserId,
          doc.regNo,
          doc.experienceYears,
          doc.qualification,
          doc.fee,
          doc.rating,
          doc.totalRatings,
          doc.bio,
          doc.languages,
          true,
        ]
      );
      const doctorId = docRes.rows[0].id;
      doctorIds.push(doctorId);

      // Link specialties
      for (const specSlug of doc.specialties) {
        const specId = specialtyMap[specSlug];
        if (specId) {
          await query(
            `INSERT INTO doctor_specialties (doctor_id, specialty_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [doctorId, specId]
          );
        }
      }
    }
    logger.info('Doctors and specialties seeded');

    // 5. Seed Availability Slots for the next 7 days
    const timeSlots = [
      { start: '09:00:00', end: '09:30:00' },
      { start: '09:30:00', end: '10:00:00' },
      { start: '10:00:00', end: '10:30:00' },
      { start: '10:30:00', end: '11:00:00' },
      { start: '11:30:00', end: '12:00:00' },
      { start: '14:00:00', end: '14:30:00' },
      { start: '14:30:00', end: '15:00:00' },
      { start: '15:30:00', end: '16:00:00' },
      { start: '16:00:00', end: '16:30:00' },
      { start: '17:00:00', end: '17:30:00' },
    ];

    const today = new Date();
    for (const docId of doctorIds) {
      for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + dayOffset);
        const dateStr = targetDate.toISOString().split('T')[0];

        for (const slot of timeSlots) {
          await query(
            `INSERT INTO availability_slots (doctor_id, slot_date, start_time, end_time, status)
             VALUES ($1, $2, $3, $4, 'AVAILABLE')
             ON CONFLICT (doctor_id, slot_date, start_time) DO NOTHING`,
            [docId, dateStr, slot.start, slot.end]
          );
        }
      }
    }
    logger.info('Availability slots seeded for upcoming 7 days');

    // 6. Seed a Reference Completed Consultation with Prescription & Payment
    const primaryDoctorId = doctorIds[0];
    const consultScheduledAt = new Date(today);
    consultScheduledAt.setHours(10, 0, 0, 0);

    const encSymptoms = encryptPHI('Chronic indigestion, fatigue after meals, disturbed sleep pattern.');
    const encNotes = encryptPHI('Pitta-Vata aggravation. Tongue shows ama coating. Advised dietary modifications.');

    const consultRes = await query(
      `INSERT INTO consultations (
        doctor_id, patient_id, scheduled_at, status,
        encrypted_symptoms, encrypted_clinical_notes, video_room_url
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, scheduled_at`,
      [
        primaryDoctorId,
        patientId,
        consultScheduledAt.toISOString(),
        'COMPLETED',
        encSymptoms,
        encNotes,
        'https://meet.amrutam.co.in/room/c-9821-4122',
      ]
    );
    const consultationId = consultRes.rows[0].id;

    // Seed Prescription
    const encDiagnosis = encryptPHI('Grahani Roga (Ayurvedic Irritable Bowel / Malabsorption syndrome) with Mandagni');
    const medications = [
      {
        name: 'Amrutam Kuntal Care Herbal Malt',
        dosage: '10g (1 tablespoon)',
        frequency: 'Twice daily with warm milk',
        durationDays: 30,
        instructions: 'Take 30 minutes after meals',
      },
      {
        name: 'Avipattikar Churna',
        dosage: '3g with lukewarm water',
        frequency: 'Before bedtime',
        durationDays: 15,
        instructions: 'Helps balance excessive pitta and hyperacidity',
      },
      {
        name: 'Kutajarishta',
        dosage: '15ml with equal quantity of water',
        frequency: 'Twice daily after meals',
        durationDays: 21,
        instructions: 'Strengthens digestive fire and gut lining',
      },
    ];

    const prescriptionSig = generatePrescriptionSignature({
      doctorId: primaryDoctorId,
      consultationId,
      patientId,
      issuedAt: consultScheduledAt.toISOString(),
      medications,
    });

    await query(
      `INSERT INTO prescriptions (
        consultation_id, doctor_id, patient_id, encrypted_diagnosis,
        medications, advice, follow_up_date, digital_signature
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (consultation_id) DO NOTHING`,
      [
        consultationId,
        primaryDoctorId,
        patientId,
        encDiagnosis,
        JSON.stringify(medications),
        'Follow Sattvic diet: avoid spicy, deep-fried foods. Practice Nadi Shodhana Pranayama for 10 minutes daily.',
        new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        prescriptionSig,
      ]
    );

    // Seed Payment
    await query(
      `INSERT INTO payments (
        consultation_id, patient_id, amount, currency, payment_method,
        transaction_id, status, idempotency_key
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        consultationId,
        patientId,
        800.00,
        'INR',
        'RAZORPAY_UPI',
        'txn_amrutam_live_98124819',
        'CAPTURED',
        'seed_idem_pay_001',
      ]
    );

    // 7. Seed Initial Tamper-Evident Audit Log (Reset audit table for clean chain)
    await query('TRUNCATE audit_logs CASCADE');
    const initialAuditTimestamp = new Date().toISOString();
    const auditHash = computeAuditHash({
      prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
      userId: adminId,
      action: 'SYSTEM_BOOTSTRAP',
      resourceType: 'SYSTEM',
      resourceId: 'INITIAL_SEED',
      timestamp: initialAuditTimestamp,
      oldVal: null,
      newVal: { message: 'Amrutam Telemedicine Backend initialized with reference data' },
    });

    await query(
      `INSERT INTO audit_logs (
        user_id, action, resource_type, resource_id, ip_address, user_agent,
        previous_state, new_state, prev_hash, hash_signature, timestamp
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        adminId,
        'SYSTEM_BOOTSTRAP',
        'SYSTEM',
        'INITIAL_SEED',
        '127.0.0.1',
        'SeedScript/1.0',
        null,
        JSON.stringify({ message: 'Amrutam Telemedicine Backend initialized with reference data' }),
        '0000000000000000000000000000000000000000000000000000000000000000',
        auditHash,
        initialAuditTimestamp,
      ]
    );

    logger.info('Database seeding completed successfully!');
  } catch (error) {
    logger.error({ error: error.message }, 'Database seeding failed');
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase()
    .then(() => {
      logger.info('Seed finished.');
      pool.end();
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'Seed failed.');
      pool.end();
      process.exit(1);
    });
}

export default seedDatabase;
