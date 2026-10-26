import http from 'http';
import createApp from './app.js';
import config from '../config/index.js';
import { pool } from '../config/database.js';
import redis from '../config/redis.js';
import startWorkers from './workers/index.js';
import logger from './utils/logger.js';

const app = createApp();
const server = http.createServer(app);

const { shutdown: stopWorkers } = startWorkers();

server.listen(config.port, () => {
  logger.info(
    `Amrutam Telemedicine Backend running on port ${config.port} in [${config.env}] mode`
  );
  logger.info(`API Documentation: http://localhost:${config.port}/api/docs`);
  logger.info(`Healthcheck: http://localhost:${config.port}/health/ready`);
  logger.info(`Prometheus Metrics: http://localhost:${config.port}/metrics`);
});

let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    logger.info('HTTP server closed.');

    try {

      await stopWorkers();

      await redis.quit();
      logger.info('Redis connection closed.');

      await pool.end();
      logger.info('PostgreSQL connection pool closed.');

      logger.info('Graceful shutdown completed successfully. Exiting process.');
      process.exit(0);
    } catch (error) {
      logger.error({ error: error.message }, 'Error occurred during graceful shutdown');
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error('Graceful shutdown timed out after 10s. Forcing exit.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught Exception! Shutting down immediately.');
  process.exit(1);
});

export default server;

