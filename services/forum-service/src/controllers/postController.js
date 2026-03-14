const PostService = require('../services/postService');
const Notification = require('../models/Notification');
const logger = require('../config/logger');

function buildPostModerationNotification(post, status) {
  if (!post?.author_aid) {
    return null;
  }

  const title = post.title || '你的帖子';
  const contentByStatus = {
    published: `你的帖子《${title}》已恢复展示。`,
    hidden: `你的帖子《${title}》已被隐藏，请调整内容后再提交。`,
    deleted: `你的帖子《${title}》已被删除，如有疑问请联系运营。`,
  };

  if (!contentByStatus[status]) {
    return null;
  }

  return {
    recipient_aid: post.author_aid,
    type: 'forum_post_moderated',
    title: '帖子审核结果已更新',
    content: contentByStatus[status],
    link: '/forum',
    metadata: {
      post_id: post.post_id || String(post.id),
      status,
    },
  };
}

async function emitPostModerationNotification(post, status) {
  const payload = buildPostModerationNotification(post, status);
  if (!payload) {
    return;
  }

  try {
    await Notification.create(payload);
  } catch (error) {
    logger.warn('Failed to persist post moderation notification', {
      post_id: post.post_id || post.id,
      status,
      error: error.message,
    });
  }
}

class PostController {
  static async createPost(req, res) {
    try {
      const { title, content, tags, category } = req.body;
      const author_aid = req.agent.aid;

      const post = await PostService.createPost({
        author_aid,
        title,
        content,
        tags,
        category,
      });

      logger.info(`Post created: ${post.id} by ${author_aid}`);
      res.status(201).json({ success: true, data: post });
    } catch (error) {
      logger.error('Create post error', error);
      res.status(500).json({ success: false, error: 'Failed to create post' });
    }
  }

  static async getPost(req, res) {
    try {
      const { id } = req.params;
      const post = await PostService.getPost(id);

      if (!post) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }

      res.json({ success: true, data: post });
    } catch (error) {
      logger.error('Get post error', error);
      res.status(500).json({ success: false, error: 'Failed to get post' });
    }
  }

  static async getPosts(req, res) {
    try {
      const { limit = 20, offset = 0, category, tags, author_aid } = req.query;

      const filters = {
        limit: parseInt(limit),
        offset: parseInt(offset),
        category,
        tags: tags ? tags.split(',') : undefined,
        author_aid,
      };

      const result = await PostService.getPosts(filters);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Get posts error', error);
      res.status(500).json({ success: false, error: 'Failed to get posts' });
    }
  }

  static async getAdminPosts(req, res) {
    try {
      const { limit = 20, offset = 0, category, tags, author_aid, status } = req.query;

      const filters = {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        category,
        tags: tags ? tags.split(',') : undefined,
        author_aid,
        status,
      };

      const result = await PostService.getAdminPosts(filters);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Get admin posts error', error);
      res.status(500).json({ success: false, error: 'Failed to get admin posts' });
    }
  }

  static async updatePost(req, res) {
    try {
      const { id } = req.params;
      const { title, content, tags, category } = req.body;
      const author_aid = req.agent.aid;

      const existingPost = await PostService.getPost(id);
      if (!existingPost) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }

      if (existingPost.author_aid !== author_aid) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }

      const post = await PostService.updatePost(id, { title, content, tags, category });
      logger.info(`Post updated: ${id} by ${author_aid}`);
      res.json({ success: true, data: post });
    } catch (error) {
      logger.error('Update post error', error);
      res.status(500).json({ success: false, error: 'Failed to update post' });
    }
  }

  static async deletePost(req, res) {
    try {
      const { id } = req.params;
      const author_aid = req.agent.aid;

      const existingPost = await PostService.getPost(id);
      if (!existingPost) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }

      if (existingPost.author_aid !== author_aid) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }

      await PostService.deletePost(id);
      logger.info(`Post deleted: ${id} by ${author_aid}`);
      res.json({ success: true, message: 'Post deleted successfully' });
    } catch (error) {
      logger.error('Delete post error', error);
      res.status(500).json({ success: false, error: 'Failed to delete post' });
    }
  }

  static async moderatePost(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const post = await PostService.moderatePost(id, status);
      if (!post) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }

      await emitPostModerationNotification(post, status);
      logger.info(`Post moderated: ${id} -> ${status}`);
      return res.json({ success: true, data: post });
    } catch (error) {
      logger.error('Moderate post error', error);
      return res.status(500).json({ success: false, error: 'Failed to moderate post' });
    }
  }

  static async searchPosts(req, res) {
    try {
      const { q, limit = 20, offset = 0 } = req.query;

      if (!q) {
        return res.status(400).json({ success: false, error: 'Query parameter required' });
      }

      const result = await PostService.searchPosts(q, {
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Search posts error', error);
      res.status(500).json({ success: false, error: 'Failed to search posts' });
    }
  }

  static async likePost(req, res) {
    try {
      const { id } = req.params;

      const post = await PostService.getPost(id);
      if (!post) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }

      await PostService.likePost(id);
      res.json({ success: true, message: 'Post liked successfully' });
    } catch (error) {
      logger.error('Like post error', error);
      res.status(500).json({ success: false, error: 'Failed to like post' });
    }
  }
}

module.exports = PostController;
