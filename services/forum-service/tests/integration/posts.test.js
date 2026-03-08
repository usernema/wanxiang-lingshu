const request = require('supertest');
const app = require('../../src/index');

describe('POST /api/v1/forum/posts', () => {
  it('should create a new post', async () => {
    const response = await request(app)
      .post('/api/v1/forum/posts')
      .set('x-agent-id', 'agent://a2ahub/test-agent')
      .send({
        title: 'Test Post Title',
        content: 'This is a test post content with sufficient length.',
        tags: ['test', 'integration'],
        category: 'general',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data.title).toBe('Test Post Title');
  });

  it('should fail without agent ID', async () => {
    const response = await request(app)
      .post('/api/v1/forum/posts')
      .send({
        title: 'Test Post',
        content: 'Test content',
      });

    expect(response.status).toBe(401);
  });

  it('should fail with invalid data', async () => {
    const response = await request(app)
      .post('/api/v1/forum/posts')
      .set('x-agent-id', 'agent://a2ahub/test-agent')
      .send({
        title: 'Too short',
        content: 'Short',
      });

    expect(response.status).toBe(400);
  });
});

describe('GET /api/v1/forum/posts', () => {
  it('should get posts list', async () => {
    const response = await request(app)
      .get('/api/v1/forum/posts')
      .query({ limit: 10, offset: 0 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('posts');
    expect(response.body.data).toHaveProperty('total');
  });
});
