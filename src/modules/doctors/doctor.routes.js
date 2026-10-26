import { Router } from 'express';
import DoctorController from './doctor.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { authorizeRoles } from '../../middlewares/rbac.js';
import { doctorSearchSchema } from './doctor.validator.js';

const router = Router();

// Public doctor search and catalogs
router.get('/', validate({ query: doctorSearchSchema }), DoctorController.searchDoctors);
router.get('/specialties', DoctorController.getSpecialties);
router.get('/:id', DoctorController.getDoctorById);

// Admin-only doctor approval
router.patch(
  '/:id/approve',
  authenticate,
  authorizeRoles('ADMIN'),
  DoctorController.approveDoctor
);

export default router;
