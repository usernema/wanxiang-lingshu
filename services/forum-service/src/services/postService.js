const Post = require('../models/Post');
const Comment = require('../models/Comment');
const redisClient = require('../config/redis');
const { client: esClient, indexPrefix } = require('../config/elasticsearch');
const logger = require('../config/logger');

const CACHE_TTL = parseInt(process.env.CACHE_TTL || '3600');

class PostService {
  static async invalidatePostCache(id, postId) {
    try {
      const keys = [`post:${id}`];
      if (postId && postId !== id) {
        keys.push(`post:${postId}`);
      }
      await redisClient.del(keys);
    } catch (error) {
      logger.error('Redis delete error', error);
    }
  }

  static async indexPost(post) {
    try {
      await esClient.index({
        index: `${indexPrefix}_posts`,
        id: post.id.toString(),
        document: {
          id: post.id,
          post_id: post.post_id,
          title: post.title,
          content: post.content,
          author_aid: post.author_aid,
          tags: post.tags,
          category: post.category,
          created_at: post.created_at,
          updated_at: post.updated_at,
          view_count: post.view_count,
          like_count: post.like_count,
          comment_count: post.comment_count,
          status: post.status,
        },
      });
    } catch (error) {
      logger.error('Failed to index post to Elasticsearch', error);
    }
  }

  static async deleteIndexedPost(post) {
    try {
      await esClient.delete({
        index: `${indexPrefix}_posts`,
        id: post.id.toString(),
      });
    } catch (error) {
      logger.error('Failed to delete post from Elasticsearch', error);
    }
  }

  static async syncSearchDocument(post) {
    if (!post) return;
    if (post.status === 'published') {
      await this.indexPost(post);
      return;
    }
    await this.deleteIndexedPost(post);
  }

  static async createPost(data) {
    const post = await Post.create(data);

    Promise.resolve().then(async () => this.indexPost(post));

    return post;
  }

  static async getPost(id) {
    const cacheKey = `post:${id}`;

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        const post = JSON.parse(cached);
        await Post.incrementViewCount(id);
        post.view_count = (post.view_count || 0) + 1;
        await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(post));
        return post;
      }
    } catch (error) {
      logger.error('Redis get error', error);
    }

    const post = await Post.findById(id);
    if (!post) return null;

    await Post.incrementViewCount(id);
    post.view_count = (post.view_count || 0) + 1;

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

  static async getAdminPost(id) {
    return Post.findByIdForAdmin(id);
  }

  static async getAdminPosts(filters) {
    const posts = await Post.findAllForAdmin(filters);
    const total = await Post.getCountForAdmin(filters);
    return { posts, total };
  }

  static async syncPublishedCommentCount(postId) {
    const total = await Comment.getCount(postId);
    await Post.setCommentCount(postId, total);
  }

  static async updatePost(id, data) {
    const post = await Post.update(id, data);
    await this.invalidatePostCache(id, post?.post_id);

    // Update Elasticsearch
    try {
      await esClient.update({
        index: `${indexPrefix}_posts`,
        id: id.toString(),
        doc: {
          title: data.title,
          content: data.content,
          tags: data.tags,
          category: data.category,
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
    await this.invalidatePostCache(id, post?.post_id);
    await this.syncSearchDocument(post);

    return post;
  }

  static async moderatePost(id, status) {
    const existingPost = await Post.findByIdForAdmin(id);
    if (!existingPost) return null;

    const post = await Post.setStatus(id, status);
    await this.invalidatePostCache(id, post?.post_id);
    await this.syncSearchDocument(post);
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

      const posts = result.hits.hits.map((hit) => {
        const source = hit._source || {};
        const numericId = Number.parseInt(hit._id, 10);
        return {
          ...source,
          id: typeof source.id === 'number' ? source.id : numericId,
        };
      });

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
    await this.invalidatePostCache(id);
  }
}

module.exports = PostService;
