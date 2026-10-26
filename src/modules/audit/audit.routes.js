import { Router } from 'express';
import AuditController from './audit.controller.js';
import { authenticate } from '../../middlewares/auth.js';
import { authorizeRoles } from '../../middlewares/rbac.js';

const router = Router();

// Only ADMIN can access compliance audit trails
router.use(authenticate, authorizeRoles('ADMIN'));

router.get('/', AuditController.listLogs);
router.get('/verify-integrity', AuditController.verifyIntegrity);

export default router;
