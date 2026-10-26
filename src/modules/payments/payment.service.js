import crypto from 'crypto';
import PaymentRepository from './payment.repository.js';
import ConsultationRepository from '../consultations/consultation.repository.js';
import SlotRepository from '../slots/slot.repository.js';
import { logAuditEvent } from '../../middlewares/auditLogger.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

export class PaymentService {
  /**
   * Initiate payment for consultation
   */
  static async createPayment({ consultationId, amount, currency, paymentMethod }, patientId, idempotencyKey) {
    const consultation = await ConsultationRepository.findById(consultationId);
    if (!consultation) {
      throw new NotFoundError(`Consultation with ID ${consultationId} not found.`);
    }

    if (consultation.patient_id !== patientId) {
      throw new BadRequestError('Payment can only be initiated by the booking patient.');
    }

    const transactionId = `txn_${crypto.randomBytes(8).toString('hex')}`;

    const payment = await PaymentRepository.createPayment({
      consultationId,
      patientId,
      amount,
      currency,
      paymentMethod,
      transactionId,
      idempotencyKey,
    });

    return {
      paymentId: payment.id,
      transactionId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      // Mock gateway checkout URL / SDK order ID
      gatewayOrderId: `order_${crypto.randomBytes(6).toString('hex')}`,
      paymentMethod,
    };
  }

  /**
   * Process payment gateway webhook & execute saga compensation if failed
   */
  static async processWebhook({ paymentId, status, transactionId }) {
    const payment = await PaymentRepository.findById(paymentId);
    if (!payment) {
      throw new NotFoundError(`Payment record ${paymentId} not found`);
    }

    if (payment.status === 'CAPTURED') {
      logger.info({ paymentId }, 'Payment already processed, ignoring duplicate webhook');
      return payment;
    }

    const updatedPayment = await PaymentRepository.updateStatus(paymentId, status);

    // SAGA ORCHESTRATION:
    const consultation = await ConsultationRepository.findById(payment.consultation_id);

    if (status === 'CAPTURED') {
      // Payment Successful: Confirm consultation
      await ConsultationRepository.updateStatus({
        id: consultation.id,
        status: 'CONFIRMED',
        scheduledAt: consultation.scheduled_at,
      });

      await logAuditEvent({
        userId: payment.patient_id,
        action: 'PAYMENT_CAPTURED',
        resourceType: 'PAYMENT',
        resourceId: paymentId,
        ipAddress: '127.0.0.1',
        userAgent: 'PaymentWebhook/1.0',
        previousState: { status: 'PENDING' },
        newState: { status: 'CAPTURED', amount: payment.amount },
      });
    } else if (status === 'FAILED') {
      // Compensating Transaction: Release held slot and cancel consultation
      if (consultation && consultation.slot_id) {
        await SlotRepository.releaseSlot(consultation.slot_id, payment.patient_id);
      }

      if (consultation) {
        await ConsultationRepository.updateStatus({
          id: consultation.id,
          status: 'CANCELLED',
          scheduledAt: consultation.scheduled_at,
          cancellationReason: 'Payment authorization failed or timed out',
        });
      }

      await logAuditEvent({
        userId: payment.patient_id,
        action: 'PAYMENT_FAILED_SAGA_COMPENSATED',
        resourceType: 'PAYMENT',
        resourceId: paymentId,
        ipAddress: '127.0.0.1',
        userAgent: 'PaymentWebhook/1.0',
        previousState: { status: 'PENDING' },
        newState: { status: 'FAILED', reason: 'Saga compensated: slot released' },
      });
    }

    return updatedPayment;
  }
}

export default PaymentService;
