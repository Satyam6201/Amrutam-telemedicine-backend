import ConsultationService from './consultation.service.js';
import { successResponse, paginatedResponse } from '../../utils/response.js';

export class ConsultationController {
  static async bookConsultation(req, res, next) {
    try {
      const patientId = req.user.id;
      const clientIp = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const consultation = await ConsultationService.bookConsultation(
        req.body,
        patientId,
        clientIp,
        userAgent
      );

      return successResponse(res, consultation, 'Consultation booked successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async listConsultations(req, res, next) {
    try {
      const result = await ConsultationService.listConsultations(req.user, req.query);
      return paginatedResponse(
        res,
        result.consultations,
        result.page,
        result.limit,
        result.total,
        'Consultations retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  static async getConsultationById(req, res, next) {
    try {
      const consultation = await ConsultationService.getConsultationById(req.params.id, req.user);
      return successResponse(res, consultation, 'Consultation retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async updateStatus(req, res, next) {
    try {
      const clientIp = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const updated = await ConsultationService.updateStatus(
        req.params.id,
        req.body,
        req.user,
        clientIp,
        userAgent
      );

      return successResponse(res, updated, `Consultation transitioned to ${req.body.status}`);
    } catch (error) {
      next(error);
    }
  }

  static async cancelConsultation(req, res, next) {
    try {
      const clientIp = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const updated = await ConsultationService.updateStatus(
        req.params.id,
        { status: 'CANCELLED', cancellationReason: req.body.cancellationReason },
        req.user,
        clientIp,
        userAgent
      );

      return successResponse(res, updated, 'Consultation cancelled successfully');
    } catch (error) {
      next(error);
    }
  }
}

export default ConsultationController;
