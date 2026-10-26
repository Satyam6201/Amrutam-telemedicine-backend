import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import createApp from '../../src/app.js';
import { pool } from '../../config/database.js';
import redis from '../../config/redis.js';
import { closeQueues } from '../../config/queue.js';

describe('Amrutam Telemedicine Backend Integration Tests', () => {
  let app;
  let patientToken;
  let doctorToken;
  let adminToken;
  let doctorId;
  let testSlotId;
  let consultationId;

  before(async () => {
    app = createApp();
  });

  after(async () => {

    await closeQueues();
    await pool.end();
    await redis.quit();
  });

  describe('Health & Observability Endpoints', () => {
    it('GET /health/live should return 200 UP', async () => {
      const res = await request(app).get('/health/live');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'UP');
    });

    it('GET /health/ready should return 200 READY with database and redis UP', async () => {
      const res = await request(app).get('/health/ready');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'READY');
      assert.strictEqual(res.body.checks.database, 'UP');
      assert.strictEqual(res.body.checks.redis, 'UP');
    });

    it('GET /metrics should expose Prometheus metrics', async () => {
      const res = await request(app).get('/metrics');
      assert.strictEqual(res.status, 200);
      assert.match(res.text, /http_requests_total/);
    });
  });

  describe('Authentication Lifecycle', () => {
    it('POST /api/v1/auth/login should authenticate seeded admin', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@amrutam.co.in',
          password: 'Admin@Amrutam2026',
        });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.tokens.accessToken);
      adminToken = res.body.data.tokens.accessToken;
    });

    it('POST /api/v1/auth/login should authenticate seeded doctor', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'dr.priya@amrutam.co.in',
          password: 'Doctor@Amrutam2026',
        });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.tokens.accessToken);
      doctorToken = res.body.data.tokens.accessToken;
    });

    it('POST /api/v1/auth/login should authenticate seeded patient', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'patient@amrutam.co.in',
          password: 'Patient@Amrutam2026',
        });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.tokens.accessToken);
      patientToken = res.body.data.tokens.accessToken;
    });

    it('POST /api/v1/auth/register should create new patient user', async () => {
      const uniqueEmail = `testpatient_${Date.now()}@amrutam.co.in`;
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: uniqueEmail,
          password: 'SecurePassword123',
          firstName: 'Vikram',
          lastName: 'Singhania',
          role: 'PATIENT',
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.data.user.email, uniqueEmail);
      assert.ok(res.body.data.tokens.accessToken);
    });

    it('GET /api/v1/auth/me should return current user profile', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${patientToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.email, 'patient@amrutam.co.in');
    });
  });

  describe('Doctor Discovery', () => {
    it('GET /api/v1/doctors should return list of approved doctors', async () => {
      const res = await request(app).get('/api/v1/doctors');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);

      const doc = res.body.data.find((d) => d.first_name === 'Priya') || res.body.data[0];
      doctorId = doc.id;
      assert.ok(doctorId);
    });

    it('GET /api/v1/doctors/:id should return single doctor details', async () => {
      const res = await request(app).get(`/api/v1/doctors/${doctorId}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.id, doctorId);
    });

    it('GET /api/v1/doctors/specialties should return Ayurvedic specialties', async () => {
      const res = await request(app).get('/api/v1/doctors/specialties');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.some((s) => s.slug === 'panchakarma'));
    });
  });

  describe('Availability Slots & Hold', () => {
    it('GET /api/v1/doctors/:doctorId/slots should return available slots', async () => {
      const res = await request(app).get(`/api/v1/doctors/${doctorId}/slots?status=AVAILABLE`);
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);

      testSlotId = res.body.data[0].id;
    });

    it('POST /api/v1/slots/hold should reserve a slot for 15 minutes', async () => {
      const res = await request(app)
        .post('/api/v1/slots/hold')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ slotId: testSlotId });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.status, 'HELD');
      assert.ok(res.body.data.held_until);
    });

    it('POST /api/v1/slots/hold should reject holding an already held slot (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/v1/slots/hold')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ slotId: testSlotId });

      assert.strictEqual(res.status, 409);
    });
  });

  describe('Consultation Lifecycle & PHI Protection', () => {
    it('POST /api/v1/consultations should book consultation, confirm slot, and encrypt symptoms', async () => {
      const scheduledAt = new Date(Date.now() + 86400000).toISOString();
      const res = await request(app)
        .post('/api/v1/consultations')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', `idem-consult-${Date.now()}`)
        .send({
          slotId: testSlotId,
          doctorId,
          symptoms: 'Experiencing recurrent Pitta vitiation with hyperacidity and skin flares.',
          scheduledAt,
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.data.status, 'CONFIRMED');
      assert.ok(res.body.data.id);
      assert.ok(res.body.data.video_room_url);

      consultationId = res.body.data.id;
    });

    it('GET /api/v1/consultations/:id should return consultation with decrypted PHI', async () => {
      const res = await request(app)
        .get(`/api/v1/consultations/${consultationId}`)
        .set('Authorization', `Bearer ${patientToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.id, consultationId);
      assert.match(res.body.data.symptoms, /Pitta vitiation/);
    });

    it('PATCH /api/v1/consultations/:id/status should allow doctor to start consultation', async () => {
      const res = await request(app)
        .patch(`/api/v1/consultations/${consultationId}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          status: 'IN_PROGRESS',
          clinicalNotes: 'Pulse shows elevated Pitta with moderate Ama.',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.status, 'IN_PROGRESS');
    });
  });

  describe('Prescription Management', () => {
    it('POST /api/v1/prescriptions should issue digitally signed prescription with encrypted diagnosis', async () => {
      const res = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .set('Idempotency-Key', `idem-rx-${Date.now()}`)
        .send({
          consultationId,
          diagnosis: 'Amlapitta with Vata-Pitta Dushti',
          medications: [
            {
              name: 'Amrutam Gold Malt',
              dosage: '10g twice daily',
              frequency: 'After meals',
              durationDays: 30,
              instructions: 'Mix with warm water',
            },
            {
              name: 'Sutshekhar Ras',
              dosage: '1 tablet twice daily',
              frequency: 'Before food',
              durationDays: 15,
            },
          ],
          advice: 'Drink coriander seed infusion. Avoid sour and fermented foods.',
          followUpDate: '2026-11-26',
        });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.data.digital_signature);
      assert.strictEqual(res.body.data.digital_signature.length, 64);
    });

    it('GET /api/v1/prescriptions/consultation/:id should fetch prescription with decrypted diagnosis', async () => {
      const res = await request(app)
        .get(`/api/v1/prescriptions/consultation/${consultationId}`)
        .set('Authorization', `Bearer ${patientToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.diagnosis, 'Amlapitta with Vata-Pitta Dushti');
      assert.strictEqual(res.body.data.medications.length, 2);
    });
  });

  describe('Payment Saga', () => {
    let paymentId;
    it('POST /api/v1/payments should initiate payment session', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          consultationId,
          amount: 800.0,
          paymentMethod: 'RAZORPAY_UPI',
        });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.data.paymentId);
      paymentId = res.body.data.paymentId;
    });

    it('POST /api/v1/payments/webhook should process CAPTURED payment webhook', async () => {
      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .send({
          transactionId: 'txn_test_webhook_001',
          paymentId,
          status: 'CAPTURED',
          signature: 'sig_valid_test_signature',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.status, 'CAPTURED');
    });
  });

  describe('Compliance & Audit Integrity', () => {
    it('GET /api/v1/admin/audit-logs should return audit logs for admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);
    });

    it('GET /api/v1/admin/audit-logs should reject non-admin users (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${patientToken}`);

      assert.strictEqual(res.status, 403);
    });

    it('GET /api/v1/admin/audit-logs/verify-integrity should verify SHA-256 cryptographic chain', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs/verify-integrity')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.isTampered, false);
      assert.strictEqual(res.body.data.status, 'INTEGRITY_VERIFIED_VALID');
    });
  });

  describe('Admin Analytics', () => {
    it('GET /api/v1/admin/analytics/overview should return platform metrics', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.consultations);
      assert.ok(res.body.data.financials);
    });

    it('GET /api/v1/admin/analytics/doctor-utilization should return doctor utilization rates', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/doctor-utilization')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
    });
  });
});

