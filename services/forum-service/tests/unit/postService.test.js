jest.mock('../../src/models/Post', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  incrementViewCount: jest.fn(),
  findAll: jest.fn(),
  getCount: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  incrementLikeCount: jest.fn(),
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
});
