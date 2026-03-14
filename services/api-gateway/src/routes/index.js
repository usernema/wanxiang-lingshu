const express = require('express');
const axios = require('axios');
const config = require('../config');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { requireAdminAccess } = require('../middleware/admin');
const { createRouteProxies } = require('./proxy');
const { metricsHandler } = require('../middleware/metrics');
const { getRedisClient } = require('../utils/redis');
const { query } = require('../utils/postgres');
const { asyncHandler, createHttpError, sendError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

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

function normalizeQueryText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeBooleanQuery(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function normalizeBatchItems(items) {
  if (!Array.isArray(items)) return [];

  const unique = new Set();
  for (const item of items) {
    const normalized = typeof item === 'string' || typeof item === 'number' ? String(item).trim() : '';
    if (normalized) {
      unique.add(normalized);
    }
  }

  return Array.from(unique);
}

function normalizeTaskOpsQueue(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return ['legacy_assigned', 'submitted', 'anomaly', 'cancelled_settlement'].includes(normalized) ? normalized : '';
}

function normalizeTaskOpsDisposition(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return ['checked', 'follow_up'].includes(normalized) ? normalized : '';
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

async function invalidateGatewayAgentCache(aid) {
  if (!aid) return;
  const redis = await getRedisClient();
  await redis.del(`agent:${aid}`);
}

function buildAdminAuditDetails(req, details = {}) {
  return {
    source: 'admin_console',
    request_id: req.id,
    method: req.method,
    path: req.originalUrl,
    ...details,
  };
}

async function insertAdminAuditLog(entry) {
  const logId = entry.logId || `log_${uuidv4().replace(/-/g, '')}`;
  const payload = {
    logId,
    actorAid: entry.actorAid || null,
    action: entry.action,
    resourceType: entry.resourceType || null,
    resourceId: entry.resourceId || null,
    details: entry.details || {},
    ipAddress: entry.ipAddress || null,
    userAgent: entry.userAgent || null,
  };

  await query(
    `INSERT INTO audit_logs (log_id, actor_aid, action, resource_type, resource_id, details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [
      payload.logId,
      payload.actorAid,
      payload.action,
      payload.resourceType,
      payload.resourceId,
      JSON.stringify(payload.details),
      payload.ipAddress,
      payload.userAgent,
    ],
  );

  return payload.logId;
}

async function recordAdminAudit(req, entry) {
  try {
    await insertAdminAuditLog({
      ...entry,
      details: buildAdminAuditDetails(req, entry.details),
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    });
  } catch (error) {
    logger.error('Failed to persist admin audit log', {
      error: error.message,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      requestId: req.id,
    });
  }
}

async function listAdminAuditLogs(filters = {}) {
  const conditions = [];
  const params = [];

  const actorAid = normalizeQueryText(filters.actorAid);
  const action = normalizeQueryText(filters.action);
  const resourceType = normalizeQueryText(filters.resourceType);
  const resourceId = normalizeQueryText(filters.resourceId);
  const limit = normalizeLimit(filters.limit);
  const offset = normalizeOffset(filters.offset);

  if (actorAid) {
    params.push(actorAid);
    conditions.push(`actor_aid = $${params.length}`);
  }

  if (action) {
    params.push(`%${action}%`);
    conditions.push(`action ILIKE $${params.length}`);
  }

  if (resourceType) {
    params.push(resourceType);
    conditions.push(`resource_type = $${params.length}`);
  }

  if (resourceId) {
    params.push(`%${resourceId}%`);
    conditions.push(`resource_id ILIKE $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countParams = [...params];
  params.push(limit);
  params.push(offset);

  const [itemsResult, countResult] = await Promise.all([
    query(
      `SELECT log_id, actor_aid, action, resource_type, resource_id, details, ip_address::text AS ip_address, user_agent, created_at
       FROM audit_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
    query(`SELECT COUNT(*)::int AS total FROM audit_logs ${whereClause}`, countParams),
  ]);

  return {
    items: itemsResult.rows || [],
    total: countResult.rows?.[0]?.total || 0,
    limit,
    offset,
  };
}

async function listNotifications(aid, filters = {}) {
  const conditions = ['recipient_aid = $1'];
  const params = [aid];
  const limit = normalizeLimit(filters.limit);
  const offset = normalizeOffset(filters.offset);
  const unreadOnly = normalizeBooleanQuery(filters.unreadOnly);
  const type = normalizeQueryText(filters.type);
  const group = normalizeQueryText(filters.group);
  const notificationGroups = {
    wallet: ['credit_in', 'credit_out', 'escrow_created', 'escrow_released', 'escrow_refunded'],
    moderation: ['forum_post_moderated', 'forum_comment_moderated'],
    account: ['agent_status_changed'],
  };

  if (unreadOnly) {
    conditions.push('is_read = FALSE');
  }

  if (type) {
    params.push(type);
    conditions.push(`type = $${params.length}`);
  } else if (group && notificationGroups[group]) {
    params.push(notificationGroups[group]);
    conditions.push(`type = ANY($${params.length}::text[])`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const countParams = [...params];
  params.push(limit);
  params.push(offset);

  const [itemsResult, countResult, unreadResult] = await Promise.all([
    query(
      `SELECT notification_id, recipient_aid, type, title, content, link, is_read, metadata, created_at
       FROM notifications
       ${whereClause}
       ORDER BY is_read ASC, created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
    query(`SELECT COUNT(*)::int AS total FROM notifications ${whereClause}`, countParams),
    query(
      `SELECT COUNT(*)::int AS unread_count
       FROM notifications
       WHERE recipient_aid = $1 AND is_read = FALSE`,
      [aid],
    ),
  ]);

  return {
    items: itemsResult.rows || [],
    total: countResult.rows?.[0]?.total || 0,
    unread_count: unreadResult.rows?.[0]?.unread_count || 0,
    limit,
    offset,
  };
}

async function markNotificationAsRead(aid, notificationId) {
  const result = await query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE notification_id = $1 AND recipient_aid = $2
     RETURNING notification_id, recipient_aid, type, title, content, link, is_read, metadata, created_at`,
    [notificationId, aid],
  );

  if (!result.rows?.length) {
    throw createHttpError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
  }

  return result.rows[0];
}

async function markAllNotificationsAsRead(aid) {
  const result = await query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE recipient_aid = $1 AND is_read = FALSE`,
    [aid],
  );

  return {
    updated: result.rowCount || 0,
  };
}

async function executeBatch(items, handler) {
  return Promise.all(items.map(async (item) => {
    try {
      const data = await handler(item);
      return { item, success: true, data };
    } catch (error) {
      return {
        item,
        success: false,
        error: error.message || 'Batch item failed',
        code: error.code || 'BATCH_ITEM_FAILED',
        status: error.status || error.statusCode || 500,
      };
    }
  }));
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
router.get('/api/health/live', (req, res) => success(res, req, 200, { success: true, status: 'alive', uptime: process.uptime(), mode: config.server.appMode }));
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
router.get('/api/health/ready', asyncHandler(async (req, res) => {
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
router.get('/api/health', asyncHandler(async (req, res) => {
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
router.get('/api/health/deps', asyncHandler(async (req, res) => {
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

router.get('/api/v1/admin/audit-logs', requireAdminAccess, asyncHandler(async (req, res) => {
  const data = await listAdminAuditLogs({
    limit: req.query.limit,
    offset: req.query.offset,
    actorAid: req.query.actor_aid,
    action: req.query.action,
    resourceType: req.query.resource_type,
    resourceId: req.query.resource_id,
  });

  return success(res, req, 200, { success: true, data });
}));

router.get('/api/v1/admin/agents', requireAdminAccess, asyncHandler(async (req, res) => {
  const limit = normalizeLimit(req.query.limit);
  const offset = normalizeOffset(req.query.offset);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const data = await fetchServiceJson('identity', '/api/v1/admin/agents', { limit, offset, status });
  return success(res, req, 200, { success: true, data });
}));

router.get('/api/v1/admin/agent-growth/overview', requireAdminAccess, asyncHandler(async (req, res) => {
  const data = await fetchServiceJson('identity', '/api/v1/admin/agent-growth/overview');
  return success(res, req, 200, { success: true, data });
}));

router.get('/api/v1/admin/agent-growth/agents', requireAdminAccess, asyncHandler(async (req, res) => {
  const limit = normalizeLimit(req.query.limit);
  const offset = normalizeOffset(req.query.offset);
  const maturityPool = typeof req.query.maturity_pool === 'string' ? req.query.maturity_pool : undefined;
  const primaryDomain = typeof req.query.primary_domain === 'string' ? req.query.primary_domain : undefined;
  const data = await fetchServiceJson('identity', '/api/v1/admin/agent-growth/agents', {
    limit,
    offset,
    maturity_pool: maturityPool,
    primary_domain: primaryDomain,
  });
  return success(res, req, 200, { success: true, data });
}));

router.post('/api/v1/admin/agent-growth/agents/:aid/evaluate', requireAdminAccess, asyncHandler(async (req, res) => {
  const aid = req.params.aid;
  const data = await callService('identity', 'post', '/api/v1/admin/agent-growth/evaluate', {
    data: { aid },
  });
  await recordAdminAudit(req, {
    action: 'admin.agent.growth.evaluated',
    resourceType: 'agent_growth',
    resourceId: String(aid),
    details: { trigger: 'manual' },
  });
  return success(res, req, 200, { success: true, data });
}));

router.post('/api/v1/admin/agent-growth/evaluate', requireAdminAccess, asyncHandler(async (req, res) => {
  const aid = normalizeQueryText(req.body?.aid) || '';
  if (!aid) {
    throw createHttpError(400, 'INVALID_REQUEST', 'aid is required');
  }

  const data = await callService('identity', 'post', '/api/v1/admin/agent-growth/evaluate', {
    data: { aid },
  });
  await recordAdminAudit(req, {
    action: 'admin.agent.growth.evaluated',
    resourceType: 'agent_growth',
    resourceId: aid,
    details: { trigger: 'manual' },
  });
  return success(res, req, 200, { success: true, data });
}));

router.get('/api/v1/admin/agent-growth/skill-drafts', requireAdminAccess, asyncHandler(async (req, res) => {
  const limit = normalizeLimit(req.query.limit);
  const offset = normalizeOffset(req.query.offset);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const aid = typeof req.query.aid === 'string' ? req.query.aid : undefined;
  const data = await fetchServiceJson(
    'marketplace',
    '/api/v1/marketplace/internal/admin/agent-growth/skill-drafts',
    { limit, offset, status, aid },
    internalAdminHeaders(),
  );
  return success(res, req, 200, { success: true, data });
}));

router.get('/api/v1/admin/agent-growth/experience-cards', requireAdminAccess, asyncHandler(async (req, res) => {
  const limit = normalizeLimit(req.query.limit);
  const offset = normalizeOffset(req.query.offset);
  const aid = typeof req.query.aid === 'string' ? req.query.aid : undefined;
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const outcomeStatus = typeof req.query.outcome_status === 'string' ? req.query.outcome_status : undefined;
  const data = await fetchServiceJson(
    'marketplace',
    '/api/v1/marketplace/internal/admin/agent-growth/experience-cards',
    { limit, offset, aid, category, outcome_status: outcomeStatus },
    internalAdminHeaders(),
  );
  return success(res, req, 200, { success: true, data });
}));

router.get('/api/v1/admin/agent-growth/risk-memories', requireAdminAccess, asyncHandler(async (req, res) => {
  const limit = normalizeLimit(req.query.limit);
  const offset = normalizeOffset(req.query.offset);
  const aid = typeof req.query.aid === 'string' ? req.query.aid : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const riskType = typeof req.query.risk_type === 'string' ? req.query.risk_type : undefined;
  const data = await fetchServiceJson(
    'marketplace',
    '/api/v1/marketplace/internal/admin/agent-growth/risk-memories',
    { limit, offset, aid, status, risk_type: riskType },
    internalAdminHeaders(),
  );
  return success(res, req, 200, { success: true, data });
}));

router.get('/api/v1/admin/dojo/overview', requireAdminAccess, asyncHandler(async (req, res) => {
  const data = await fetchServiceJson('identity', '/api/v1/admin/dojo/overview');
  return success(res, req, 200, { success: true, data });
}));

router.get('/api/v1/admin/dojo/coaches', requireAdminAccess, asyncHandler(async (req, res) => {
  const limit = normalizeLimit(req.query.limit);
  const offset = normalizeOffset(req.query.offset);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const data = await fetchServiceJson('identity', '/api/v1/admin/dojo/coaches', {
    limit,
    offset,
    status,
  });
  return success(res, req, 200, { success: true, data });
}));

router.post('/api/v1/admin/dojo/agents/:aid/assign-coach', requireAdminAccess, asyncHandler(async (req, res) => {
  const aid = req.params.aid;
  const data = await callService('identity', 'post', `/api/v1/admin/dojo/agents/${encodeURIComponent(aid)}/assign-coach`, {
    data: {
      primary_coach_aid: normalizeQueryText(req.body?.primary_coach_aid) || '',
      shadow_coach_aid: normalizeQueryText(req.body?.shadow_coach_aid) || '',
      school_key: normalizeQueryText(req.body?.school_key) || '',
      stage: normalizeQueryText(req.body?.stage) || '',
    },
  });
  await recordAdminAudit(req, {
    action: 'admin.dojo.coach.assigned',
    resourceType: 'agent_dojo_binding',
    resourceId: String(aid),
    details: {
      primary_coach_aid: normalizeQueryText(req.body?.primary_coach_aid) || 'official://dojo/general-coach',
      school_key: normalizeQueryText(req.body?.school_key) || '',
      stage: normalizeQueryText(req.body?.stage) || 'diagnostic',
    },
  });
  return success(res, req, 200, { success: true, data });
}));

router.patch('/api/v1/admin/agent-growth/skill-drafts/:draftId', requireAdminAccess, asyncHandler(async (req, res) => {
  const status = normalizeQueryText(req.body?.status) || '';
  const reviewNotes = typeof req.body?.review_notes === 'string' ? req.body.review_notes : undefined;
  const data = await callService(
    'marketplace',
    'patch',
    `/api/v1/marketplace/internal/admin/agent-growth/skill-drafts/${encodeURIComponent(req.params.draftId)}`,
    {
      data: { status, review_notes: reviewNotes },
      headers: internalAdminHeaders(),
    },
  );
  await recordAdminAudit(req, {
    action: 'admin.agent.growth.skill_draft.updated',
    resourceType: 'agent_growth_skill_draft',
    resourceId: String(req.params.draftId),
    details: { status },
  });
  return success(res, req, 200, { success: true, data });
}));

router.get('/api/v1/admin/employer-templates', requireAdminAccess, asyncHandler(async (req, res) => {
  const limit = normalizeLimit(req.query.limit);
  const offset = normalizeOffset(req.query.offset);
  const ownerAid = typeof req.query.owner_aid === 'string' ? req.query.owner_aid : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const data = await fetchServiceJson(
    'marketplace',
    '/api/v1/marketplace/internal/admin/employer-templates',
    { limit, offset, owner_aid: ownerAid, status },
    internalAdminHeaders(),
  );
  return success(res, req, 200, { success: true, data });
}));

router.get('/api/v1/admin/employer-skill-grants', requireAdminAccess, asyncHandler(async (req, res) => {
  const limit = normalizeLimit(req.query.limit);
  const offset = normalizeOffset(req.query.offset);
  const ownerAid = typeof req.query.owner_aid === 'string' ? req.query.owner_aid : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const data = await fetchServiceJson(
    'marketplace',
    '/api/v1/marketplace/internal/admin/employer-skill-grants',
    { limit, offset, owner_aid: ownerAid, status },
    internalAdminHeaders(),
  );
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
  await invalidateGatewayAgentCache(aid);
  await recordAdminAudit(req, {
    action: 'admin.agent.status.updated',
    resourceType: 'agent',
    resourceId: aid,
    details: { status, batch: false },
  });
  return success(res, req, 200, { success: true, data });
}

router.patch('/api/v1/admin/agents/status/batch', requireAdminAccess, asyncHandler(async (req, res) => {
  const aids = normalizeBatchItems(req.body?.aids);
  const status = normalizeQueryText(req.body?.status) || '';

  if (!aids.length) {
    throw createHttpError(400, 'INVALID_BATCH_INPUT', 'aids is required');
  }
  if (aids.length > config.admin.maxBatchSize) {
    throw createHttpError(400, 'BATCH_LIMIT_EXCEEDED', `aids cannot exceed ${config.admin.maxBatchSize} items`);
  }

  const items = await executeBatch(aids, async (aid) => {
    const data = await callService('identity', 'patch', '/api/v1/admin/agents/status', {
      data: { aid, status },
    });
    await invalidateGatewayAgentCache(aid);
    await recordAdminAudit(req, {
      action: 'admin.agent.status.updated',
      resourceType: 'agent',
      resourceId: aid,
      details: { status, batch: true, total_items: aids.length },
    });
    return data;
  });

  return success(res, req, 200, {
    success: true,
    data: {
      items,
      summary: {
        total: items.length,
        succeeded: items.filter((item) => item.success).length,
        failed: items.filter((item) => !item.success).length,
      },
    },
  });
}));

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
  await recordAdminAudit(req, {
    action: 'admin.forum.post.status.updated',
    resourceType: 'forum_post',
    resourceId: String(req.params.id),
    details: { status, batch: false },
  });
  return success(res, req, 200, { success: true, data: data?.data || null });
}));

router.patch('/api/v1/admin/forum/posts/status/batch', requireAdminAccess, asyncHandler(async (req, res) => {
  const ids = normalizeBatchItems(req.body?.ids);
  const status = normalizeQueryText(req.body?.status) || '';

  if (!ids.length) {
    throw createHttpError(400, 'INVALID_BATCH_INPUT', 'ids is required');
  }
  if (ids.length > config.admin.maxBatchSize) {
    throw createHttpError(400, 'BATCH_LIMIT_EXCEEDED', `ids cannot exceed ${config.admin.maxBatchSize} items`);
  }

  const items = await executeBatch(ids, async (id) => {
    const data = await callService(
      'forum',
      'patch',
      `/api/v1/forum/internal/admin/posts/${encodeURIComponent(id)}/status`,
      {
        data: { status },
        headers: internalAdminHeaders(),
      },
    );
    await recordAdminAudit(req, {
      action: 'admin.forum.post.status.updated',
      resourceType: 'forum_post',
      resourceId: id,
      details: { status, batch: true, total_items: ids.length },
    });
    return data?.data || null;
  });

  return success(res, req, 200, {
    success: true,
    data: {
      items,
      summary: {
        total: items.length,
        succeeded: items.filter((item) => item.success).length,
        failed: items.filter((item) => !item.success).length,
      },
    },
  });
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
  await recordAdminAudit(req, {
    action: 'admin.forum.comment.status.updated',
    resourceType: 'forum_comment',
    resourceId: String(req.params.commentId),
    details: { status, batch: false, post_id: data?.data?.post_id || null },
  });
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
    {},
    internalAdminHeaders(),
  );

  return success(res, req, 200, {
    success: true,
    data: Array.isArray(data) ? data : [],
  });
}));

router.post('/api/v1/admin/marketplace/tasks/normalize-legacy-assigned', requireAdminAccess, asyncHandler(async (req, res) => {
  const data = await callService(
    'marketplace',
    'post',
    '/api/v1/marketplace/internal/admin/tasks/normalize-legacy-assigned',
    {
      headers: internalAdminHeaders(),
    },
  );

  await recordAdminAudit(req, {
    action: 'admin.marketplace.tasks.legacy_assigned.normalized',
    resourceType: 'marketplace_task',
    resourceId: 'legacy-assigned',
    details: {
      legacy_assigned_count: data?.legacy_assigned_count || 0,
      normalized_count: data?.normalized_count || 0,
      skipped_count: data?.skipped_count || 0,
      normalized_task_ids: Array.isArray(data?.normalized_task_ids) ? data.normalized_task_ids : [],
      skipped_task_ids: Array.isArray(data?.skipped_task_ids) ? data.skipped_task_ids : [],
    },
  });

  return success(res, req, 200, { success: true, data: data || null });
}));

router.post('/api/v1/admin/marketplace/tasks/:taskId/ops-record', requireAdminAccess, asyncHandler(async (req, res) => {
  const queue = normalizeTaskOpsQueue(req.body?.queue);
  const disposition = normalizeTaskOpsDisposition(req.body?.disposition);
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  const issue = typeof req.body?.issue === 'string' ? req.body.issue.trim() : '';
  const taskStatus = typeof req.body?.task_status === 'string' ? req.body.task_status.trim() : '';

  if (!queue) {
    throw createHttpError(400, 'queue is required', 'VALIDATION_ERROR');
  }

  if (!disposition) {
    throw createHttpError(400, 'disposition is required', 'VALIDATION_ERROR');
  }

  await recordAdminAudit(req, {
    action: 'admin.marketplace.task.ops.recorded',
    resourceType: 'marketplace_task',
    resourceId: String(req.params.taskId),
    details: {
      queue,
      disposition,
      note: note || null,
      issue: issue || null,
      task_status: taskStatus || null,
    },
  });

  return success(res, req, 200, {
    success: true,
    data: {
      task_id: String(req.params.taskId),
      queue,
      disposition,
      note: note || null,
      issue: issue || null,
      task_status: taskStatus || null,
    },
  });
}));

router.get('/api/v1/notifications', authenticate, asyncHandler(async (req, res) => {
  const data = await listNotifications(req.agent.aid, {
    limit: req.query.limit,
    offset: req.query.offset,
    unreadOnly: req.query.unread_only,
    type: req.query.type,
    group: req.query.group,
  });

  return success(res, req, 200, { success: true, data });
}));

router.post('/api/v1/notifications/read-all', authenticate, asyncHandler(async (req, res) => {
  const data = await markAllNotificationsAsRead(req.agent.aid);
  return success(res, req, 200, { success: true, data });
}));

router.post('/api/v1/notifications/:notificationId/read', authenticate, asyncHandler(async (req, res) => {
  const data = await markNotificationAsRead(req.agent.aid, req.params.notificationId);
  return success(res, req, 200, { success: true, data });
}));

function setupRoutes(app, middleware = {}) {
  const proxies = createRouteProxies();
  const {
    defaultLimiter,
    authLimiter,
    authBurstLimiter,
    publicReadLimiter,
    writeLimiter,
    authenticatedIpLimiter,
  } = middleware;
  const authGuards = [
    ...(authBurstLimiter ? [authBurstLimiter] : []),
    ...(authLimiter ? [authLimiter] : []),
  ];
  const authenticatedIpGuards = authenticatedIpLimiter ? [authenticatedIpLimiter] : [];

  app.use('/api/v1/agents/register', ...authGuards, proxies.identity);
  app.use('/api/v1/agents/email/register/request-code', ...authGuards, proxies.identity);
  app.use('/api/v1/agents/email/register/complete', ...authGuards, proxies.identity);
  app.use('/api/v1/agents/email/login/request-code', ...authGuards, proxies.identity);
  app.use('/api/v1/agents/email/login/complete', ...authGuards, proxies.identity);
  app.use('/api/v1/agents/challenge', ...authGuards, proxies.identity);
  app.use('/api/v1/agents/login', ...authGuards, proxies.identity);
  app.use('/api/v1/agents/verify', ...authGuards, proxies.identity);
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
  app.use('/api/v1/agents', authenticate, ...authenticatedIpGuards, ...(defaultLimiter ? [defaultLimiter] : []), proxies.identity);
  app.use('/api/v1/dojo', authenticate, ...authenticatedIpGuards, ...(defaultLimiter ? [defaultLimiter] : []), proxies.identity);

  app.get('/api/v1/forum/posts*', optionalAuthenticate, ...(publicReadLimiter ? [publicReadLimiter] : []), proxies.forum);
  app.use('/api/v1/forum', authenticate, ...authenticatedIpGuards, ...(writeLimiter ? [writeLimiter] : []), proxies.forum);

  app.use('/api/v1/credits', authenticate, ...authenticatedIpGuards, ...(writeLimiter ? [writeLimiter] : []), proxies.credit);

  app.get('/api/v1/marketplace/skills*', optionalAuthenticate, ...(publicReadLimiter ? [publicReadLimiter] : []), proxies.marketplace);
  app.get('/api/v1/marketplace/tasks/:taskId/applications', authenticate, ...authenticatedIpGuards, ...(defaultLimiter ? [defaultLimiter] : []), proxies.marketplace);
  app.get('/api/v1/marketplace/tasks*', optionalAuthenticate, ...(publicReadLimiter ? [publicReadLimiter] : []), proxies.marketplace);
  app.use('/api/v1/marketplace', authenticate, ...authenticatedIpGuards, ...(writeLimiter ? [writeLimiter] : []), proxies.marketplace);

  app.get('/api/v1/training/challenges*', optionalAuthenticate, ...(publicReadLimiter ? [publicReadLimiter] : []), proxies.training);
  app.use('/api/v1/training', authenticate, ...authenticatedIpGuards, ...(writeLimiter ? [writeLimiter] : []), proxies.training);

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
  insertAdminAuditLog,
  isReady,
  listAdminAuditLogs,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  normalizeLimit,
  normalizeBooleanQuery,
  normalizeOffset,
  normalizeBatchItems,
  normalizeQueryText,
  recordAdminAudit,
  router,
  setupRoutes,
};
