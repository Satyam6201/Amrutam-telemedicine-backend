import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import createApp from '../../src/app.js';
import { pool, query } from '../../config/database.js';
import redis from '../../config/redis.js';
import { closeQueues } from '../../config/queue.js';

describe('API Idempotency Integration Tests', () => {
  let app;
  let patientToken;
  let doctorId;
  let testSlotId;

  before(async () => {
    app = createApp();

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'patient@amrutam.co.in',
        password: 'Patient@Amrutam2026',
      });
    patientToken = loginRes.body.data.tokens.accessToken;

    const docRes = await query('SELECT id FROM doctors WHERE is_approved = true LIMIT 1');
    doctorId = docRes.rows[0].id;

    const slotRes = await query(
      `INSERT INTO availability_slots (doctor_id, slot_date, start_time, end_time, status)
       VALUES ($1, CURRENT_DATE + INTERVAL '12 days', '15:00:00', '15:30:00', 'AVAILABLE')
       RETURNING id`,
      [doctorId]
    );
    testSlotId = slotRes.rows[0].id;
  });

  after(async () => {
    if (testSlotId) {
      await query('DELETE FROM availability_slots WHERE id = $1', [testSlotId]);
    }
    await closeQueues();
    await pool.end();
    await redis.quit();
  });

  it('should replay cached response when Idempotency-Key is repeated', async () => {
    const idempotencyKey = `test-idem-key-${Date.now()}`;
    const payload = { slotId: testSlotId };

    const res1 = await request(app)
      .post('/api/v1/slots/hold')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.body.data.status, 'HELD');
    assert.strictEqual(res1.headers['x-idempotent-replay'], undefined);

    const res2 = await request(app)
      .post('/api/v1/slots/hold')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.headers['x-idempotent-replay'], 'true');
    assert.strictEqual(res2.body.data.status, 'HELD');
  });

  it('should reject reused Idempotency-Key with differing payload (422)', async () => {
    const idempotencyKey = `test-mismatch-key-${Date.now()}`;

    await request(app)
      .post('/api/v1/slots/hold')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ slotId: testSlotId });

    const res2 = await request(app)
      .post('/api/v1/slots/hold')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ slotId: '00000000-0000-0000-0000-000000000000' });

    assert.strictEqual(res2.status, 422);
  });
});

