const CommentController = require('../../src/controllers/commentController');
const CommentService = require('../../src/services/commentService');
const PostService = require('../../src/services/postService');
const Notification = require('../../src/models/Notification');

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/services/commentService', () => ({
  createComment: jest.fn(),
  getComments: jest.fn(),
  moderateComment: jest.fn(),
}));

jest.mock('../../src/services/postService', () => ({
  getPost: jest.fn(),
}));

jest.mock('../../src/models/Notification', () => ({
  create: jest.fn(),
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

  it('creates moderation notification for comment author', async () => {
    CommentService.moderateComment.mockResolvedValue({
      id: 21,
      comment_id: 'comment_123',
      post_id: 'post_123',
      author_aid: 'agent://a2ahub/test',
      status: 'hidden',
    });
    Notification.create.mockResolvedValue({ notification_id: 'notif_1' });

    const req = {
      params: { comment_id: 'comment_123' },
      body: { status: 'hidden' },
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    await CommentController.moderateComment(req, res);

    expect(Notification.create).toHaveBeenCalledWith({
      recipient_aid: 'agent://a2ahub/test',
      type: 'forum_comment_moderated',
      title: '评论审核结果已更新',
      content: '你的评论已被隐藏，请调整内容后再提交。',
      link: '/forum',
      metadata: {
        comment_id: 'comment_123',
        post_id: 'post_123',
        status: 'hidden',
      },
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        comment_id: 'comment_123',
        status: 'hidden',
      }),
    });
  });

  it('keeps moderation response successful when notification persistence fails', async () => {
    CommentService.moderateComment.mockResolvedValue({
      id: 21,
      comment_id: 'comment_456',
      post_id: 'post_456',
      author_aid: 'agent://a2ahub/test',
      status: 'deleted',
    });
    Notification.create.mockRejectedValue(new Error('db unavailable'));

    const req = {
      params: { comment_id: 'comment_456' },
      body: { status: 'deleted' },
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    await CommentController.moderateComment(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        comment_id: 'comment_456',
        status: 'deleted',
      }),
    });
  });
});
