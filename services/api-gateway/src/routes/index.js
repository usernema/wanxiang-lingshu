const express = require('express');
const axios = require('axios');
const config = require('../config');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { createRouteProxies } = require('./proxy');
const { metricsHandler } = require('../middleware/metrics');
const { getRedisClient } = require('../utils/redis');
const { asyncHandler, sendError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

function buildMeta(req) {
  return {
    requestId: req.id,
    timestamp: new Date().toISOString(),
  };
}

function success(res, req, status, body) {
  return res.status(status).json({
    ...body,
    ...buildMeta(req),
  });
}

function serviceHealthPath(serviceName) {
  return serviceName === 'forum' ? '/api/v1/forum/health' : '/health';
}

async function checkRedisDependency() {
  try {
    const redis = await getRedisClient();
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis ping timeout')), config.health.dependencyTimeout)),
    ]);

    return { name: 'redis', required: config.health.redisRequired, ok: true };
  } catch (error) {
    return {
      name: 'redis',
      required: config.health.redisRequired,
      ok: false,
      error: error.message,
    };
  }
}

async function checkServiceHealth(serviceName, required) {
  const url = config.services[serviceName];
  if (!url) {
    return { name: serviceName, required, ok: false, error: 'Service URL not configured' };
  }

  try {
    const response = await axios.get(`${url}${serviceHealthPath(serviceName)}`, {
      timeout: config.health.dependencyTimeout,
      headers: { 'X-Request-Id': `health-${Date.now()}` },
    });
    return { name: serviceName, required, ok: true, status: response.status, url };
  } catch (error) {
    return {
      name: serviceName,
      required,
      ok: false,
      url,
      status: error.response?.status || null,
      error: error.response?.data?.error || error.message,
    };
  }
}

async function getDependencyStatus() {
  const redisCheck = await checkRedisDependency();
  const requiredChecks = await Promise.all(config.health.requiredServices.map((service) => checkServiceHealth(service, true)));
  const optionalChecks = await Promise.all(config.health.optionalServices.map((service) => checkServiceHealth(service, false)));

  return {
    redis: redisCheck,
    required: requiredChecks,
    optional: optionalChecks,
  };
}

function isReady(dependencies) {
  const requiredDependencies = [dependencies.redis, ...dependencies.required].filter(Boolean);
  return requiredDependencies.every((dependency) => dependency.required ? dependency.ok : true);
}

router.get('/live', (req, res) => success(res, req, 200, { success: true, status: 'alive', uptime: process.uptime(), mode: config.server.appMode }));
router.get('/health/live', (req, res) => success(res, req, 200, { success: true, status: 'alive', uptime: process.uptime(), mode: config.server.appMode }));
router.get('/livez', (req, res) => success(res, req, 200, { success: true, status: 'alive' }));

router.get('/ready', asyncHandler(async (req, res) => {
  const dependencies = await getDependencyStatus();
  const ready = isReady(dependencies);

  if (!ready) {
    return sendError(res, req, {
      status: 503,
      code: 'SERVICE_UNREADY',
      error: 'Gateway is not ready to receive traffic',
      extras: { status: 'unready', dependencies },
    });
  }

  return success(res, req, 200, {
    success: true,
    status: 'ready',
    dependencies,
  });
}));
router.get('/health/ready', asyncHandler(async (req, res) => {
  const dependencies = await getDependencyStatus();
  const ready = isReady(dependencies);

  if (!ready) {
    return sendError(res, req, {
      status: 503,
      code: 'SERVICE_UNREADY',
      error: 'Gateway is not ready to receive traffic',
      extras: { status: 'unready', dependencies },
    });
  }

  return success(res, req, 200, {
    success: true,
    status: 'ready',
    dependencies,
  });
}));
router.get('/readyz', asyncHandler(async (req, res) => {
  const dependencies = await getDependencyStatus();
  const ready = isReady(dependencies);
  return res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? 'ready' : 'degraded',
    ...buildMeta(req),
    dependencies,
  });
}));

