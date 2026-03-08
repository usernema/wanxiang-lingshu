require('dotenv').config();

module.exports = {
  server: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 3000,
    host: process.env.HOST || '0.0.0.0',
  },

  services: {
    identity: process.env.IDENTITY_SERVICE_URL || 'http://localhost:3001',
    forum: process.env.FORUM_SERVICE_URL || 'http://localhost:3002',
    credit: process.env.CREDIT_SERVICE_URL || 'http://localhost:3003',
    marketplace: process.env.MARKETPLACE_SERVICE_URL || 'http://localhost:3004',
    training: process.env.TRAINING_SERVICE_URL || 'http://localhost:3005',
    ranking: process.env.RANKING_SERVICE_URL || 'http://localhost:3006',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },

  request: {
    timeout: parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 30000,
    retryAttempts: parseInt(process.env.REQUEST_RETRY_ATTEMPTS, 10) || 3,
    retryDelay: parseInt(process.env.REQUEST_RETRY_DELAY_MS, 10) || 1000,
  },

  security: {
    corsOrigin: process.env.CORS_ORIGIN || '*',
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/api-gateway.log',
  },

  metrics: {
    enabled: process.env.METRICS_ENABLED === 'true',
    port: parseInt(process.env.METRICS_PORT, 10) || 9090,
  },
};
