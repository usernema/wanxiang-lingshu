require('dotenv').config();

function parseInteger(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function parseList(value, fallback = []) {
  if (value === undefined || value === null || value === '') {
    return Array.isArray(fallback) ? [...fallback] : [];
  }

  const items = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : [];
}

const env = process.env.NODE_ENV || 'development';
const appMode = process.env.APP_MODE || env;
const isProductionLike = env === 'production' || appMode === 'production';
const defaultDevOrigins = ['http://localhost:3000', 'http://localhost:8080'];
const allowedOrigins = parseList(process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '', isProductionLike ? [] : defaultDevOrigins);

if (!isProductionLike && allowedOrigins.length === 0) {
  allowedOrigins.push(...defaultDevOrigins);
}

const normalizedAllowedOrigins = Array.from(new Set(allowedOrigins));

const defaultRequiredServices = ['identity', 'forum', 'credit', 'marketplace'];
const defaultOptionalServices = [];

module.exports = {
  server: {
    env,
    appMode,
    isProductionLike,
    port: parseInteger(process.env.PORT, 3000),
    host: process.env.HOST || '0.0.0.0',
  },

  services: {
    identity: process.env.IDENTITY_SERVICE_URL || 'http://localhost:8001',
    forum: process.env.FORUM_SERVICE_URL || 'http://localhost:3002',
    credit: process.env.CREDIT_SERVICE_URL || 'http://localhost:8080',
    marketplace: process.env.MARKETPLACE_SERVICE_URL || 'http://localhost:8000',
    training: process.env.TRAINING_SERVICE_URL || 'http://localhost:3005',
    ranking: process.env.RANKING_SERVICE_URL || 'http://localhost:3006',
  },

  bootstrap: {
    readinessTimeout: parseInteger(process.env.BOOTSTRAP_READINESS_TIMEOUT_MS, 5000),
    path: process.env.BOOTSTRAP_PATH || '/api/v1/agents/dev/bootstrap',
    balancePath: process.env.BALANCE_PATH || '/api/v1/credits/balance',
    mode: process.env.BOOTSTRAP_MODE || 'disabled',
  },

  admin: {
    consoleToken: process.env.ADMIN_CONSOLE_TOKEN || '',
    enabled: Boolean(process.env.ADMIN_CONSOLE_TOKEN),
    maxPageSize: parseInteger(process.env.ADMIN_MAX_PAGE_SIZE, 100),
    defaultPageSize: parseInteger(process.env.ADMIN_DEFAULT_PAGE_SIZE, 20),
    maxBatchSize: parseInteger(process.env.ADMIN_MAX_BATCH_SIZE, 50),
  },

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInteger(process.env.DB_PORT, 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'a2ahub',
    sslmode: process.env.DB_SSLMODE || 'disable',
    maxConnections: parseInteger(process.env.DB_MAX_CONNECTIONS, 5),
    idleTimeoutMs: parseInteger(process.env.DB_IDLE_TIMEOUT_MS, 30000),
    connectionTimeoutMs: parseInteger(process.env.DB_CONNECTION_TIMEOUT_MS, 5000),
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInteger(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInteger(process.env.REDIS_DB, 0),
  },

  rateLimit: {
    profiles: {
      default: {
        windowMs: parseInteger(process.env.RATE_LIMIT_WINDOW_MS, 60000),
        maxRequests: parseInteger(process.env.RATE_LIMIT_MAX_REQUESTS, isProductionLike ? 80 : 100),
        keyStrategy: 'agentOrIp',
      },
      auth: {
        windowMs: parseInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 60000),
        maxRequests: parseInteger(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, isProductionLike ? 12 : 30),
        keyStrategy: 'ip',
      },
      authBurst: {
        windowMs: parseInteger(process.env.AUTH_BURST_RATE_LIMIT_WINDOW_MS, 10000),
        maxRequests: parseInteger(process.env.AUTH_BURST_RATE_LIMIT_MAX_REQUESTS, isProductionLike ? 3 : 8),
        keyStrategy: 'ip',
      },
      publicRead: {
        windowMs: parseInteger(process.env.PUBLIC_READ_RATE_LIMIT_WINDOW_MS, 60000),
        maxRequests: parseInteger(process.env.PUBLIC_READ_RATE_LIMIT_MAX_REQUESTS, isProductionLike ? 60 : 120),
        keyStrategy: 'agentOrIp',
      },
      write: {
        windowMs: parseInteger(process.env.WRITE_RATE_LIMIT_WINDOW_MS, 60000),
        maxRequests: parseInteger(process.env.WRITE_RATE_LIMIT_MAX_REQUESTS, isProductionLike ? 20 : 40),
        keyStrategy: 'agentOrIp',
      },
      authenticatedIp: {
        windowMs: parseInteger(process.env.AUTHENTICATED_IP_RATE_LIMIT_WINDOW_MS, 60000),
        maxRequests: parseInteger(process.env.AUTHENTICATED_IP_RATE_LIMIT_MAX_REQUESTS, isProductionLike ? 120 : 240),
        keyStrategy: 'ip',
      },
      internal: {
        windowMs: parseInteger(process.env.INTERNAL_RATE_LIMIT_WINDOW_MS, 60000),
        maxRequests: parseInteger(process.env.INTERNAL_RATE_LIMIT_MAX_REQUESTS, isProductionLike ? 300 : 600),
        keyStrategy: 'agentOrIp',
      },
      admin: {
        windowMs: parseInteger(process.env.ADMIN_RATE_LIMIT_WINDOW_MS, 60000),
        maxRequests: parseInteger(process.env.ADMIN_RATE_LIMIT_MAX_REQUESTS, isProductionLike ? 30 : 60),
        keyStrategy: 'ip',
      },
      health: {
        windowMs: parseInteger(process.env.HEALTH_RATE_LIMIT_WINDOW_MS, 60000),
        maxRequests: parseInteger(process.env.HEALTH_RATE_LIMIT_MAX_REQUESTS, isProductionLike ? 600 : 1200),
        keyStrategy: 'ip',
      },
    },
  },

  request: {
    connectTimeout: parseInteger(process.env.REQUEST_CONNECT_TIMEOUT_MS, 5000),
    upstreamTimeout: parseInteger(process.env.REQUEST_UPSTREAM_TIMEOUT_MS, parseInteger(process.env.REQUEST_TIMEOUT_MS, 15000)),
    timeout: parseInteger(process.env.REQUEST_UPSTREAM_TIMEOUT_MS, parseInteger(process.env.REQUEST_TIMEOUT_MS, 15000)),
    classifyProxyErrors: parseBoolean(process.env.CLASSIFY_PROXY_ERRORS, true),
    bodyLimits: {
      default: process.env.REQUEST_BODY_LIMIT_DEFAULT || process.env.REQUEST_BODY_LIMIT || '256kb',
      write: process.env.REQUEST_BODY_LIMIT_WRITE || '512kb',
      forumWrite: process.env.REQUEST_BODY_LIMIT_FORUM_WRITE || '1mb',
      marketplaceWrite: process.env.REQUEST_BODY_LIMIT_MARKETPLACE_WRITE || '1mb',
      identityWrite: process.env.REQUEST_BODY_LIMIT_IDENTITY_WRITE || '256kb',
    },
  },

  security: {
    corsOrigin: process.env.CORS_ORIGIN || '',
    allowedOrigins: normalizedAllowedOrigins,
    trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
    allowWildcardCors: parseBoolean(process.env.ALLOW_WILDCARD_CORS, false) && !isProductionLike,
    allowRequestsWithoutOrigin: parseBoolean(process.env.ALLOW_REQUESTS_WITHOUT_ORIGIN, true),
    enforceExplicitOriginsInProduction: parseBoolean(process.env.ENFORCE_EXPLICIT_ORIGINS_IN_PRODUCTION, true),
    corsCredentials: parseBoolean(process.env.CORS_CREDENTIALS, true),
    preflightMaxAgeSeconds: parseInteger(process.env.CORS_PREFLIGHT_MAX_AGE_SECONDS, 600),
    allowedMethods: parseList(process.env.CORS_ALLOWED_METHODS, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']),
    allowedHeaders: parseList(process.env.CORS_ALLOWED_HEADERS, ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Trace-Id']),
    exposedHeaders: parseList(process.env.CORS_EXPOSED_HEADERS, ['X-Request-Id', 'X-Trace-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After']),
  },

  health: {
    readinessTimeout: parseInteger(process.env.READINESS_TIMEOUT_MS, parseInteger(process.env.BOOTSTRAP_READINESS_TIMEOUT_MS, 5000)),
    dependencyTimeout: parseInteger(process.env.HEALTH_DEPENDENCY_TIMEOUT_MS, 2500),
    redisRequired: parseBoolean(process.env.HEALTH_REDIS_REQUIRED, true),
    requiredServices: parseList(process.env.HEALTH_REQUIRED_SERVICES, defaultRequiredServices),
    optionalServices: parseList(process.env.HEALTH_OPTIONAL_SERVICES, defaultOptionalServices),
    skipLogPaths: ['/health', '/health/live', '/health/ready', '/health/deps', '/live', '/ready', '/livez', '/readyz', '/metrics'],
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/api-gateway.log',
  },

  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    port: parseInteger(process.env.METRICS_PORT, 9090),
  },
};
