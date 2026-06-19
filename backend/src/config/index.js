'use strict';

/**
 * Central configuration module.
 * All environment variables are read here so the rest of the codebase
 * never calls process.env directly.
 */
export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'tailorstaq',
    user: process.env.DB_USER || 'tailorstaq_user',
    password: process.env.DB_PASSWORD || '',
    poolMin: parseInt(process.env.DB_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DB_POOL_MAX || '10', 10),
    ssl: process.env.DB_SSL === 'true',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change_me',
    expirySeconds: parseInt(process.env.JWT_EXPIRY_SECONDS || '86400', 10),
  },

  bcrypt: {
    costFactor: parseInt(process.env.BCRYPT_COST_FACTOR || '12', 10),
  },

  objectStore: {
    provider: process.env.OBJECT_STORE_PROVIDER || 's3',
    bucket: process.env.OBJECT_STORE_BUCKET || 'tailorstaq-uploads',
    region: process.env.OBJECT_STORE_REGION || 'us-east-1',
    accessKeyId: process.env.OBJECT_STORE_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.OBJECT_STORE_SECRET_ACCESS_KEY || '',
    endpoint: process.env.OBJECT_STORE_ENDPOINT || undefined,
    forcePathStyle: process.env.OBJECT_STORE_FORCE_PATH_STYLE === 'true',
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    fromName: process.env.SMTP_FROM_NAME || 'TAILORSTAQ',
    fromEmail: process.env.SMTP_FROM_EMAIL || 'no-reply@tailorstaq.com',
  },

  queues: {
    email: process.env.QUEUE_EMAIL || 'email',
    pdf: process.env.QUEUE_PDF || 'pdf-generation',
  },

  freeTier: {
    maxProducts: parseInt(process.env.FREE_TIER_MAX_PRODUCTS || '10', 10),
    maxMonthlyOrders: parseInt(process.env.FREE_TIER_MAX_MONTHLY_ORDERS || '50', 10),
  },

  lockout: {
    maxFailedAttempts: parseInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS || '5', 10),
    durationMinutes: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10),
  },

  upload: {
    maxFileSizeBytes: parseInt(process.env.UPLOAD_MAX_FILE_SIZE_BYTES || '5242880', 10),
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};
