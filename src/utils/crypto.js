import crypto from 'crypto';
import config from '../../config/index.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY = Buffer.from(config.encryption.key, 'hex');

export function encryptPHI(plaintext) {
  if (!plaintext) return null;
  const text = typeof plaintext === 'object' ? JSON.stringify(plaintext) : String(plaintext);

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${config.encryption.keyVersion}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptPHI(encryptedPayload) {
  if (!encryptedPayload) return null;

  try {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted payload format');
    }

    const [_version, ivHex, tagHex, cipherHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(`Failed to decrypt PHI data: ${error.message}`);
  }
}

export function canonicalJson(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return JSON.stringify(obj ?? null);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

export function computeAuditHash({ prevHash, userId, action, resourceType, resourceId, timestamp, oldVal, newVal }) {
  const content = [
    prevHash || '0000000000000000000000000000000000000000000000000000000000000000',
    userId || 'SYSTEM',
    action,
    resourceType,
    resourceId,
    new Date(timestamp).toISOString(),
    canonicalJson(oldVal || null),
    canonicalJson(newVal || null),
  ].join('|');

  return crypto.createHash('sha256').update(content).digest('hex');
}

export function generatePrescriptionSignature({ doctorId, consultationId, patientId, issuedAt, medications }) {
  const payload = `${doctorId}:${consultationId}:${patientId}:${issuedAt}:${JSON.stringify(medications)}`;
  return crypto.createHmac('sha256', config.jwt.secret).update(payload).digest('hex');
}

export function hashPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
}

export default {
  encryptPHI,
  decryptPHI,
  computeAuditHash,
  generatePrescriptionSignature,
  hashPayload,
};

