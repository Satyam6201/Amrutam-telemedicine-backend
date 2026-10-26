import { Router } from 'express';
import SlotController from './slot.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { authorizeRoles } from '../../middlewares/rbac.js';
import { idempotency } from '../../middlewares/idempotency.js';
import { rateLimiter } from '../../middlewares/rateLimiter.js';
import {
  getSlotsSchema,
  holdSlotSchema,
  releaseSlotSchema,
  bulkCreateSlotsSchema,
} from './slot.validator.js';

const router = Router();
const bookingLimiter = rateLimiter({ windowMs: 60000, max: 30, keyPrefix: 'rl:booking' });

router.get(
  '/doctors/:doctorId/slots',
  validate({ query: getSlotsSchema }),
  SlotController.getDoctorSlots
);

router.post(
  '/slots/hold',
  authenticate,
  bookingLimiter,
  idempotency({ required: false }),
  validate({ body: holdSlotSchema }),
  SlotController.holdSlot
);

router.post(
  '/slots/release',
  authenticate,
  idempotency({ required: false }),
  validate({ body: releaseSlotSchema }),
  SlotController.releaseSlot
);

router.post(
  '/doctors/:doctorId/slots/bulk',
  authenticate,
  authorizeRoles('DOCTOR', 'ADMIN'),
  validate({ body: bulkCreateSlotsSchema }),
  SlotController.bulkCreateSlots
);

export default router;

