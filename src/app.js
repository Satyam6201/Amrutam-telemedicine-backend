import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';
import swaggerUi from 'swagger-ui-express';

import config from '../config/index.js';
import { query } from '../config/database.js';
import redis from '../config/redis.js';
import routes from './routes/index.js';
import errorHandler from './middlewares/errorHandler.js';
import { metricsMiddleware, getMetricsHandler } from './middlewares/metrics.js';
import { NotFoundError } from './utils/errors.js';
import logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );

  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    })
  );

  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(metricsMiddleware);
  app.get('/metrics', getMetricsHandler);

  app.get('/health/live', (req, res) => {
    res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
  });

  app.get('/health/ready', async (req, res) => {
    const checks = {
      database: 'DOWN',
      redis: 'DOWN',
    };

    try {
      await query('SELECT 1');
      checks.database = 'UP';
    } catch (err) {
      checks.database = `DOWN: ${err.message}`;
    }

    try {
      const ping = await redis.ping();
      checks.redis = ping === 'PONG' ? 'UP' : 'DOWN';
    } catch (err) {
      checks.redis = `DOWN: ${err.message}`;
    }

    const isReady = checks.database === 'UP' && checks.redis === 'UP';
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'READY' : 'DEGRADED',
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  try {
    const openapiPath = path.resolve(__dirname, '../openapi/openapi.yaml');
    if (fs.existsSync(openapiPath)) {
      const file = fs.readFileSync(openapiPath, 'utf8');
      const swaggerDoc = yaml.parse(file);
      app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
      logger.info('Interactive Swagger API docs available at /api/docs');
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to load OpenAPI YAML schema for Swagger UI');
  }

  const publicPath = path.resolve(__dirname, '../public');
  app.use(express.static(publicPath));
  app.get('/portal', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  app.use(config.apiPrefix, routes);

  app.get('/', (req, res) => {
    if (req.accepts('html')) {
      return res.sendFile(path.join(publicPath, 'index.html'));
    }
    res.json({
      service: 'Amrutam Telemedicine Backend',
      version: '1.0.0',
      status: 'OPERATIONAL',
      portal: '/portal',
      docs: '/api/docs',
      health: '/health/ready',
      metrics: '/metrics',
    });
  });

  app.use((req, res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found on this server`));
  });

  app.use(errorHandler);

  return app;
}

export default createApp;

