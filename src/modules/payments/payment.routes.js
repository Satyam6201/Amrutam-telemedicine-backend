import { Router } from 'express';
import PaymentController from './payment.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { idempotency } from '../../middlewares/idempotency.js';
import { createPaymentSchema, webhookSchema } from './payment.validator.js';

const router = Router();

// Initiate payment (Patient only, protected by idempotency)
router.post(
  '/',
  authenticate,
  idempotency({ required: false }),
  validate({ body: createPaymentSchema }),
  PaymentController.createPayment
);

// Payment Gateway Webhook (Razorpay/Stripe mock webhook)
router.post(
  '/webhook',
  validate({ body: webhookSchema }),
  PaymentController.handleWebhook
);

export default router;
