import { Router } from 'express';
import authRouter from '../modules/auth/auth.routes.js';
import doctorRouter from '../modules/doctors/doctor.routes.js';
import slotRouter from '../modules/slots/slot.routes.js';
import consultationRouter from '../modules/consultations/consultation.routes.js';
import prescriptionRouter from '../modules/prescriptions/prescription.routes.js';
import paymentRouter from '../modules/payments/payment.routes.js';
import auditRouter from '../modules/audit/audit.routes.js';
import analyticsRouter from '../modules/analytics/analytics.routes.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/doctors', doctorRouter);
router.use('/', slotRouter);
router.use('/consultations', consultationRouter);
router.use('/prescriptions', prescriptionRouter);
router.use('/payments', paymentRouter);
router.use('/admin/audit-logs', auditRouter);
router.use('/admin/analytics', analyticsRouter);

export default router;

