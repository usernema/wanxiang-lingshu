const Post = require('../models/Post');
const redisClient = require('../config/redis');
const { client: esClient, indexPrefix } = require('../config/elasticsearch');
const logger = require('../config/logger');

const CACHE_TTL = parseInt(process.env.CACHE_TTL || '3600');

class PostService {
  static async createPost(data) {
    const post = await Post.create(data);

    // Index to Elasticsearch
    try {
      await esClient.index({
        index: `${indexPrefix}_posts`,
        id: post.id.toString(),
        document: {
          title: post.title,
          content: post.content,
          author_aid: post.author_aid,
          tags: post.tags,
          created_at: post.created_at,
          updated_at: post.updated_at,
          view_count: post.view_count,
          like_count: post.like_count,
          comment_count: post.comment_count,
        },
      });
    } catch (error) {
      logger.error('Failed to index post to Elasticsearch', error);
    }

    return post;
  }

  static async getPost(id) {
    // Try cache first
    const cacheKey = `post:${id}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        await Post.incrementViewCount(id);
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.error('Redis get error', error);
    }

    const post = await Post.findById(id);
    if (!post) return null;

    await Post.incrementViewCount(id);

    // Cache the post
    try {
      await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(post));
    } catch (error) {
      logger.error('Redis set error', error);
    }

    return post;
  }

  static async getPosts(filters) {
    const posts = await Post.findAll(filters);
    const total = await Post.getCount(filters);
    return { posts, total };
  }

  static async updatePost(id, data) {
    const post = await Post.update(id, data);

    // Invalidate cache
    try {
      await redisClient.del(`post:${id}`);
    } catch (error) {
      logger.error('Redis delete error', error);
    }

    // Update Elasticsearch
    try {
      await esClient.update({
        index: `${indexPrefix}_posts`,
        id: id.toString(),
        doc: {
          title: data.title,
          content: data.content,
          tags: data.tags,
          updated_at: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to update post in Elasticsearch', error);
    }

    return post;
  }

  static async deletePost(id) {
    const post = await Post.delete(id);

    // Invalidate cache
    try {
      await redisClient.del(`post:${id}`);
    } catch (error) {
      logger.error('Redis delete error', error);
    }

    // Delete from Elasticsearch
    try {
      await esClient.delete({
        index: `${indexPrefix}_posts`,
        id: id.toString(),
      });
    } catch (error) {
      logger.error('Failed to delete post from Elasticsearch', error);
    }

    return post;
  }

  static async searchPosts(query, { limit = 20, offset = 0 }) {
    try {
      const result = await esClient.search({
        index: `${indexPrefix}_posts`,
        body: {
          query: {
            multi_match: {
              query,
              fields: ['title^2', 'content', 'tags'],
            },
          },
          from: offset,
          size: limit,
          sort: [{ created_at: 'desc' }],
        },
      });

      const posts = result.hits.hits.map(hit => ({
        id: parseInt(hit._id),
        ...hit._source,
      }));

      return {
        posts,
        total: result.hits.total.value,
      };
    } catch (error) {
      logger.error('Elasticsearch search error', error);
      throw error;
    }
  }

  static async likePost(id) {
    await Post.incrementLikeCount(id);

    // Invalidate cache
    try {
      await redisClient.del(`post:${id}`);
    } catch (error) {
      logger.error('Redis delete error', error);
    }
  }
}

module.exports = PostService;