router.get('/health', asyncHandler(async (req, res) => {
  const dependencies = await getDependencyStatus();
  const ready = isReady(dependencies);
  return res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? 'healthy' : 'degraded',
    uptime: process.uptime(),
    mode: config.server.appMode,
    ...buildMeta(req),
    dependencies,
  });
}));

router.get('/health/deps', asyncHandler(async (req, res) => {
  const dependencies = await getDependencyStatus();
  const ready = isReady(dependencies);
  return res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? 'healthy' : 'degraded',
    ...buildMeta(req),
    dependencies,
  });
}));

router.get('/metrics', metricsHandler);

router.get('/api/v1', (req, res) => {
  res.json({
    success: true,
    version: '1.0.0',
    mode: config.server.appMode,
    ...buildMeta(req),
    services: {
      identity: '/api/v1/agents',
      forum: '/api/v1/forum',
      credit: '/api/v1/credits',
      marketplace: '/api/v1/marketplace',
      training: '/api/v1/training',
      ranking: '/api/v1/rankings',
    },
  });
});

function setupRoutes(app, middleware = {}) {
  const proxies = createRouteProxies();
  const {
    defaultLimiter,
    authLimiter,
    publicReadLimiter,
    writeLimiter,
  } = middleware;

  app.use('/api/v1/agents/register', ...(authLimiter ? [authLimiter] : []), proxies.identity);
  app.use('/api/v1/agents/challenge', ...(authLimiter ? [authLimiter] : []), proxies.identity);
  app.use('/api/v1/agents/login', ...(authLimiter ? [authLimiter] : []), proxies.identity);
  app.use('/api/v1/agents/verify', ...(authLimiter ? [authLimiter] : []), proxies.identity);
  app.use('/api/v1/agents/dev/bootstrap', proxies.identity);
  app.use('/api/v1/agents/dev/session', proxies.identity);
  app.get('/api/v1/agents/:aid', ...(publicReadLimiter ? [publicReadLimiter] : []), proxies.identity);
  app.get('/api/v1/agents/:aid/reputation', ...(publicReadLimiter ? [publicReadLimiter] : []), proxies.identity);
  app.use('/api/v1/agents', authenticate, ...(defaultLimiter ? [defaultLimiter] : []), proxies.identity);

  app.get('/api/v1/forum/posts*', optionalAuthenticate, ...(publicReadLimiter ? [publicReadLimiter] : []), proxies.forum);
  app.use('/api/v1/forum', authenticate, ...(writeLimiter ? [writeLimiter] : []), proxies.forum);

  app.use('/api/v1/credits', authenticate, ...(writeLimiter ? [writeLimiter] : []), proxies.credit);

  app.get('/api/v1/marketplace/skills*', optionalAuthenticate, ...(publicReadLimiter ? [publicReadLimiter] : []), proxies.marketplace);
  app.get('/api/v1/marketplace/tasks*', optionalAuthenticate, ...(publicReadLimiter ? [publicReadLimiter] : []), proxies.marketplace);
  app.use('/api/v1/marketplace', authenticate, ...(writeLimiter ? [writeLimiter] : []), proxies.marketplace);

  app.get('/api/v1/training/challenges*', optionalAuthenticate, ...(publicReadLimiter ? [publicReadLimiter] : []), proxies.training);
  app.use('/api/v1/training', authenticate, ...(writeLimiter ? [writeLimiter] : []), proxies.training);

  app.use('/api/v1/rankings', optionalAuthenticate, ...(publicReadLimiter ? [publicReadLimiter] : []), proxies.ranking);

  logger.info('Routes configured successfully');
}

module.exports = {
  buildMeta,
  checkRedisDependency,
  checkServiceHealth,
  getDependencyStatus,
  isReady,
  router,
  setupRoutes,
};
