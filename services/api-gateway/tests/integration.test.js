const request = require('supertest');
const express = require('express');
const cors = require('cors');

jest.mock('axios', () => ({
  request: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
}));

jest.mock('../src/utils/redis', () => ({
  createRedisClient: jest.fn().mockResolvedValue({
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn().mockResolvedValue(null),
    setEx: jest.fn().mockResolvedValue('OK'),
    sendCommand: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn().mockResolvedValue('OK'),
  }),
  closeRedisClient: jest.fn().mockResolvedValue(),
  getRedisClient: jest.fn().mockResolvedValue({
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn().mockResolvedValue(null),
    setEx: jest.fn().mockResolvedValue('OK'),
    sendCommand: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn().mockResolvedValue('OK'),
  }),
}));

jest.mock('../src/routes/proxy', () => ({
  createRouteProxies: jest.fn(() => ({
    identity: (req, res) => res.status(502).json({ success: false, code: 'UPSTREAM_UNAVAILABLE', service: 'identity', requestId: req.id }),
    forum: (req, res) => res.status(502).json({ success: false, code: 'UPSTREAM_UNAVAILABLE', service: 'forum', requestId: req.id }),
    credit: (req, res) => res.status(502).json({ success: false, code: 'UPSTREAM_UNAVAILABLE', service: 'credit', requestId: req.id }),
    marketplace: (req, res) => res.status(502).json({ success: false, code: 'UPSTREAM_UNAVAILABLE', service: 'marketplace', requestId: req.id }),
    training: (req, res) => res.status(502).json({ success: false, code: 'UPSTREAM_UNAVAILABLE', service: 'training', requestId: req.id }),
    ranking: (req, res) => res.status(502).json({ success: false, code: 'UPSTREAM_UNAVAILABLE', service: 'ranking', requestId: req.id }),
  })),
}));

jest.mock('../src/middleware/metrics', () => ({
  metricsMiddleware: (req, res, next) => next(),
  metricsHandler: (req, res) => res.status(200).send('http_requests_total 1\nhttp_request_duration_seconds 1\nactive_connections 1'),
  metrics: {
    authFailuresTotal: { inc: jest.fn() },
    rateLimitExceeded: { inc: jest.fn() },
  },
}));

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../src/utils/postgres', () => ({
  query: jest.fn(),
  closePostgresPool: jest.fn().mockResolvedValue(),
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(() => {
    throw new Error('invalid token');
  }),
}));

const axios = require('axios');
const config = require('../src/config');
const { router, setupRoutes } = require('../src/routes');
const requestId = require('../src/middleware/requestId');
const { authenticate } = require('../src/middleware/auth');
const { notFoundHandler, errorHandler } = require('../src/middleware/errorHandler');
const { buildCorsOptions, bodyLimitForRequest } = require('../src/index');
const { getRedisClient } = require('../src/utils/redis');
const { query } = require('../src/utils/postgres');

function jsonBodyParser() {
  return (req, res, next) => express.json({ limit: bodyLimitForRequest(req) })(req, res, next);
}

function urlencodedBodyParser() {
  return (req, res, next) => express.urlencoded({ extended: true, limit: bodyLimitForRequest(req) })(req, res, next);
}

function createTaggedLimiter(profile) {
  return (req, res, next) => {
    res.setHeader(`X-Limiter-${profile}`, 'true');
    next();
  };
}

function createTestApp() {
  const app = express();
  app.use(requestId);
  app.use((req, res, next) => {
    res.vary('Origin');
    next();
  });
  app.use(cors(buildCorsOptions()));
  app.use(jsonBodyParser());
  app.use(urlencodedBodyParser());
  app.use(router);
  setupRoutes(app, {
    defaultLimiter: createTaggedLimiter('default'),
    authLimiter: createTaggedLimiter('auth'),
    publicReadLimiter: createTaggedLimiter('public-read'),
    writeLimiter: createTaggedLimiter('write'),
  });

  app.post('/echo', (req, res) => res.json({ success: true, body: req.body, requestId: req.id }));
  app.post('/api/v1/agents/echo', (req, res) => res.json({ success: true, body: req.body, requestId: req.id }));
  app.post('/api/v1/forum/echo', (req, res) => res.json({ success: true, body: req.body, requestId: req.id }));
  app.post('/api/v1/marketplace/echo', (req, res) => res.json({ success: true, body: req.body, requestId: req.id }));

  app.get('/boom', (req, res, next) => next(new Error('kaboom')));
  app.get('/forbidden', (req, res, next) => {
    const err = new Error('forbidden');
    err.name = 'ForbiddenError';
    next(err);
  });
  app.get('/validation', (req, res, next) => {
    const err = new Error('bad input');
    err.name = 'ValidationError';
    next(err);
  });
  app.get('/limit-hit', (req, res) => {
    const limiter = createTaggedLimiter('simulated');
    limiter(req, res, () => {
      res.status(429).json({ success: false, code: 'RATE_LIMIT_EXCEEDED', requestId: req.id, profile: 'simulated' });
    });
  });
  app.options('/preflight', (req, res) => res.sendStatus(204));

  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/v1')) return next();
    return res.status(200).json({ success: true, path: req.path, requestId: req.id });
  });

  app.use((err, req, res, next) => {
    if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large' || err.code === 'CORS_ORIGIN_DENIED')) {
      return errorHandler(err, req, res, next);
    }
    return next(err);
  });
  app.use((err, req, res, next) => errorHandler(err, req, res, next));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

