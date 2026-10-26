import PaymentService from './payment.service.js';
import { successResponse } from '../../utils/response.js';

export class PaymentController {
  static async createPayment(req, res, next) {
    try {
      const patientId = req.user.id;
      const idempotencyKey = req.headers['idempotency-key'];
      const paymentOrder = await PaymentService.createPayment(req.body, patientId, idempotencyKey);
      return successResponse(res, paymentOrder, 'Payment session initialized', 201);
    } catch (error) {
      next(error);
    }
  }

  static async handleWebhook(req, res, next) {
    try {
      const result = await PaymentService.processWebhook(req.body);
      return successResponse(res, result, 'Webhook processed successfully');
    } catch (error) {
      next(error);
    }
  }
}

export default PaymentController;
