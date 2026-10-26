import AuditService from './audit.service.js';
import { successResponse, paginatedResponse } from '../../utils/response.js';

export class AuditController {
  static async listLogs(req, res, next) {
    try {
      const result = await AuditService.listLogs(req.query);
      return paginatedResponse(
        res,
        result.logs,
        result.page,
        result.limit,
        result.total,
        'Audit logs retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  static async verifyIntegrity(req, res, next) {
    try {
      const result = await AuditService.verifyChainIntegrity();
      return successResponse(res, result, 'Cryptographic audit chain integrity verification result');
    } catch (error) {
      next(error);
    }
  }
}

export default AuditController;
