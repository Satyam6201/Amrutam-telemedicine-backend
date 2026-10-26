import PrescriptionService from './prescription.service.js';
import { successResponse } from '../../utils/response.js';

export class PrescriptionController {
  static async issuePrescription(req, res, next) {
    try {
      const clientIp = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const prescription = await PrescriptionService.issuePrescription(
        req.body,
        req.user,
        clientIp,
        userAgent
      );

      return successResponse(res, prescription, 'Prescription issued successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async getByConsultationId(req, res, next) {
    try {
      const prescription = await PrescriptionService.getByConsultationId(
        req.params.consultationId,
        req.user
      );
      return successResponse(res, prescription, 'Prescription retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export default PrescriptionController;

