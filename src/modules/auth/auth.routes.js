import { Router } from 'express';
import AuthController from './auth.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { rateLimiter } from '../../middlewares/rateLimiter.js';
import {
  registerSchema,
  loginSchema,
  mfaVerifySchema,
  refreshTokenSchema,
} from './auth.validator.js';

const router = Router();

const authLimiter = rateLimiter({ windowMs: 60000, max: 20, keyPrefix: 'rl:auth' });

router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  AuthController.register
);

router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  AuthController.login
);

router.post(
  '/refresh-token',
  validate({ body: refreshTokenSchema }),
  AuthController.refreshToken
);

router.get(
  '/me',
  authenticate,
  AuthController.getCurrentUser
);

router.post(
  '/mfa/setup',
  authenticate,
  AuthController.setupMFA
);

router.post(
  '/mfa/verify',
  authenticate,
  validate({ body: mfaVerifySchema }),
  AuthController.verifyMFA
);

export default router;

