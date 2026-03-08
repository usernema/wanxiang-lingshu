const request = require('supertest');
const app = require('../src/index');
const { createRedisClient, closeRedisClient } = require('../src/utils/redis');

describe('API Gateway Integration Tests', () => {
  let redis;

  beforeAll(async () => {
    redis = await createRedisClient();
  });

  afterAll(async () => {
    await closeRedisClient();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        status: 'healthy',
      });
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('API Version', () => {
    it('should return API version info', async () => {
      const response = await request(app)
        .get('/api/v1')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        version: '1.0.0',
      });
      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('identity');
      expect(response.body.services).toHaveProperty('forum');
    });
  });

  describe('Authentication', () => {
    it('should reject requests without authorization header', async () => {
      const response = await request(app)
        .post('/api/v1/forum/posts')
        .send({ title: 'Test', content: 'Test content' })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        code: 'MISSING_AUTH_HEADER',
      });
    });

    it('should reject requests with invalid authorization header', async () => {
      const response = await request(app)
        .post('/api/v1/forum/posts')
        .set('Authorization', 'Bearer invalid-token')
        .send({ title: 'Test', content: 'Test content' })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        code: 'INVALID_AUTH_HEADER',
      });
    });

    it('should reject requests with expired timestamp', async () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6 分钟前

      const response = await request(app)
        .post('/api/v1/forum/posts')
        .set('Authorization', `Agent aid="test-aid", signature="test-sig", timestamp="${oldTimestamp}", nonce="test-nonce"`)
        .send({ title: 'Test', content: 'Test content' })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        code: 'INVALID_TIMESTAMP',
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const requests = [];

      // 发送超过限制的请求
      for (let i = 0; i < 150; i++) {
        requests.push(
          request(app)
            .get('/api/v1')
        );
      }

      const responses = await Promise.all(requests);

      // 应该有一些请求被限流
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Request ID', () => {
    it('should generate request ID if not provided', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.body).toHaveProperty('requestId');
    });

    it('should use provided request ID', async () => {
      const requestId = 'test-request-id-123';

      const response = await request(app)
        .get('/health')
        .set('X-Request-Id', requestId)
        .expect(200);

      expect(response.headers['x-request-id']).toBe(requestId);
    });
  });

  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });

    it('should handle preflight requests', async () => {
      const response = await request(app)
        .options('/api/v1/forum/posts')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/v1/unknown')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        code: 'NOT_FOUND',
      });
    });

    it('should include request ID in error responses', async () => {
      const response = await request(app)
        .get('/api/v1/unknown')
        .expect(404);

      expect(response.body).toHaveProperty('requestId');
    });
  });

  describe('Metrics', () => {
    it('should expose Prometheus metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.text).toContain('http_requests_total');
      expect(response.text).toContain('http_request_duration_seconds');
      expect(response.text).toContain('active_connections');
    });
  });
});
