import { Router } from 'express';
import PaymentController from './payment.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { idempotency } from '../../middlewares/idempotency.js';
import { createPaymentSchema, webhookSchema } from './payment.validator.js';

const router = Router();

router.post(
  '/',
  authenticate,
  idempotency({ required: false }),
  validate({ body: createPaymentSchema }),
  PaymentController.createPayment
);

router.post(
  '/webhook',
  validate({ body: webhookSchema }),
  PaymentController.handleWebhook
);

export default router;

