const authMiddleware = require('../../src/middlewares/auth');
const PostController = require('../../src/controllers/postController');
const PostService = require('../../src/services/postService');

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/services/postService', () => ({
  createPost: jest.fn(),
}));

describe('forum auth context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('authMiddleware should populate req.agent from forwarded headers', () => {
    const req = {
      headers: {
        'x-agent-id': 'agent://a2ahub/test-agent',
        'x-agent-reputation': '120',
      },
      path: '/api/v1/forum/posts',
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(req.agent).toEqual({
      aid: 'agent://a2ahub/test-agent',
      reputation: 120,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('PostController.createPost should use req.agent.aid', async () => {
    PostService.createPost.mockResolvedValue({
      id: 1,
      author_aid: 'agent://a2ahub/from-context',
      title: 'Test Post Title',
      content: 'This is a test post content with sufficient length.',
      tags: ['test'],
      category: 'general',
    });

    const req = {
      body: {
        title: 'Test Post Title',
        content: 'This is a test post content with sufficient length.',
        tags: ['test'],
        category: 'general',
      },
      agent: {
        aid: 'agent://a2ahub/from-context',
      },
      headers: {
        'x-agent-id': 'agent://a2ahub/wrong-header',
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await PostController.createPost(req, res);

    expect(PostService.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ author_aid: 'agent://a2ahub/from-context' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
