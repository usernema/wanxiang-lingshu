jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

jest.mock('express-rate-limit', () => jest.fn((options) => options));

jest.mock('rate-limit-redis', () => ({
  RedisStore: jest.fn().mockImplementation((options) => ({ options })),
}));

jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: jest.fn((options) => options),
  fixRequestBody: jest.fn(),
}));

jest.mock('../src/utils/redis', () => ({
  createRedisClient: jest.fn().mockResolvedValue({ connect: jest.fn() }),
  closeRedisClient: jest.fn().mockResolvedValue(),
  getRedisClient: jest.fn(),
}));

jest.mock('../src/middleware/metrics', () => ({
  metricsHandler: jest.fn((req, res) => res.status(200).send('metrics')),
  metricsMiddleware: jest.fn((req, res, next) => next()),
  metrics: {
    authFailuresTotal: { inc: jest.fn() },
    rateLimitExceeded: { inc: jest.fn() },
  },
}));

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const axios = require('axios');
const jwt = require('jsonwebtoken');
const { getRedisClient } = require('../src/utils/redis');
const { metrics } = require('../src/middleware/metrics');
const logger = require('../src/utils/logger');
const { fixRequestBody, createProxyMiddleware } = require('http-proxy-middleware');
const config = require('../src/config');
const {
  parseAuthHeader,
  validateTimestamp,
  verifyAgentHeader,
  authenticate,
  optionalAuthenticate,
} = require('../src/middleware/auth');
const {
  buildErrorResponse,
  sendError,
  createHttpError,
  notFoundHandler,
  errorHandler,
  asyncHandler,
} = require('../src/middleware/errorHandler');
const {
  getReputationBasedLimit,
  createLimiterOptions,
  createRateLimiter,
  createProfileLimiters,
} = require('../src/middleware/rateLimit');
const proxyModule = require('../src/routes/proxy');
const {
  classifyProxyError,
  createProxyConfig,
  createRouteProxies,
  extractServiceName,
} = proxyModule;
const {
  buildMeta,
  checkRedisDependency,
  checkServiceHealth,
  getDependencyStatus,
  isReady,
  setupRoutes,
} = require('../src/routes');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    send(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
  };
}

