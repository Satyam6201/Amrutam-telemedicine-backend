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

// Get slots for a doctor
router.get(
  '/doctors/:doctorId/slots',
  validate({ query: getSlotsSchema }),
  SlotController.getDoctorSlots
);

// Hold a slot (Protected, requires Idempotency header to prevent accidental double-clicks)
router.post(
  '/slots/hold',
  authenticate,
  bookingLimiter,
  idempotency({ required: false }),
  validate({ body: holdSlotSchema }),
  SlotController.holdSlot
);

// Release held slot
router.post(
  '/slots/release',
  authenticate,
  idempotency({ required: false }),
  validate({ body: releaseSlotSchema }),
  SlotController.releaseSlot
);

// Doctor or Admin bulk slot generation
router.post(
  '/doctors/:doctorId/slots/bulk',
  authenticate,
  authorizeRoles('DOCTOR', 'ADMIN'),
  validate({ body: bulkCreateSlotsSchema }),
  SlotController.bulkCreateSlots
);

export default router;
