const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');
const { createRedisClient, closeRedisClient } = require('./utils/redis');
const { closePostgresPool } = require('./utils/postgres');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const { metricsMiddleware } = require('./middleware/metrics');
const { createProfileLimiters } = require('./middleware/rateLimit');
const { createHttpError, errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { router, setupRoutes } = require('./routes');

const app = express();

function validateCorsConfig() {
  if (!config.server.isProductionLike) return;
  if (!config.security.enforceExplicitOriginsInProduction) return;
  if (config.security.allowWildcardCors) {
    throw new Error('Wildcard CORS is not allowed in production-like environments');
  }
  if (!config.security.allowedOrigins.length) {
    throw new Error('ALLOWED_ORIGINS must be configured in production-like environments');
  }
}

function buildCorsOptions() {
  return {
    origin: (origin, callback) => {
      if (!origin) {
        if (config.security.allowRequestsWithoutOrigin) {
          return callback(null, true);
        }
        const error = createHttpError(403, 'CORS_ORIGIN_DENIED', 'Origin not allowed');
        error.extras = { origin: null };
        return callback(error);
      }

      if (config.security.allowWildcardCors) {
        return callback(null, true);
      }

      if (config.security.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const error = createHttpError(403, 'CORS_ORIGIN_DENIED', 'Origin not allowed');
      error.extras = { origin };
      return callback(error);
    },
    credentials: config.security.corsCredentials,
    methods: config.security.allowedMethods,
    allowedHeaders: config.security.allowedHeaders,
    exposedHeaders: config.security.exposedHeaders,
    maxAge: config.security.preflightMaxAgeSeconds,
    optionsSuccessStatus: 204,
    preflightContinue: false,
  };
}

function bodyLimitForRequest(req) {
  if (req.path.startsWith('/api/v1/forum') && req.method !== 'GET') {
    return config.request.bodyLimits.forumWrite;
  }
  if (req.path.startsWith('/api/v1/marketplace') && req.method !== 'GET') {
    return config.request.bodyLimits.marketplaceWrite;
  }
  if (req.path.startsWith('/api/v1/agents') && req.method !== 'GET') {
    return config.request.bodyLimits.identityWrite;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return config.request.bodyLimits.write;
  }
  return config.request.bodyLimits.default;
}

function jsonBodyParser() {
  return (req, res, next) => express.json({ limit: bodyLimitForRequest(req) })(req, res, next);
}

function urlencodedBodyParser() {
  return (req, res, next) => express.urlencoded({ extended: true, limit: bodyLimitForRequest(req) })(req, res, next);
}

async function initializeApp() {
  try {
    validateCorsConfig();

    if (config.security.trustProxy) {
      app.set('trust proxy', 1);
    }

    await createRedisClient();
    logger.info('Redis connected successfully');

    app.use(requestId);
    app.use(helmet());
    app.use((req, res, next) => {
      res.vary('Origin');
      next();
    });
    app.use(cors(buildCorsOptions()));
    app.use(jsonBodyParser());
    app.use(urlencodedBodyParser());
    app.use(requestLogger);
    app.use(metricsMiddleware);

    const limiters = await createProfileLimiters();

    app.use(router);
    setupRoutes(app, limiters);
    app.use(notFoundHandler);
    app.use(errorHandler);

    logger.info('Application initialized successfully', {
      env: config.server.env,
      appMode: config.server.appMode,
      allowedOrigins: config.security.allowedOrigins,
    });
  } catch (error) {
    logger.error('Failed to initialize application', { error: error.message });
    throw error;
  }
}

async function startServer() {
  try {
    await initializeApp();

    const server = app.listen(config.server.port, config.server.host, () => {
      logger.info('API Gateway started', {
        host: config.server.host,
        port: config.server.port,
        env: config.server.env,
        appMode: config.server.appMode,
      });
    });

    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received, starting graceful shutdown`);
      server.close(async () => {
        try {
          await closeRedisClient();
          await closePostgresPool();
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error: error.message });
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
      gracefulShutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection', { reason });
      gracefulShutdown('unhandledRejection');
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.buildCorsOptions = buildCorsOptions;
module.exports.bodyLimitForRequest = bodyLimitForRequest;
module.exports.initializeApp = initializeApp;
module.exports.validateCorsConfig = validateCorsConfig;
