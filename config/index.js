import dotenv from 'dotenv';
dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5433', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'amrutam_telemedicine',
    min: parseInt(process.env.DB_POOL_MIN || '5', 10),
    max: parseInt(process.env.DB_POOL_MAX || '25', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '5000', 10),
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6380', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'amrutam:',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'default-super-secret-jwt-key-replace-in-prod',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-super-secret-refresh-key-replace-in-prod',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    keyVersion: process.env.ENCRYPTION_KEY_VERSION || 'v1',
  },

  mfa: {
    issuer: process.env.MFA_ISSUER || 'Amrutam Telemedicine',
  },

  idempotency: {
    ttlSeconds: parseInt(process.env.IDEMPOTENCY_TTL_SECONDS || '86400', 10),
  },

  locking: {
    slotLockTtlSeconds: parseInt(process.env.SLOT_LOCK_TTL_SECONDS || '900', 10),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '120', 10),
    authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '15', 10),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

export default config;

