jest.mock('../../src/models/Post', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByIdForAdmin: jest.fn(),
  incrementViewCount: jest.fn(),
  findAll: jest.fn(),
  findAllForAdmin: jest.fn(),
  getCount: jest.fn(),
  getCountForAdmin: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  setStatus: jest.fn(),
  setCommentCount: jest.fn(),
  incrementLikeCount: jest.fn(),
}));
jest.mock('../../src/models/Comment', () => ({
  getCount: jest.fn(),
}));
jest.mock('../../src/config/redis', () => ({
  get: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
}));
jest.mock('../../src/config/elasticsearch', () => ({
  client: {
    index: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    search: jest.fn(),
  },
  indexPrefix: 'test_forum',
}));
jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const PostService = require('../../src/services/postService');
const Post = require('../../src/models/Post');
const Comment = require('../../src/models/Comment');
const { client: esClient, indexPrefix } = require('../../src/config/elasticsearch');

describe('PostService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPost', () => {
    it('should create a post successfully', async () => {
      const mockPost = {
        id: 1,
        author_aid: 'agent://a2ahub/test',
        title: 'Test Post',
        content: 'Test content',
        tags: ['test'],
        created_at: new Date(),
      };

      Post.create.mockResolvedValue(mockPost);

      const result = await PostService.createPost({
        author_aid: 'agent://a2ahub/test',
        title: 'Test Post',
        content: 'Test content',
        tags: ['test'],
      });

      expect(result).toEqual(mockPost);
      expect(Post.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPost', () => {
    it('should return a post by id', async () => {
      const mockPost = {
        id: 1,
        title: 'Test Post',
        content: 'Test content',
      };

      Post.findById.mockResolvedValue(mockPost);
      Post.incrementViewCount.mockResolvedValue();

      const result = await PostService.getPost(1);

      expect(result).toEqual(mockPost);
      expect(Post.findById).toHaveBeenCalledWith(1);
      expect(Post.incrementViewCount).toHaveBeenCalledWith(1);
    });

    it('should return null for non-existent post', async () => {
      Post.findById.mockResolvedValue(null);

      const result = await PostService.getPost(999);

      expect(result).toBeNull();
    });
  });

  describe('moderatePost', () => {
    it('should update post status for admin moderation', async () => {
      Post.findByIdForAdmin.mockResolvedValue({
        id: 1,
        post_id: 'post_1',
        status: 'published',
      });
      Post.setStatus.mockResolvedValue({
        id: 1,
        post_id: 'post_1',
        status: 'hidden',
      });

      const result = await PostService.moderatePost('post_1', 'hidden');

      expect(Post.findByIdForAdmin).toHaveBeenCalledWith('post_1');
      expect(Post.setStatus).toHaveBeenCalledWith('post_1', 'hidden');
      expect(result).toEqual(expect.objectContaining({ status: 'hidden' }));
    });

    it('should sync published comment count', async () => {
      Comment.getCount.mockResolvedValue(3);

      await PostService.syncPublishedCommentCount('post_1');

      expect(Comment.getCount).toHaveBeenCalledWith('post_1');
      expect(Post.setCommentCount).toHaveBeenCalledWith('post_1', 3);
    });
  });

  describe('searchPosts', () => {
    it('should restrict search to published posts', async () => {
      esClient.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: '1',
              _source: {
                id: 1,
                title: 'Visible signal',
                status: 'published',
              },
            },
          ],
          total: { value: 1 },
        },
      });

      const result = await PostService.searchPosts('signal', { limit: 5, offset: 0 });

      expect(esClient.search).toHaveBeenCalledWith({
        index: `${indexPrefix}_posts`,
        body: {
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query: 'signal',
                    fields: ['title^2', 'content', 'tags'],
                  },
                },
              ],
              filter: [
                {
                  term: {
                    status: 'published',
                  },
                },
              ],
            },
          },
          from: 0,
          size: 5,
          sort: [{ created_at: 'desc' }],
        },
      });
      expect(result).toEqual({
        posts: [{ id: 1, title: 'Visible signal', status: 'published' }],
        total: 1,
      });
    });
  });
});
