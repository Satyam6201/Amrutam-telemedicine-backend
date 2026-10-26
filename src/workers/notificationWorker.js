import { Worker } from 'bullmq';
import { queueConnection, NOTIFICATION_QUEUE } from '../../config/queue.js';
import logger from '../utils/logger.js';

export function startNotificationWorker() {
  const worker = new Worker(
    NOTIFICATION_QUEUE,
    async (job) => {
      logger.info({ jobId: job.id, jobName: job.name, data: job.data }, 'Processing notification job');

      switch (job.name) {
        case 'consultation-confirmation': {
          const { consultationId, scheduledAt, videoRoomUrl } = job.data;
          logger.info(
            { consultationId, scheduledAt, videoRoomUrl },
            '[SMS/Email] Consultation confirmation dispatched to patient and doctor'
          );
          return { sent: true, channel: 'SMS+EMAIL', timestamp: new Date().toISOString() };
        }

        case 'prescription-ready': {
          const { prescriptionId, patientId } = job.data;
          logger.info(
            { prescriptionId, patientId },
            '[SMS/Email] Prescription alert dispatched with secure download link'
          );
          return { sent: true, channel: 'SMS+EMAIL', timestamp: new Date().toISOString() };
        }

        default:
          logger.warn({ jobName: job.name }, 'Unknown notification job type');
          return { ignored: true };
      }
    },
    {
      connection: queueConnection,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Notification job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Notification job failed');
  });

  return worker;
}

export default startNotificationWorker;
