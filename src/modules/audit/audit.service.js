import AuditRepository from './audit.repository.js';
import { computeAuditHash } from '../../utils/crypto.js';

export class AuditService {
  static async listLogs(filters) {
    return AuditRepository.listLogs(filters);
  }

  /**
   * Verify cryptographic integrity of the audit log chain
   * Iterates through sequentially ordered records, recomputes each SHA-256 hash signature,
   * and verifies that prev_hash matches the previous record's hash_signature.
   */
  static async verifyChainIntegrity() {
    const logs = await AuditRepository.getLogsForIntegrityCheck(500);

    if (logs.length === 0) {
      return {
        isTampered: false,
        totalVerified: 0,
        message: 'No audit records present to verify.',
      };
    }

    let previousHash = '0000000000000000000000000000000000000000000000000000000000000000';
    const violations = [];

    for (let i = 0; i < logs.length; i++) {
      const record = logs[i];

      // 1. Verify prev_hash matches prior entry's hash
      if (i > 0 && record.prev_hash !== previousHash) {
        violations.push({
          logId: record.id,
          expectedPrevHash: previousHash,
          actualPrevHash: record.prev_hash,
          reason: 'Chain discontinuity: prev_hash does not match previous record hash.',
        });
      }

      // 2. Recompute record's hash signature
      const expectedHash = computeAuditHash({
        prevHash: record.prev_hash,
        userId: record.user_id,
        action: record.action,
        resourceType: record.resource_type,
        resourceId: record.resource_id,
        timestamp: record.timestamp,
        oldVal: record.previous_state,
        newVal: record.new_state,
      });

      if (expectedHash !== record.hash_signature) {
        violations.push({
          logId: record.id,
          expectedSignature: expectedHash,
          actualSignature: record.hash_signature,
          reason: 'Tampered record content: recomputed SHA-256 hash signature mismatch.',
        });
      }

      previousHash = record.hash_signature;
    }

    return {
      isTampered: violations.length > 0,
      totalVerified: logs.length,
      violations,
      status: violations.length === 0 ? 'INTEGRITY_VERIFIED_VALID' : 'INTEGRITY_BREACH_DETECTED',
    };
  }
}

export default AuditService;
