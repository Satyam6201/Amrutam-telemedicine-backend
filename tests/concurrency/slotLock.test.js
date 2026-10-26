import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import createApp from '../../src/app.js';
import { pool, query } from '../../config/database.js';
import redis from '../../config/redis.js';
import { closeQueues } from '../../config/queue.js';

describe('Concurrency & Race Condition Tests', () => {
  let app;
  let patientTokens = [];
  let doctorId;
  let raceSlotId;

  before(async () => {
    app = createApp();

    // 1. Log in or create 5 different patients for concurrent requests
    for (let i = 1; i <= 5; i++) {
      const email = `concurrent_patient_${i}_${Date.now()}@amrutam.co.in`;
      const regRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'Password123!',
          firstName: `Patient${i}`,
          lastName: 'Tester',
          role: 'PATIENT',
        });
      patientTokens.push(regRes.body.data.tokens.accessToken);
    }

    // 2. Get a doctor
    const docRes = await query('SELECT id FROM doctors WHERE is_approved = true LIMIT 1');
    doctorId = docRes.rows[0].id;

    // 3. Create a dedicated slot for this race condition test
    const slotRes = await query(
      `INSERT INTO availability_slots (doctor_id, slot_date, start_time, end_time, status)
       VALUES ($1, CURRENT_DATE + INTERVAL '10 days', '12:00:00', '12:30:00', 'AVAILABLE')
       RETURNING id`,
      [doctorId]
    );
    raceSlotId = slotRes.rows[0].id;
  });

  after(async () => {
    // Cleanup slot
    if (raceSlotId) {
      await query('DELETE FROM availability_slots WHERE id = $1', [raceSlotId]);
    }
    await closeQueues();
    await pool.end();
    await redis.quit();
  });

  it('should prevent double-booking: exactly 1 request succeeds out of 5 concurrent attempts', async () => {
    // Fire 5 simultaneous requests to hold the same slot
    const concurrentRequests = patientTokens.map((token) =>
      request(app)
        .post('/api/v1/slots/hold')
        .set('Authorization', `Bearer ${token}`)
        .send({ slotId: raceSlotId })
    );

    const responses = await Promise.all(concurrentRequests);

    const successResponses = responses.filter((r) => r.status === 200);
    const conflictResponses = responses.filter((r) => r.status === 409);

    assert.strictEqual(
      successResponses.length,
      1,
      `Expected exactly 1 success (200), but got ${successResponses.length}`
    );
    assert.strictEqual(
      conflictResponses.length,
      4,
      `Expected 4 conflicts (409), but got ${conflictResponses.length}`
    );

    // Verify DB slot state
    const dbSlot = await query('SELECT status, held_by_patient_id FROM availability_slots WHERE id = $1', [
      raceSlotId,
    ]);
    assert.strictEqual(dbSlot.rows[0].status, 'HELD');
    assert.ok(dbSlot.rows[0].held_by_patient_id);
  });
});
