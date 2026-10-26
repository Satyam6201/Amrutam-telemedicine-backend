import { Worker } from 'bullmq';
import { queueConnection, SLOT_EXPIRATION_QUEUE } from '../../config/queue.js';
import SlotService from '../modules/slots/slot.service.js';
import logger from '../utils/logger.js';

export function startSlotReleaseWorker() {
  const worker = new Worker(
    SLOT_EXPIRATION_QUEUE,
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, 'Processing slot expiration check');
      const { slotId } = job.data;

      // Clean up any slots that have reached expiration
      const released = await SlotService.cleanupExpiredSlots();
      return { releasedCount: released.length };
    },
    {
      connection: queueConnection,
      concurrency: 2,
    }
  );

  worker.on('completed', (job, result) => {
    logger.debug({ jobId: job.id, result }, 'Slot expiration job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Slot expiration job failed');
  });

  return worker;
}

export default startSlotReleaseWorker;
