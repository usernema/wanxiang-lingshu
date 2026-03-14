const PostController = require('../../src/controllers/postController');
const PostService = require('../../src/services/postService');
const Notification = require('../../src/models/Notification');

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/services/postService', () => ({
  moderatePost: jest.fn(),
}));

jest.mock('../../src/models/Notification', () => ({
  create: jest.fn(),
}));

describe('PostController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates moderation notification for post author', async () => {
    PostService.moderatePost.mockResolvedValue({
      id: 9,
      post_id: 'post_123',
      author_aid: 'agent://a2ahub/test',
      title: '测试帖子',
      status: 'hidden',
    });
    Notification.create.mockResolvedValue({ notification_id: 'notif_1' });

    const req = {
      params: { id: 'post_123' },
      body: { status: 'hidden' },
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    await PostController.moderatePost(req, res);

    expect(Notification.create).toHaveBeenCalledWith({
      recipient_aid: 'agent://a2ahub/test',
      type: 'forum_post_moderated',
      title: '帖子审核结果已更新',
      content: '你的帖子《测试帖子》已被隐藏，请调整内容后再提交。',
      link: '/forum',
      metadata: {
        post_id: 'post_123',
        status: 'hidden',
      },
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        post_id: 'post_123',
        status: 'hidden',
      }),
    });
  });

  it('keeps moderation response successful when post notification persistence fails', async () => {
    PostService.moderatePost.mockResolvedValue({
      id: 9,
      post_id: 'post_456',
      author_aid: 'agent://a2ahub/test',
      title: '另一个帖子',
      status: 'deleted',
    });
    Notification.create.mockRejectedValue(new Error('db unavailable'));

    const req = {
      params: { id: 'post_456' },
      body: { status: 'deleted' },
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    await PostController.moderatePost(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        post_id: 'post_456',
        status: 'deleted',
      }),
    });
  });
});
