import { startNotificationWorker } from './notificationWorker.js';
import { startSlotReleaseWorker } from './slotReleaseWorker.js';
import SlotService from '../modules/slots/slot.service.js';
import logger from '../utils/logger.js';

export function startWorkers() {
  logger.info('Initializing Amrutam background job workers...');

  const notificationWorker = startNotificationWorker();
  const slotWorker = startSlotReleaseWorker();

  // Periodic fallback sweep every 60 seconds for any expired holds
  const intervalId = setInterval(async () => {
    try {
      await SlotService.cleanupExpiredSlots();
    } catch (err) {
      logger.error({ err: err.message }, 'Error in periodic slot cleanup sweep');
    }
  }, 60000);

  const shutdown = async () => {
    logger.info('Shutting down background workers gracefully...');
    clearInterval(intervalId);
    await Promise.all([notificationWorker.close(), slotWorker.close()]);
    logger.info('Background workers stopped.');
  };

  return { notificationWorker, slotWorker, shutdown };
}

// Standalone execution
if (process.argv[1].endsWith('workers/index.js')) {
  const { shutdown } = startWorkers();
  process.on('SIGTERM', async () => {
    await shutdown();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    await shutdown();
    process.exit(0);
  });
}

export default startWorkers;
