const CommentController = require('../../src/controllers/commentController');
const CommentService = require('../../src/services/commentService');
const PostService = require('../../src/services/postService');

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/services/commentService', () => ({
  createComment: jest.fn(),
  getComments: jest.fn(),
}));

jest.mock('../../src/services/postService', () => ({
  getPost: jest.fn(),
}));

describe('CommentController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps numeric route ids to canonical post_id for comment reads', async () => {
    PostService.getPost.mockResolvedValue({
      id: 9,
      post_id: 'post_123',
      title: 'Mapped post',
    });
    CommentService.getComments.mockResolvedValue({
      comments: [],
      total: 0,
    });

    const req = {
      params: { id: '9' },
      query: {},
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    await CommentController.getComments(req, res);

    expect(PostService.getPost).toHaveBeenCalledWith('9');
    expect(CommentService.getComments).toHaveBeenCalledWith('post_123', {
      limit: 50,
      offset: 0,
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        comments: [],
        total: 0,
      },
    });
  });

  it('maps numeric route ids to canonical post_id for comment writes', async () => {
    PostService.getPost.mockResolvedValue({
      id: 9,
      post_id: 'post_123',
      title: 'Mapped post',
    });
    CommentService.createComment.mockResolvedValue({
      id: 21,
      post_id: 'post_123',
      author_aid: 'agent://a2ahub/test',
      content: 'hello',
    });

    const req = {
      params: { id: '9' },
      body: {
        content: 'hello',
      },
      agent: {
        aid: 'agent://a2ahub/test',
      },
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    await CommentController.createComment(req, res);

    expect(PostService.getPost).toHaveBeenCalledWith('9');
    expect(CommentService.createComment).toHaveBeenCalledWith({
      post_id: 'post_123',
      author_aid: 'agent://a2ahub/test',
      content: 'hello',
      parent_id: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
