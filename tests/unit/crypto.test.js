import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  encryptPHI,
  decryptPHI,
  computeAuditHash,
  generatePrescriptionSignature,
  hashPayload,
} from '../../src/utils/crypto.js';

describe('Cryptography & PHI Security Tests', () => {
  it('should encrypt and decrypt patient health information (PHI) via AES-256-GCM', () => {
    const sensitiveData = 'Patient reports chronic migraine, pitta imbalance, and acid reflux.';
    const encrypted = encryptPHI(sensitiveData);

    assert.ok(encrypted, 'Encrypted string must exist');
    assert.match(encrypted, /^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/, 'Must match v1:iv:tag:cipher format');

    const decrypted = decryptPHI(encrypted);
    assert.strictEqual(decrypted, sensitiveData, 'Decrypted text must match original plaintext');
  });

  it('should handle JSON objects in encryptPHI and decrypt properly', () => {
    const medicalRecord = { allergies: ['Dust', 'Pollen'], bloodPressure: '120/80', pulse: 72 };
    const encrypted = encryptPHI(medicalRecord);
    const decrypted = JSON.parse(decryptPHI(encrypted));

    assert.deepStrictEqual(decrypted, medicalRecord);
  });

  it('should reject tampered or invalid encrypted payloads', () => {
    assert.throws(() => {
      decryptPHI('invalid:format');
    }, /Invalid encrypted payload format/);
  });

  it('should compute deterministic SHA-256 audit hashes for chain verification', () => {
    const auditData = {
      prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
      userId: '11111111-1111-1111-1111-111111111111',
      action: 'CONSULTATION_BOOKED',
      resourceType: 'CONSULTATION',
      resourceId: '22222222-2222-2222-2222-222222222222',
      timestamp: '2026-10-26T12:00:00.000Z',
      oldVal: null,
      newVal: { status: 'CONFIRMED' },
    };

    const hash1 = computeAuditHash(auditData);
    const hash2 = computeAuditHash(auditData);

    assert.strictEqual(hash1, hash2, 'Identical inputs must yield identical SHA-256 hash');
    assert.strictEqual(hash1.length, 64, 'SHA-256 hash must be 64 hex characters');

    const tamperedHash = computeAuditHash({
      ...auditData,
      newVal: { status: 'COMPLETED' },
    });
    assert.notStrictEqual(hash1, tamperedHash, 'Modified payload must produce distinct hash');
  });

  it('should generate digital signature for prescriptions', () => {
    const signature = generatePrescriptionSignature({
      doctorId: 'doc-1',
      consultationId: 'cons-1',
      patientId: 'pat-1',
      issuedAt: '2026-10-26T12:00:00.000Z',
      medications: [{ name: 'Ashwagandha', dosage: '500mg' }],
    });

    assert.ok(signature);
    assert.strictEqual(signature.length, 64, 'HMAC-SHA256 signature must be 64 hex characters');
  });

  it('should compute payload hash for idempotency checking', () => {
    const payload = { slotId: '123', patientId: '456' };
    const hash = hashPayload(payload);
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 64);
  });
});

