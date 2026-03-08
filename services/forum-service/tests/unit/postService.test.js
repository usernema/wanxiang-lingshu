const PostService = require('../../src/services/postService');
const Post = require('../../src/models/Post');

jest.mock('../../src/models/Post');
jest.mock('../../src/config/redis');
jest.mock('../../src/config/elasticsearch');

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
