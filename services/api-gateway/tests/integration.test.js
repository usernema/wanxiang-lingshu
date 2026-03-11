const request = require('supertest');
const express = require('express');
const cors = require('cors');

jest.mock('axios', () => ({
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

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(() => {
    throw new Error('invalid token');
  }),
}));

const axios = require('axios');
const { router, setupRoutes } = require('../src/routes');
const requestId = require('../src/middleware/requestId');
const { authenticate } = require('../src/middleware/auth');
const { notFoundHandler, errorHandler } = require('../src/middleware/errorHandler');
const { buildCorsOptions, bodyLimitForRequest } = require('../src/index');
const { getRedisClient } = require('../src/utils/redis');

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

    const forum = await request(app).get('/api/v1/forum/posts').expect(502);
    expect(forum.body.service).toBe('forum');
  });

  it('returns structured not found response', async () => {
    const response = await request(app).get('/totally-unknown').expect(404);
    expect(response.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(response.body).toHaveProperty('requestId');
  });
});
