import { describe, it } from 'node:test';
import assert from 'node:assert';
import { registerSchema, loginSchema } from '../../src/modules/auth/auth.validator.js';
import { holdSlotSchema } from '../../src/modules/slots/slot.validator.js';
import { bookConsultationSchema } from '../../src/modules/consultations/consultation.validator.js';
import { issuePrescriptionSchema } from '../../src/modules/prescriptions/prescription.validator.js';

describe('Validation Schemas Unit Tests', () => {
  it('should validate valid user registration payload', () => {
    const valid = {
      email: 'test@amrutam.co.in',
      password: 'StrongPassword123',
      firstName: 'Aarav',
      lastName: 'Patel',
      role: 'PATIENT',
    };

    const result = registerSchema.safeParse(valid);
    assert.strictEqual(result.success, true);
  });

  it('should reject registration with weak password or invalid email', () => {
    const invalid = {
      email: 'invalid-email',
      password: 'weak',
      firstName: 'Aarav',
      lastName: 'Patel',
    };

    const result = registerSchema.safeParse(invalid);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.errors.some((e) => e.path.includes('email')));
    assert.ok(result.error.errors.some((e) => e.path.includes('password')));
  });

  it('should validate consultation booking schema', () => {
    const valid = {
      slotId: '11111111-1111-1111-1111-111111111111',
      doctorId: '22222222-2222-2222-2222-222222222222',
      symptoms: 'Experiencing chronic digestive issues and acid reflux',
      scheduledAt: '2026-10-26T14:00:00.000Z',
    };

    const result = bookConsultationSchema.safeParse(valid);
    assert.strictEqual(result.success, true);
  });

  it('should reject prescription schema with empty medications', () => {
    const invalid = {
      consultationId: '11111111-1111-1111-1111-111111111111',
      diagnosis: 'Indigestion',
      medications: [],
    };

    const result = issuePrescriptionSchema.safeParse(invalid);
    assert.strictEqual(result.success, false);
  });
});
