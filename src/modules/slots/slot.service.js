import SlotRepository from './slot.repository.js';
import { slotExpirationQueue } from '../../../config/queue.js';
import DistributedLock from '../../utils/distributedLock.js';
import { ConflictError, NotFoundError, BadRequestError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

export class SlotService {
  static async getDoctorSlots(doctorId, date, status) {
    return SlotRepository.findSlotsByDoctorAndDate(doctorId, date, status);
  }

  /**
   * Concurrency-safe slot reservation
   * Uses distributed lock + optimistic atomic row lock
   */
  static async holdSlot(slotId, patientId, ttlMinutes = 15) {
    const lockKey = `slot:${slotId}`;

    return DistributedLock.withLock(lockKey, 5000, async () => {
      // 1. Check if slot exists
      const existing = await SlotRepository.findSlotById(slotId);
      if (!existing) {
        throw new NotFoundError(`Slot with ID ${slotId} not found.`);
      }

      if (existing.status === 'BOOKED') {
        throw new ConflictError('This consultation slot has already been booked.');
      }

      // 2. Perform atomic DB update
      const heldSlot = await SlotRepository.holdSlot(slotId, patientId, ttlMinutes);
      if (!heldSlot) {
        throw new ConflictError('This slot is currently held by another patient. Please select another slot.');
      }

      // 3. Schedule auto-expiration background job (delayed 15 mins)
      try {
        await slotExpirationQueue.add(
          'expire-slot-hold',
          { slotId, patientId },
          { delay: ttlMinutes * 60 * 1000, jobId: `expire-${slotId}` }
        );
      } catch (err) {
        logger.warn({ err: err.message }, 'Failed to schedule slot expiration queue job');
      }

      return heldSlot;
    });
  }

  /**
   * Manually release held slot
   */
  static async releaseSlot(slotId, patientId) {
    const released = await SlotRepository.releaseSlot(slotId, patientId);
    if (!released) {
      throw new BadRequestError('Slot was not held by this user or has already been booked/released.');
    }
    return released;
  }

  /**
   * Bulk create doctor availability slots
   */
  static async bulkCreateSlots(doctorId, date, slots) {
    return SlotRepository.bulkCreateSlots(doctorId, date, slots);
  }

  /**
   * Background release of expired holds
   */
  static async cleanupExpiredSlots() {
    const released = await SlotRepository.releaseAllExpiredSlots();
    if (released.length > 0) {
      logger.info({ count: released.length }, 'Expired slots released back to AVAILABLE');
    }
    return released;
  }
}

export default SlotService;
