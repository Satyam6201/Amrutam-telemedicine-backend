import { Router } from 'express';
import PrescriptionController from './prescription.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { authorizeRoles } from '../../middlewares/rbac.js';
import { idempotency } from '../../middlewares/idempotency.js';
import { issuePrescriptionSchema } from './prescription.validator.js';

const router = Router();

router.use(authenticate);

// Issue prescription (Doctor or Admin only, protected by idempotency)
router.post(
  '/',
  authorizeRoles('DOCTOR', 'ADMIN'),
  idempotency({ required: false }),
  validate({ body: issuePrescriptionSchema }),
  PrescriptionController.issuePrescription
);

// Get prescription for a consultation (Patient, Doctor, Admin)
router.get(
  '/consultation/:consultationId',
  PrescriptionController.getByConsultationId
);

export default router;
