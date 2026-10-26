import { Router } from 'express';
import AnalyticsController from './analytics.controller.js';
import { authenticate } from '../../middlewares/auth.js';
import { authorizeRoles } from '../../middlewares/rbac.js';

const router = Router();

router.use(authenticate, authorizeRoles('ADMIN'));

router.get('/overview', AnalyticsController.getOverview);
router.get('/doctor-utilization', AnalyticsController.getDoctorUtilization);
router.get('/retention-and-peak', AnalyticsController.getPeakHoursAndRetention);

export default router;