describe('auth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRedisClient.mockResolvedValue({
      get: jest.fn().mockResolvedValue(null),
      setEx: jest.fn().mockResolvedValue('OK'),
      ping: jest.fn().mockResolvedValue('PONG'),
      sendCommand: jest.fn().mockResolvedValue('OK'),
    });
  });

  it('parses a valid Agent auth header', () => {
    expect(parseAuthHeader('Agent aid="agent://a2ahub/test-1", signature="sig", timestamp="123", nonce="abc"')).toEqual({
      aid: 'agent://a2ahub/test-1',
      signature: 'sig',
      timestamp: '123',
      nonce: 'abc',
    });
  });

  it('returns null for invalid auth headers', () => {
    expect(parseAuthHeader('Bearer token')).toBeNull();
    expect(parseAuthHeader('')).toBeNull();
    expect(parseAuthHeader(null)).toBeNull();
  });

  it('validates timestamp freshness', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(validateTimestamp(now)).toBe(true);
    expect(validateTimestamp(now - 400)).toBe(false);
    expect(validateTimestamp(now + 400)).toBe(false);
  });

  it('returns INVALID_AUTH_HEADER for malformed Agent auth input', async () => {
    const result = await verifyAgentHeader('Agent aid="agent://a2ahub/test-1"', 'req-auth-1');
    expect(result).toEqual({
      error: {
        status: 401,
        body: {
          success: false,
          error: 'Invalid authorization header format',
          code: 'INVALID_AUTH_HEADER',
          requestId: 'req-auth-1',
        },
      },
    });
  });

  it('returns INVALID_TIMESTAMP for stale signatures', async () => {
    const stale = Math.floor(Date.now() / 1000) - 1000;
    const result = await verifyAgentHeader(
      `Agent aid="agent://a2ahub/test-1", signature="sig", timestamp="${stale}", nonce="abc"`,
      'req-auth-2'
    );
    expect(result.error.body.code).toBe('INVALID_TIMESTAMP');
  });

  it('returns cached agent without calling identity verify', async () => {
    getRedisClient.mockResolvedValue({
      get: jest.fn().mockResolvedValue(JSON.stringify({ aid: 'agent://a2ahub/cached', status: 'active', reputation: 10 })),
      setEx: jest.fn().mockResolvedValue('OK'),
      ping: jest.fn().mockResolvedValue('PONG'),
      sendCommand: jest.fn().mockResolvedValue('OK'),
    });

    const timestamp = `${Math.floor(Date.now() / 1000)}`;
    const result = await verifyAgentHeader(
      `Agent aid="agent://a2ahub/cached", signature="sig", timestamp="${timestamp}", nonce="abc"`,
      'req-auth-3'
    );

    expect(result.agent).toEqual({ aid: 'agent://a2ahub/cached', status: 'active', reputation: 10 });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('verifies agent signature against identity service', async () => {
    axios.post.mockResolvedValue({
      data: {
        success: true,
        data: { aid: 'agent://a2ahub/test-123', reputation: 100, status: 'active' },
      },
    });

    const timestamp = `${Math.floor(Date.now() / 1000)}`;
    const result = await verifyAgentHeader(
      `Agent aid="agent://a2ahub/test-123", signature="abc123", timestamp="${timestamp}", nonce="xyz"`,
      'req-auth-4'
    );

    expect(result.agent).toEqual({ aid: 'agent://a2ahub/test-123', reputation: 100, status: 'active' });
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('maps verify failures to AGENT_INACTIVE for 403', async () => {
    axios.post.mockRejectedValue({
      message: 'forbidden',
      response: { status: 403, data: { error: 'inactive' } },
    });

    const timestamp = `${Math.floor(Date.now() / 1000)}`;
    const result = await verifyAgentHeader(
      `Agent aid="agent://a2ahub/test-123", signature="bad", timestamp="${timestamp}", nonce="xyz"`,
      'req-auth-5'
    );

    expect(result.error.body.code).toBe('AGENT_INACTIVE');
  });

  it('rejects missing authorization header', async () => {
    const req = { headers: {}, id: 'req-auth-6' };
    const res = createRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('MISSING_AUTH_HEADER');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects unsupported authorization type', async () => {
    const req = { headers: { authorization: 'Basic abc' }, id: 'req-auth-7' };
    const res = createRes();

    await authenticate(req, res, jest.fn());

    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('UNSUPPORTED_AUTH_TYPE');
  });

  it('rejects invalid bearer token', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });

    const req = { headers: { authorization: 'Bearer nope' }, id: 'req-auth-8' };
    const res = createRes();

    await authenticate(req, res, jest.fn());

    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('authenticates valid bearer token and fetches current agent', async () => {
    jwt.verify.mockReturnValue({ aid: 'agent://a2ahub/bearer-1' });
    axios.get.mockResolvedValue({ data: { aid: 'agent://a2ahub/bearer-1', status: 'active', reputation: 42 } });

    const redis = {
      get: jest.fn().mockResolvedValue(null),
      setEx: jest.fn().mockResolvedValue('OK'),
      ping: jest.fn().mockResolvedValue('PONG'),
      sendCommand: jest.fn().mockResolvedValue('OK'),
    };
    getRedisClient.mockResolvedValue(redis);

    const req = { headers: { authorization: 'Bearer valid' }, id: 'req-auth-9' };
    const res = createRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(req.agent).toEqual({ aid: 'agent://a2ahub/bearer-1', status: 'active', reputation: 42 });
    expect(next).toHaveBeenCalled();
    expect(redis.setEx).toHaveBeenCalled();
  });

  it('rejects restricted agent accounts', async () => {
    axios.post.mockResolvedValue({
      data: {
        success: true,
        data: { aid: 'agent://a2ahub/banned', status: 'banned', reputation: 1 },
      },
    });

    const timestamp = `${Math.floor(Date.now() / 1000)}`;
    const req = {
      headers: { authorization: `Agent aid="agent://a2ahub/banned", signature="sig", timestamp="${timestamp}", nonce="n"` },
      id: 'req-auth-10',
    };
    const res = createRes();

    await authenticate(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('AGENT_RESTRICTED');
  });

  it('rejects inactive agent accounts', async () => {
    axios.post.mockResolvedValue({
      data: {
        success: true,
        data: { aid: 'agent://a2ahub/inactive', status: 'pending', reputation: 1 },
      },
    });

    const timestamp = `${Math.floor(Date.now() / 1000)}`;
    const req = {
      headers: { authorization: `Agent aid="agent://a2ahub/inactive", signature="sig", timestamp="${timestamp}", nonce="n"` },
      id: 'req-auth-11',
    };
    const res = createRes();

    await authenticate(req, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('AGENT_INACTIVE');
  });

  it('optionalAuthenticate passes through when no auth header is present', async () => {
    const next = jest.fn();
    await optionalAuthenticate({ headers: {} }, createRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

describe('error handler helpers', () => {
  it('builds structured error responses', () => {
    const response = buildErrorResponse({ id: 'req-1' }, {
      status: 400,
      code: 'MALFORMED_JSON',
      error: 'Malformed JSON request body',
      extras: { detail: 'bad' },
    });

    expect(response).toEqual({
      success: false,
      error: 'Malformed JSON request body',
      code: 'MALFORMED_JSON',
      requestId: 'req-1',
      detail: 'bad',
    });
  });

  it('sends structured error payloads', () => {
    const res = createRes();
    sendError(res, { id: 'req-2' }, { status: 429, code: 'RATE_LIMIT_EXCEEDED', error: 'Too many requests' });
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('creates HTTP errors with status and extras', () => {
    const err = createHttpError(403, 'FORBIDDEN', 'Access denied', { reason: 'policy' });
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.extras).toEqual({ reason: 'policy' });
  });

  it('handles not found responses', () => {
    const res = createRes();
    notFoundHandler({ id: 'req-3', path: '/missing' }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND', path: '/missing' });
  });

  it('normalizes payload too large errors', () => {
    const res = createRes();
    errorHandler({ type: 'entity.too.large' }, { id: 'req-4', path: '/p', method: 'POST' }, res, jest.fn());
    expect(res.statusCode).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('normalizes malformed json errors', () => {
    const res = createRes();
    errorHandler({ type: 'entity.parse.failed' }, { id: 'req-5', path: '/p', method: 'POST' }, res, jest.fn());
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('MALFORMED_JSON');
  });

  it('normalizes validation and auth related errors', () => {
    const validationRes = createRes();
    const validationErr = new Error('bad input');
    validationErr.name = 'ValidationError';
    errorHandler(validationErr, { id: 'req-6', path: '/p', method: 'POST' }, validationRes, jest.fn());
    expect(validationRes.body.code).toBe('VALIDATION_ERROR');

    const unauthorizedRes = createRes();
    const unauthorizedErr = new Error('bad token');
    unauthorizedErr.name = 'UnauthorizedError';
    errorHandler(unauthorizedErr, { id: 'req-7', path: '/p', method: 'GET' }, unauthorizedRes, jest.fn());
    expect(unauthorizedRes.body.code).toBe('UNAUTHORIZED');

    const forbiddenRes = createRes();
    const forbiddenErr = new Error('blocked');
    forbiddenErr.name = 'ForbiddenError';
    errorHandler(forbiddenErr, { id: 'req-8', path: '/p', method: 'GET' }, forbiddenRes, jest.fn());
    expect(forbiddenRes.body.code).toBe('FORBIDDEN');
  });

  it('passes through when headers are already sent', () => {
    const next = jest.fn();
    errorHandler(new Error('boom'), { id: 'req-9', path: '/p', method: 'GET' }, { headersSent: true }, next);
    expect(next).toHaveBeenCalled();
  });

  it('uses fallback internal error shape for unexpected exceptions', () => {
    const res = createRes();
    errorHandler(new Error('boom'), { id: 'req-10', path: '/boom', method: 'GET' }, res, jest.fn());
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(res.body.error).toBe('Internal server error');
  });

  it('prefers x-request-id header when req.id is absent', () => {
    const response = buildErrorResponse({ headers: { 'x-request-id': 'header-req-1' } }, { status: 400, code: 'BAD', error: 'bad' });
    expect(response.requestId).toBe('header-req-1');
  });

  it('asyncHandler forwards rejected promises', async () => {
    const next = jest.fn();
    const handler = asyncHandler(async () => {
      throw new Error('async boom');
    });

    handler({}, {}, next);
    await new Promise(process.nextTick);
    expect(next).toHaveBeenCalled();
  });
});

describe('rate limit helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRedisClient.mockResolvedValue({
      get: jest.fn().mockResolvedValue(null),
      setEx: jest.fn().mockResolvedValue('OK'),
      ping: jest.fn().mockResolvedValue('PONG'),
      sendCommand: jest.fn().mockResolvedValue('OK'),
    });
  });

  it('returns expected reputation-based limits', () => {
    expect(getReputationBasedLimit(5000)).toBe(1000);
    expect(getReputationBasedLimit(1001)).toBe(500);
    expect(getReputationBasedLimit(501)).toBe(300);
    expect(getReputationBasedLimit(101)).toBe(150);
    expect(getReputationBasedLimit(0)).toBe(config.rateLimit.profiles.default.maxRequests);
  });

  it('throws on unknown rate limit profile', () => {
    expect(() => createLimiterOptions('unknown', { sendCommand: jest.fn() })).toThrow('Unknown rate limit profile');
  });

  it('builds auth limiter options keyed by ip', () => {
    const options = createLimiterOptions('auth', { sendCommand: jest.fn() });
    expect(options.keyGenerator({ ip: '127.0.0.1' })).toBe('auth:ip:127.0.0.1');
    expect(options.skip({ path: '/health' })).toBe(true);
    expect(options.skip({ path: '/api/v1/agents/login' })).toBe(false);
  });

  it('builds default limiter options keyed by agent and reputation', async () => {
    const options = createLimiterOptions('default', { sendCommand: jest.fn() });
    await expect(options.max({ agent: { reputation: 6000 } })).resolves.toBe(1000);
    expect(options.keyGenerator({ ip: '127.0.0.1', agent: { aid: 'agent-1' } })).toBe('default:agent:agent-1');
  });

  it('sends structured rate limit response from handler', () => {
    const options = createLimiterOptions('write', { sendCommand: jest.fn() });
    const res = createRes();
    res.setHeader('retry-after', '30');
    options.handler({ id: 'req-rate-1', path: '/api/v1/forum', ip: '1.1.1.1' }, res);
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(metrics.rateLimitExceeded.inc).toHaveBeenCalled();
  });

  it('creates a single profile limiter', async () => {
    const limiter = await createRateLimiter('publicRead');
    expect(limiter.windowMs).toBe(config.rateLimit.profiles.publicRead.windowMs);
  });

  it('creates all profile limiters', async () => {
    const limiters = await createProfileLimiters();
    expect(limiters).toHaveProperty('defaultLimiter');
    expect(limiters).toHaveProperty('authLimiter');
    expect(limiters).toHaveProperty('publicReadLimiter');
    expect(limiters).toHaveProperty('writeLimiter');
    expect(limiters).toHaveProperty('internalLimiter');
    expect(limiters).toHaveProperty('healthLimiter');
  });
});

describe('proxy helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts service name from URL', () => {
    expect(extractServiceName('http://identity-service:8001')).toBe('identity-service');
    expect(extractServiceName('bad-url')).toBe('unknown');
  });

  it('classifies timeout, unavailable, and generic proxy errors', () => {
    expect(classifyProxyError({ code: 'ETIMEDOUT', message: 'timeout' }).code).toBe('UPSTREAM_TIMEOUT');
    expect(classifyProxyError({ code: 'ECONNREFUSED', message: 'refused' }).code).toBe('UPSTREAM_UNAVAILABLE');
    expect(classifyProxyError({ code: 'OTHER', message: 'oops' }).code).toBe('BAD_GATEWAY');
  });

  it('creates proxy config and forwards request context headers', () => {
    const proxyReq = { setHeader: jest.fn() };
    const req = {
      id: 'req-proxy-1',
      traceId: 'trace-1',
      ip: '127.0.0.1',
      protocol: 'http',
      method: 'POST',
      path: '/api/v1/marketplace/tasks',
      get: jest.fn().mockReturnValue('localhost:3000'),
      agent: {
        aid: 'agent://a2ahub/agent-1',
        reputation: 7,
        membership_level: 'plus',
        trust_level: 'trusted',
      },
    };

    const configObj = createProxyConfig('http://marketplace-service:8000');
    configObj.onProxyReq(proxyReq, req, {});

    expect(proxyReq.setHeader).toHaveBeenCalledWith('X-Request-Id', 'req-proxy-1');
    expect(proxyReq.setHeader).toHaveBeenCalledWith('X-Agent-Id', 'agent://a2ahub/agent-1');
    expect(fixRequestBody).toHaveBeenCalled();
  });

  it('sends classified proxy errors to clients', () => {
    const configObj = createProxyConfig('http://credit-service:8080');
    const req = { id: 'req-proxy-2', path: '/api/v1/credits' };
    const res = createRes();

    configObj.onError({ code: 'ECONNREFUSED', message: 'refused' }, req, res);

    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(res.body.service).toBe('credit-service');
  });

  it('falls back to BAD_GATEWAY when proxy classification is disabled', () => {
    const original = config.request.classifyProxyErrors;
    config.request.classifyProxyErrors = false;

    const configObj = createProxyConfig('http://credit-service:8080');
    const req = { id: 'req-proxy-3', path: '/api/v1/credits' };
    const res = createRes();
    configObj.onError({ code: 'ETIMEDOUT', message: 'timeout' }, req, res);

    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe('BAD_GATEWAY');
    config.request.classifyProxyErrors = original;
  });

  it('omits empty optional headers when forwarding requests', () => {
    const proxyReq = { setHeader: jest.fn() };
    const req = {
      id: 'req-proxy-4',
      traceId: 'trace-4',
      ip: '127.0.0.1',
      protocol: 'http',
      method: 'GET',
      path: '/api/v1/rankings',
      get: jest.fn().mockReturnValue(undefined),
    };

    const configObj = createProxyConfig('http://ranking-service:3006');
    configObj.onProxyReq(proxyReq, req, {});

    expect(proxyReq.setHeader).not.toHaveBeenCalledWith('X-Forwarded-Host', undefined);
  });

  it('creates route proxies for all configured services', () => {
    const proxies = createRouteProxies();
    expect(proxies).toHaveProperty('identity');
    expect(proxies).toHaveProperty('forum');
    expect(proxies).toHaveProperty('credit');
    expect(proxies).toHaveProperty('marketplace');
    expect(proxies).toHaveProperty('training');
    expect(proxies).toHaveProperty('ranking');
    expect(createProxyMiddleware).toHaveBeenCalled();
  });

  it('falls back to BAD_GATEWAY when proxy classification is disabled', () => {
    const original = config.request.classifyProxyErrors;
    config.request.classifyProxyErrors = false;

    const configObj = createProxyConfig('http://credit-service:8080');
    const req = { id: 'req-proxy-3', path: '/api/v1/credits' };
    const res = createRes();

    configObj.onError({ code: 'ETIMEDOUT', message: 'timeout' }, req, res);

    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe('BAD_GATEWAY');

    config.request.classifyProxyErrors = original;
  });
});

describe('route helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRedisClient.mockResolvedValue({
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn().mockResolvedValue(null),
      setEx: jest.fn().mockResolvedValue('OK'),
      sendCommand: jest.fn().mockResolvedValue('OK'),
    });
  });

  it('builds request metadata', () => {
    const meta = buildMeta({ id: 'req-route-1' });
    expect(meta.requestId).toBe('req-route-1');
    expect(typeof meta.timestamp).toBe('string');
  });

  it('checks redis dependency successfully', async () => {
    await expect(checkRedisDependency()).resolves.toEqual({ name: 'redis', required: config.health.redisRequired, ok: true });
  });

  it('handles redis dependency failures', async () => {
    getRedisClient.mockResolvedValue({ ping: jest.fn().mockRejectedValue(new Error('redis down')) });
    const result = await checkRedisDependency();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('redis down');
  });

  it('checks service health success and failure', async () => {
    axios.get.mockResolvedValueOnce({ status: 200 });
    const okResult = await checkServiceHealth('identity', true);
    expect(okResult.ok).toBe(true);
    expect(okResult.required).toBe(true);

    axios.get.mockRejectedValueOnce({ message: 'boom', response: { status: 503, data: { error: 'down' } } });
    const failResult = await checkServiceHealth('forum', false);
    expect(failResult.ok).toBe(false);
    expect(failResult.required).toBe(false);
    expect(failResult.status).toBe(503);
  });

  it('handles missing service URL config', async () => {
    const original = config.services.identity;
    config.services.identity = '';
    const result = await checkServiceHealth('identity', true);
    expect(result.ok).toBe(false);
    config.services.identity = original;
  });

  it('aggregates dependency status and readiness', async () => {
    axios.get.mockResolvedValue({ status: 200 });
    const deps = await getDependencyStatus();
    expect(deps.redis.ok).toBe(true);
    expect(Array.isArray(deps.required)).toBe(true);
    expect(Array.isArray(deps.optional)).toBe(true);
    expect(isReady(deps)).toBe(true);
    expect(isReady({ redis: { required: true, ok: false }, required: [], optional: [] })).toBe(false);
    expect(isReady({ redis: { required: false, ok: false }, required: [], optional: [] })).toBe(true);
  });

  it('marks optional dependency failures without failing required readiness helper inputs', async () => {
    axios.get
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 200 })
      .mockRejectedValueOnce({ message: 'training down' })
      .mockRejectedValueOnce({ message: 'ranking down' });

    const deps = await getDependencyStatus();
    expect(deps.optional.every((dependency) => dependency.ok === false)).toBe(true);
    expect(isReady({ redis: deps.redis, required: deps.required, optional: deps.optional })).toBe(true);
  });

  it('returns false when a required downstream dependency is unhealthy', () => {
    expect(isReady({
      redis: { required: true, ok: true },
      required: [{ required: true, ok: false }],
      optional: [],
    })).toBe(false);
  });

  it('uses forum-specific health path', async () => {
    axios.get.mockResolvedValue({ status: 200 });
    await checkServiceHealth('forum', true);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/forum/health'),
      expect.objectContaining({ timeout: config.health.dependencyTimeout })
    );
  });

  it('returns null status when service health request fails without response object', async () => {
    axios.get.mockRejectedValue({ message: 'network down' });
    const result = await checkServiceHealth('identity', true);
    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
  });

  it('includes route metadata in health-style success payloads', () => {
    const res = createRes();
    const meta = buildMeta({ id: 'req-route-meta' });
    res.status(200).json({ success: true, ...meta });
    expect(res.body.requestId).toBe('req-route-meta');
  });

  it('mounts route proxies with limiter ordering', () => {
    const app = { use: jest.fn(), get: jest.fn() };
    const middleware = {
      defaultLimiter: 'defaultLimiter',
      authLimiter: 'authLimiter',
      publicReadLimiter: 'publicReadLimiter',
      writeLimiter: 'writeLimiter',
    };

    setupRoutes(app, middleware);

    expect(app.use).toHaveBeenCalledWith('/api/v1/agents/register', 'authLimiter', expect.anything());
    expect(app.get).toHaveBeenCalledWith('/api/v1/agents/:aid', 'publicReadLimiter', expect.anything());
    expect(app.use).toHaveBeenCalledWith('/api/v1/forum', expect.any(Function), 'writeLimiter', expect.anything());
    expect(logger.info).toHaveBeenCalledWith('Routes configured successfully');
  });
});

describe('config defaults', () => {
  it('includes expected hardening config defaults', () => {
    expect(config.health.skipLogPaths).toContain('/metrics');
    expect(config.rateLimit.profiles).toHaveProperty('auth');
    expect(config.rateLimit.profiles).toHaveProperty('publicRead');
    expect(config.rateLimit.profiles).toHaveProperty('write');
  });
});
