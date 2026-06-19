/**
 * Centralised environment configuration.
 * All process.env reads happen here so the rest of the codebase
 * never touches process.env directly.
 */
export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '8000', 10),

  // PostgreSQL
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
  DB_NAME: process.env.DB_NAME || 'tailorstaq',
  DB_USER: process.env.DB_USER || 'tailorstaq_user',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN || '2', 10),
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || '10', 10),
  DB_SSL: process.env.DB_SSL === 'true',

  // Redis
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  REDIS_TLS: process.env.REDIS_TLS === 'true',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'change_me_to_a_long_random_secret',
  JWT_EXPIRY_SECONDS: parseInt(process.env.JWT_EXPIRY_SECONDS || '86400', 10),

  // Bcrypt
  BCRYPT_COST_FACTOR: parseInt(process.env.BCRYPT_COST_FACTOR || '12', 10),

  // Object store
  OBJECT_STORE_PROVIDER: process.env.OBJECT_STORE_PROVIDER || 's3',
  OBJECT_STORE_BUCKET: process.env.OBJECT_STORE_BUCKET || 'tailorstaq-uploads',
  OBJECT_STORE_REGION: process.env.OBJECT_STORE_REGION || 'us-east-1',
  OBJECT_STORE_ACCESS_KEY_ID: process.env.OBJECT_STORE_ACCESS_KEY_ID || '',
  OBJECT_STORE_SECRET_ACCESS_KEY: process.env.OBJECT_STORE_SECRET_ACCESS_KEY || '',
  OBJECT_STORE_ENDPOINT: process.env.OBJECT_STORE_ENDPOINT || '',
  OBJECT_STORE_FORCE_PATH_STYLE: process.env.OBJECT_STORE_FORCE_PATH_STYLE === 'true',

  // SMTP
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.example.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',
  SMTP_FROM_NAME: process.env.SMTP_FROM_NAME || 'TAILORSTAQ',
  SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL || 'no-reply@tailorstaq.com',

  // BullMQ queue names
  QUEUE_EMAIL: process.env.QUEUE_EMAIL || 'email',
  QUEUE_PDF: process.env.QUEUE_PDF || 'pdf-generation',

  // Subscription limits
  FREE_TIER_MAX_PRODUCTS: parseInt(process.env.FREE_TIER_MAX_PRODUCTS || '10', 10),
  FREE_TIER_MAX_MONTHLY_ORDERS: parseInt(process.env.FREE_TIER_MAX_MONTHLY_ORDERS || '50', 10),

  // Account lockout
  MAX_FAILED_LOGIN_ATTEMPTS: parseInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS || '5', 10),
  LOCKOUT_DURATION_MINUTES: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10),

  // File upload
  UPLOAD_MAX_FILE_SIZE_BYTES: parseInt(process.env.UPLOAD_MAX_FILE_SIZE_BYTES || '5242880', 10),

  // Frontend URL
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
};
