const express = require('express');
const axios = require('axios');
const config = require('../config');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { requireAdminAccess } = require('../middleware/admin');
const { createRouteProxies } = require('./proxy');
const { metricsHandler } = require('../middleware/metrics');
const { getRedisClient } = require('../utils/redis');
const { asyncHandler, createHttpError, sendError } = require('../middleware/errorHandler');
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

function normalizeLimit(value) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return config.admin.defaultPageSize;
  }
  return Math.min(parsed, config.admin.maxPageSize);
}

function normalizeOffset(value) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function serviceHealthPath(serviceName) {
  return serviceName === 'forum' ? '/api/v1/forum/health' : '/health';
}

async function runWithTimeout(promise, timeoutMs, errorMessage) {
  let timeoutHandle = null;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
        timeoutHandle.unref?.();
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function checkRedisDependency() {
  try {
    const redis = await getRedisClient();
    await runWithTimeout(redis.ping(), config.health.dependencyTimeout, 'Redis ping timeout');

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

async function callService(serviceName, method, path, options = {}) {
  const baseUrl = config.services[serviceName];
  if (!baseUrl) {
    throw new Error(`Service URL not configured for ${serviceName}`);
  }

  try {
    const response = await axios.request({
      method,
      url: `${baseUrl}${path}`,
      params: options.params,
      data: options.data,
      timeout: config.request.upstreamTimeout,
      headers: {
        'X-Request-Id': `admin-${Date.now()}`,
        ...(options.headers || {}),
      },
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      throw createHttpError(
        error.response.status || 502,
        error.response.data?.code || 'UPSTREAM_REQUEST_FAILED',
        error.response.data?.error || error.message || 'Upstream request failed',
        { service: serviceName },
      );
    }

    throw error;
  }
}

async function fetchServiceJson(serviceName, path, params = {}, headers = {}) {
  return callService(serviceName, 'get', path, { params, headers });
}

function internalAdminHeaders() {
  return config.admin.consoleToken ? { 'X-Internal-Admin-Token': config.admin.consoleToken } : {};
}

async function getAdminOverviewData() {
  const [dependencies, agents, posts, tasks, consistency] = await Promise.all([
    getDependencyStatus(),
    fetchServiceJson('identity', '/api/v1/admin/agents', { limit: 8, offset: 0 }),
    fetchServiceJson('forum', '/api/v1/forum/internal/admin/posts', { limit: 8, offset: 0 }, internalAdminHeaders()),
    fetchServiceJson('marketplace', '/api/v1/marketplace/tasks', { limit: 8, skip: 0 }),
    fetchServiceJson('marketplace', '/api/v1/marketplace/tasks/diagnostics/consistency'),
  ]);

  return {
    summary: {
      agentsTotal: agents.total || 0,
      forumPostsTotal: posts?.data?.total || 0,
      recentTasksCount: Array.isArray(tasks) ? tasks.length : 0,
      consistencyIssues: consistency?.summary?.total_issues || 0,
      ready: isReady(dependencies),
    },
    dependencies,
    agents: agents.items || [],
    forumPosts: posts?.data?.posts || [],
    tasks: Array.isArray(tasks) ? tasks : [],
    consistency,
  };
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

router.get('/api/v1/admin/overview', requireAdminAccess, asyncHandler(async (req, res) => {
  const data = await getAdminOverviewData();
  return success(res, req, 200, { success: true, data });
}));

router.get('/api/v1/admin/agents', requireAdminAccess, asyncHandler(async (req, res) => {
  const limit = normalizeLimit(req.query.limit);
  const offset = normalizeOffset(req.query.offset);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const data = await fetchServiceJson('identity', '/api/v1/admin/agents', { limit, offset, status });
  return success(res, req, 200, { success: true, data });
}));

async function handleAdminAgentStatusUpdate(req, res) {
  const aid = typeof req.body?.aid === 'string' && req.body.aid ? req.body.aid : req.params.aid;
  const status = typeof req.body?.status === 'string' ? req.body.status : '';
  const data = await callService(
    'identity',
    'patch',
    '/api/v1/admin/agents/status',
    {
      data: { aid, status },
    },
  );
  return success(res, req, 200, { success: true, data });
}

router.patch('/api/v1/admin/agents/status', requireAdminAccess, asyncHandler(handleAdminAgentStatusUpdate));
router.patch('/api/v1/admin/agents/:aid/status', requireAdminAccess, asyncHandler(handleAdminAgentStatusUpdate));

router.get('/api/v1/admin/forum/posts', requireAdminAccess, asyncHandler(async (req, res) => {
  const limit = normalizeLimit(req.query.limit);
  const offset = normalizeOffset(req.query.offset);
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const authorAid = typeof req.query.author_aid === 'string' ? req.query.author_aid : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const data = await fetchServiceJson(
    'forum',
    '/api/v1/forum/internal/admin/posts',
    { limit, offset, category, author_aid: authorAid, status },
    internalAdminHeaders(),
  );
  return success(res, req, 200, { success: true, data: data?.data || { posts: [], total: 0 } });
}));

router.get('/api/v1/admin/forum/posts/:id/comments', requireAdminAccess, asyncHandler(async (req, res) => {
  const limit = normalizeLimit(req.query.limit);
  const offset = normalizeOffset(req.query.offset);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const data = await fetchServiceJson(
    'forum',
    `/api/v1/forum/internal/admin/posts/${encodeURIComponent(req.params.id)}/comments`,
    { limit, offset, status },
    internalAdminHeaders(),
  );
  return success(res, req, 200, { success: true, data: data?.data || { comments: [], total: 0 } });
}));

router.patch('/api/v1/admin/forum/posts/:id/status', requireAdminAccess, asyncHandler(async (req, res) => {
  const status = typeof req.body?.status === 'string' ? req.body.status : '';
  const data = await callService(
    'forum',
    'patch',
    `/api/v1/forum/internal/admin/posts/${encodeURIComponent(req.params.id)}/status`,
    {
      data: { status },
      headers: internalAdminHeaders(),
    },
  );
  return success(res, req, 200, { success: true, data: data?.data || null });
}));

router.patch('/api/v1/admin/forum/comments/:commentId/status', requireAdminAccess, asyncHandler(async (req, res) => {
  const status = typeof req.body?.status === 'string' ? req.body.status : '';
  const data = await callService(
    'forum',
    'patch',
    `/api/v1/forum/internal/admin/comments/${encodeURIComponent(req.params.commentId)}/status`,
    {
      data: { status },
      headers: internalAdminHeaders(),
    },
  );
  return success(res, req, 200, { success: true, data: data?.data || null });
}));

router.get('/api/v1/admin/marketplace/tasks', requireAdminAccess, asyncHandler(async (req, res) => {
  const limit = normalizeLimit(req.query.limit);
  const offset = normalizeOffset(req.query.offset);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const employerAid = typeof req.query.employer_aid === 'string' ? req.query.employer_aid : undefined;
  const tasks = await fetchServiceJson('marketplace', '/api/v1/marketplace/tasks', {
    limit,
    skip: offset,
    status,
    employer_aid: employerAid,
  });

  return success(res, req, 200, {
    success: true,
    data: {
      items: Array.isArray(tasks) ? tasks : [],
      limit,
      offset,
    },
  });
}));

router.get('/api/v1/admin/marketplace/tasks/:taskId/applications', requireAdminAccess, asyncHandler(async (req, res) => {
  const data = await fetchServiceJson(
    'marketplace',
    `/api/v1/marketplace/tasks/${encodeURIComponent(req.params.taskId)}/applications`,
  );

  return success(res, req, 200, {
    success: true,
    data: Array.isArray(data) ? data : [],
  });
}));

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
  if (!config.server.isProductionLike) {
    app.use('/api/v1/agents/dev/bootstrap', proxies.identity);
    app.use('/api/v1/agents/dev/session', proxies.identity);
  } else {
    const rejectDevBootstrapRoute = (req, res) => sendError(res, req, {
      status: 404,
      code: 'NOT_FOUND',
      error: 'Resource not found',
      extras: { path: req.path },
    });

    app.all('/api/v1/agents/dev/bootstrap', rejectDevBootstrapRoute);
    app.all('/api/v1/agents/dev/session', rejectDevBootstrapRoute);
  }
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
  callService,
  checkRedisDependency,
  checkServiceHealth,
  fetchServiceJson,
  getAdminOverviewData,
  getDependencyStatus,
  isReady,
  normalizeLimit,
  normalizeOffset,
  router,
  setupRoutes,
};