describe('API Gateway Integration Tests', () => {
  let app;
  const originalAdminEnabled = config.admin.enabled;
  const originalAdminToken = config.admin.consoleToken;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createTestApp();
    getRedisClient.mockResolvedValue({
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn().mockResolvedValue(null),
      setEx: jest.fn().mockResolvedValue('OK'),
      sendCommand: jest.fn().mockResolvedValue('OK'),
      quit: jest.fn().mockResolvedValue('OK'),
    });
    axios.get.mockImplementation((url) => Promise.resolve({ status: 200, data: { success: true, url } }));
    axios.request.mockResolvedValue({ data: { success: true, data: {} } });
    query.mockResolvedValue({ rows: [], rowCount: 1 });
    config.admin.enabled = originalAdminEnabled;
    config.admin.consoleToken = originalAdminToken;
  });

  afterAll(() => {
    config.admin.enabled = originalAdminEnabled;
    config.admin.consoleToken = originalAdminToken;
  });

  it('returns healthy dependency status from health endpoint', async () => {
    const response = await request(app).get('/health').expect(200);
    expect(response.body).toMatchObject({ success: true, status: 'healthy' });
    expect(response.body).toHaveProperty('requestId');
    expect(response.body.dependencies.redis.ok).toBe(true);
  });

  it('returns ready false when redis is unavailable', async () => {
    getRedisClient.mockResolvedValue({ ping: jest.fn().mockRejectedValue(new Error('redis down')) });
    const degradedApp = createTestApp();
    const response = await request(degradedApp).get('/ready').expect(503);
    expect(response.body).toMatchObject({ success: false, code: 'SERVICE_UNREADY' });
    expect(response.body.dependencies.redis.ok).toBe(false);
  });

  it('returns dependency details from health deps endpoint', async () => {
    const response = await request(app).get('/health/deps').expect(200);
    expect(response.body.dependencies.required.length).toBeGreaterThan(0);
    expect(Array.isArray(response.body.dependencies.optional)).toBe(true);
  });

  it('returns success from health ready endpoint when dependencies are healthy', async () => {
    const response = await request(app).get('/health/ready').expect(200);
    expect(response.body).toMatchObject({ success: true, status: 'ready' });
  });

  it('returns alias health endpoints under /api', async () => {
    const health = await request(app).get('/api/health').expect(200);
    expect(health.body).toMatchObject({ success: true, status: 'healthy' });

    const ready = await request(app).get('/api/health/ready').expect(200);
    expect(ready.body).toMatchObject({ success: true, status: 'ready' });
  });

  it('returns degraded status from readyz when redis is unavailable', async () => {
    getRedisClient.mockResolvedValue({ ping: jest.fn().mockRejectedValue(new Error('redis down')) });
    const degradedApp = createTestApp();
    const response = await request(degradedApp).get('/readyz').expect(503);
    expect(response.body).toMatchObject({ success: false, status: 'degraded' });
  });

  it('returns degraded status from health deps when redis is unavailable', async () => {
    getRedisClient.mockResolvedValue({ ping: jest.fn().mockRejectedValue(new Error('redis down')) });
    const degradedApp = createTestApp();
    const response = await request(degradedApp).get('/health/deps').expect(503);
    expect(response.body).toMatchObject({ success: false, status: 'degraded' });
  });

  it('returns degraded status from health when redis is unavailable', async () => {
    getRedisClient.mockResolvedValue({ ping: jest.fn().mockRejectedValue(new Error('redis down')) });
    const degradedApp = createTestApp();
    const response = await request(degradedApp).get('/health').expect(503);
    expect(response.body).toMatchObject({ success: false, status: 'degraded' });
  });

  it('returns live, livez, health/live, ready, readyz and metrics successfully', async () => {
    await request(app).get('/live').expect(200);
    await request(app).get('/livez').expect(200);
    await request(app).get('/health/live').expect(200);
    await request(app).get('/ready').expect(200);
    await request(app).get('/readyz').expect(200);
    const metricsResponse = await request(app).get('/metrics').expect(200);
    expect(metricsResponse.text).toContain('http_requests_total');
  });

  it('returns API version info', async () => {
    const response = await request(app).get('/api/v1').expect(200);
    expect(response.body).toMatchObject({ success: true, version: '1.0.0' });
    expect(response.body.services).toHaveProperty('identity');
    expect(response.body.services).toHaveProperty('marketplace');
  });

  it('returns fallback api handler for generic api paths', async () => {
    const response = await request(app).get('/api/v1/somewhere').expect(200);
    expect(response.body).toMatchObject({ success: true, path: '/api/v1/somewhere' });
  });

  it('applies auth limiter to auth routes', async () => {
    const response = await request(app).post('/api/v1/agents/login').expect(502);
    expect(response.headers['x-limiter-auth']).toBe('true');
  });

  it('exposes email auth routes without agent authentication', async () => {
    const response = await request(app)
      .post('/api/v1/agents/email/login/request-code')
      .send({ email: 'owner@example.com' })
      .expect(502);

    expect(response.headers['x-limiter-auth']).toBe('true');
    expect(response.body.service).toBe('identity');
  });

  it('rejects admin routes without a token', async () => {
    config.admin.enabled = true;
    config.admin.consoleToken = 'secret-admin-token';

    const response = await request(app).get('/api/v1/admin/forum/posts').expect(401);

    expect(response.body.code).toBe('ADMIN_TOKEN_REQUIRED');
  });

  it('returns admin overview with a valid token', async () => {
    config.admin.enabled = true;
    config.admin.consoleToken = 'secret-admin-token';
    axios.request
      .mockResolvedValueOnce({ data: { items: [{ aid: 'agent://a2ahub/system' }], total: 1 } })
      .mockResolvedValueOnce({ data: { success: true, data: { posts: [{ id: '1', title: '审核帖' }], total: 1 } } })
      .mockResolvedValueOnce({ data: [{ task_id: 'task-1', title: '任务' }] })
      .mockResolvedValueOnce({ data: { summary: { total_issues: 0 } } });

    const response = await request(app)
      .get('/api/v1/admin/overview')
      .set('X-Admin-Token', 'secret-admin-token')
      .expect(200);

    expect(response.body.data.summary.agentsTotal).toBe(1);
    expect(response.body.data.summary.forumPostsTotal).toBe(1);
    expect(response.body.data.summary.recentTasksCount).toBe(1);
  });

  it('returns admin forum posts and comments with a valid token', async () => {
    config.admin.enabled = true;
    config.admin.consoleToken = 'secret-admin-token';
    axios.request
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            posts: [{ id: '1', post_id: 'post-1', title: '审核帖', status: 'published' }],
            total: 1,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            comments: [{ id: 'c1', comment_id: 'comment-1', content: '评论', status: 'published', post_id: 'post-1', author_aid: 'agent://a2ahub/user-1' }],
            total: 1,
          },
        },
      });

    const postsResponse = await request(app)
      .get('/api/v1/admin/forum/posts')
      .set('X-Admin-Token', 'secret-admin-token')
      .expect(200);

    const commentsResponse = await request(app)
      .get('/api/v1/admin/forum/posts/post-1/comments')
      .set('X-Admin-Token', 'secret-admin-token')
      .expect(200);

    expect(postsResponse.body.data.posts).toHaveLength(1);
    expect(commentsResponse.body.data.comments).toHaveLength(1);
  });

  it('updates agent status through admin routes', async () => {
    config.admin.enabled = true;
    config.admin.consoleToken = 'secret-admin-token';
    axios.request.mockResolvedValueOnce({
      data: {
        aid: 'agent://a2ahub/worker-1',
        status: 'suspended',
      },
    });

    const response = await request(app)
      .patch('/api/v1/admin/agents/status')
      .set('X-Admin-Token', 'secret-admin-token')
      .send({ aid: 'agent://a2ahub/worker-1', status: 'suspended' })
      .expect(200);

    expect(response.body.data.status).toBe('suspended');
    expect(axios.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'patch',
      url: expect.stringContaining('/api/v1/admin/agents/status'),
      data: { aid: 'agent://a2ahub/worker-1', status: 'suspended' },
    }));
    expect(query).toHaveBeenCalled();
  });

  it('updates forum moderation status through admin routes', async () => {
    config.admin.enabled = true;
    config.admin.consoleToken = 'secret-admin-token';
    axios.request
      .mockResolvedValueOnce({ data: { success: true, data: { id: '1', status: 'hidden' } } })
      .mockResolvedValueOnce({ data: { success: true, data: { id: 'c1', status: 'deleted' } } });

    const postResponse = await request(app)
      .patch('/api/v1/admin/forum/posts/post-1/status')
      .set('X-Admin-Token', 'secret-admin-token')
      .send({ status: 'hidden' })
      .expect(200);

    const commentResponse = await request(app)
      .patch('/api/v1/admin/forum/comments/comment-1/status')
      .set('X-Admin-Token', 'secret-admin-token')
      .send({ status: 'deleted' })
      .expect(200);

    expect(postResponse.body.data.status).toBe('hidden');
    expect(commentResponse.body.data.status).toBe('deleted');
  });

  it('returns marketplace task applications through admin routes', async () => {
    config.admin.enabled = true;
    config.admin.consoleToken = 'secret-admin-token';
    axios.request.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          task_id: 'task-1',
          applicant_aid: 'agent://a2ahub/worker-1',
          proposal: '我可以处理这个任务',
          status: 'pending',
          created_at: '2026-03-12T00:00:00.000Z',
        },
      ],
    });

    const response = await request(app)
      .get('/api/v1/admin/marketplace/tasks/task-1/applications')
      .set('X-Admin-Token', 'secret-admin-token')
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].applicant_aid).toBe('agent://a2ahub/worker-1');
  });

  it('returns admin audit logs from persistence layer', async () => {
    config.admin.enabled = true;
    config.admin.consoleToken = 'secret-admin-token';
    query
      .mockResolvedValueOnce({
        rows: [{
          log_id: 'log_1',
          actor_aid: null,
          action: 'admin.agent.status.updated',
          resource_type: 'agent',
          resource_id: 'agent://a2ahub/worker-1',
          details: { status: 'suspended' },
          ip_address: '127.0.0.1',
          user_agent: 'jest',
          created_at: '2026-03-12T00:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const response = await request(app)
      .get('/api/v1/admin/audit-logs?resource_type=agent')
      .set('X-Admin-Token', 'secret-admin-token')
      .expect(200);

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.total).toBe(1);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('updates agent status in batch through admin routes', async () => {
    config.admin.enabled = true;
    config.admin.consoleToken = 'secret-admin-token';
    axios.request
      .mockResolvedValueOnce({ data: { aid: 'agent://a2ahub/worker-1', status: 'suspended' } })
      .mockResolvedValueOnce({ data: { aid: 'agent://a2ahub/worker-2', status: 'suspended' } });

    const response = await request(app)
      .patch('/api/v1/admin/agents/status/batch')
      .set('X-Admin-Token', 'secret-admin-token')
      .send({ aids: ['agent://a2ahub/worker-1', 'agent://a2ahub/worker-2'], status: 'suspended' })
      .expect(200);

    expect(response.body.data.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('applies public-read limiter to public get routes', async () => {
    const response = await request(app).get('/api/v1/marketplace/skills').expect(502);
    expect(response.headers['x-limiter-public-read']).toBe('true');
  });

  it('applies write limiter to protected write routes after auth', async () => {
    const authApp = express();
    authApp.use(requestId);
    authApp.post('/protected', (req, res, next) => {
      req.agent = { aid: 'agent-1', status: 'active' };
      next();
    }, createTaggedLimiter('write'), (req, res) => res.json({ success: true }));
    authApp.use(errorHandler);

    const response = await request(authApp).post('/protected').expect(200);
    expect(response.headers['x-limiter-write']).toBe('true');
  });

  it('allows configured origin and handles preflight', async () => {
    const response = await request(app)
      .get('/api/v1')
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers.vary).toContain('Origin');

    await request(app)
      .options('/preflight')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
  });

  it('rejects disallowed origin with unified error shape', async () => {
    const response = await request(app)
      .get('/api/v1')
      .set('Origin', 'https://evil.example.com')
      .expect(403);

    expect(response.body).toMatchObject({ success: false, code: 'CORS_ORIGIN_DENIED', error: 'Origin not allowed' });
    expect(response.body).toHaveProperty('requestId');
  });

  it('preserves or regenerates request and trace ids', async () => {
    const validRequestId = await request(app).get('/api/v1').set('X-Request-Id', 'valid-request-1234').expect(200);
    expect(validRequestId.body.requestId).toBe('valid-request-1234');
    expect(validRequestId.headers['x-request-id']).toBe('valid-request-1234');

    const invalidRequestId = await request(app).get('/api/v1').set('X-Request-Id', 'bad id').expect(200);
    expect(invalidRequestId.body.requestId).not.toBe('bad id');

    const validTraceId = await request(app).get('/api/v1').set('X-Trace-Id', 'trace-valid-1234').expect(200);
    expect(validTraceId.headers['x-trace-id']).toBe('trace-valid-1234');

    const invalidTraceId = await request(app).get('/api/v1').set('X-Trace-Id', 'bad trace id').expect(200);
    expect(invalidTraceId.headers['x-trace-id']).toBe(invalidTraceId.headers['x-request-id']);
  });

  it('normalizes generic internal, forbidden, and validation errors', async () => {
    const boom = await request(app).get('/boom').expect(500);
    expect(boom.body.code).toBe('INTERNAL_ERROR');

    const forbidden = await request(app).get('/forbidden').expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const validation = await request(app).get('/validation').expect(400);
    expect(validation.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns simulated limiter error shape', async () => {
    const response = await request(app).get('/limit-hit').expect(429);
    expect(response.body).toMatchObject({ success: false, code: 'RATE_LIMIT_EXCEEDED' });
  });

  it('returns malformed json error with request id', async () => {
    const response = await request(app)
      .post('/api/v1/agents/echo')
      .set('Content-Type', 'application/json')
      .send('{bad-json')
      .expect(400);

    expect(response.body).toMatchObject({ success: false, code: 'MALFORMED_JSON', error: 'Malformed JSON request body' });
    expect(response.body).toHaveProperty('requestId');
  });

  it('returns payload too large when body exceeds route limit', async () => {
    const largeBody = 'a'.repeat(600 * 1024);
    const response = await request(app)
      .post('/api/v1/agents/echo')
      .set('Content-Type', 'application/json')
      .send({ payload: largeBody })
      .expect(413);

    expect(response.body).toMatchObject({ success: false, code: 'PAYLOAD_TOO_LARGE', error: 'Request body too large' });
  });

  it('returns missing auth for protected routes before proxying', async () => {
    await request(app).post('/api/v1/forum').expect(401);
    await request(app).post('/api/v1/marketplace').expect(401);
    await request(app).post('/api/v1/credits').expect(401);
    await request(app).post('/api/v1/agents').expect(401);
    await request(app).post('/api/v1/training').expect(401);
  });

  it('rejects invalid bearer, malformed agent, and unsupported auth types on protected routes', async () => {
    const authApp = express();
    authApp.use(express.json());
    authApp.use(requestId);
    authApp.post('/protected', authenticate, (req, res) => res.json({ ok: true }));
    authApp.use(errorHandler);

    const invalidBearer = await request(authApp).post('/protected').set('Authorization', 'Bearer invalid-token').send({ foo: 'bar' }).expect(401);
    expect(invalidBearer.body.code).toBe('INVALID_TOKEN');

    const malformedAgent = await request(authApp).post('/protected').set('Authorization', 'Agent aid="bad"').send({ foo: 'bar' }).expect(401);
    expect(malformedAgent.body.code).toBe('INVALID_AUTH_HEADER');

    const unsupported = await request(authApp).post('/protected').set('Authorization', 'Basic abc').send({ foo: 'bar' }).expect(401);
    expect(unsupported.body.code).toBe('UNSUPPORTED_AUTH_TYPE');
  });

  it('returns proxy response with request id on public and bootstrap routes', async () => {
    const bootstrap = await request(app).post('/api/v1/agents/dev/bootstrap').expect(502);
    expect(bootstrap.body).toHaveProperty('requestId');

    const marketplace = await request(app).get('/api/v1/marketplace/skills').expect(502);
    expect(marketplace.body.service).toBe('marketplace');

    const rankings = await request(app).get('/api/v1/rankings').expect(502);
    expect(rankings.body.service).toBe('ranking');

    const training = await request(app).get('/api/v1/training/challenges').expect(502);
    expect(training.body.service).toBe('training');

    const identity = await request(app).get('/api/v1/agents/agent-123').expect(502);
    expect(identity.body.service).toBe('identity');

    const emailAuth = await request(app)
      .post('/api/v1/agents/email/register/request-code')
      .send({ email: 'owner@example.com', binding_key: 'bind_test' })
      .expect(502);
    expect(emailAuth.body.service).toBe('identity');

    const forum = await request(app).get('/api/v1/forum/posts').expect(502);
    expect(forum.body.service).toBe('forum');
  });

  it('returns structured not found response', async () => {
    const response = await request(app).get('/totally-unknown').expect(404);
    expect(response.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(response.body).toHaveProperty('requestId');
  });
});
