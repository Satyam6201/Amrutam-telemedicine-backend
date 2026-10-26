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

// List consultations for current user (Doctor, Patient, Admin)
router.get(
  '/',
  validate({ query: listConsultationsSchema }),
  ConsultationController.listConsultations
);

// Book new consultation (Patient only, protected by idempotency)
router.post(
  '/',
  authorizeRoles('PATIENT', 'ADMIN'),
  bookingLimiter,
  idempotency({ required: false }),
  validate({ body: bookConsultationSchema }),
  ConsultationController.bookConsultation
);

// Get specific consultation details
router.get('/:id', ConsultationController.getConsultationById);

// Update consultation status (Doctor / Admin)
router.patch(
  '/:id/status',
  authorizeRoles('DOCTOR', 'ADMIN'),
  validate({ body: updateConsultationStatusSchema }),
  ConsultationController.updateStatus
);

// Cancel consultation (Patient, Doctor, Admin)
router.post(
  '/:id/cancel',
  validate({ body: cancelConsultationSchema }),
  ConsultationController.cancelConsultation
);

export default router;
