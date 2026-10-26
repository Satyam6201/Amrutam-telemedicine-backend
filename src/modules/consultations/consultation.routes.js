import { Router } from 'express';
import ConsultationController from './consultation.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { authorizeRoles } from '../../middlewares/rbac.js';
import { idempotency } from '../../middlewares/idempotency.js';
import { rateLimiter } from '../../middlewares/rateLimiter.js';
import {
  bookConsultationSchema,
  updateConsultationStatusSchema,
  cancelConsultationSchema,
  listConsultationsSchema,
} from './consultation.validator.js';

const router = Router();
const bookingLimiter = rateLimiter({ windowMs: 60000, max: 20, keyPrefix: 'rl:consultation' });

router.use(authenticate);

router.get(
  '/',
  validate({ query: listConsultationsSchema }),
  ConsultationController.listConsultations
);

router.post(
  '/',
  authorizeRoles('PATIENT', 'ADMIN'),
  bookingLimiter,
  idempotency({ required: false }),
  validate({ body: bookConsultationSchema }),
  ConsultationController.bookConsultation
);

router.get('/:id', ConsultationController.getConsultationById);

router.patch(
  '/:id/status',
  authorizeRoles('DOCTOR', 'ADMIN'),
  validate({ body: updateConsultationStatusSchema }),
  ConsultationController.updateStatus
);

router.post(
  '/:id/cancel',
  validate({ body: cancelConsultationSchema }),
  ConsultationController.cancelConsultation
);

export default router;

