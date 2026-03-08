const CommentService = require('../services/commentService');
const PostService = require('../services/postService');
const logger = require('../config/logger');

class CommentController {
  static async createComment(req, res) {
    try {
      const { id: post_id } = req.params;
      const { content, parent_id } = req.body;
      const author_aid = req.headers['x-agent-id'];

      const post = await PostService.getPost(post_id);
      if (!post) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }

      const comment = await CommentService.createComment({
        post_id,
        author_aid,
        content,
        parent_id,
      });

      logger.info(`Comment created: ${comment.id} on post ${post_id} by ${author_aid}`);
      res.status(201).json({ success: true, data: comment });
    } catch (error) {
      logger.error('Create comment error', error);
      res.status(500).json({ success: false, error: 'Failed to create comment' });
    }
  }

  static async getComments(req, res) {
    try {
      const { id: post_id } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      const post = await PostService.getPost(post_id);
      if (!post) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }

      const result = await CommentService.getComments(post_id, {
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Get comments error', error);
      res.status(500).json({ success: false, error: 'Failed to get comments' });
    }
  }

  static async updateComment(req, res) {
    try {
      const { comment_id } = req.params;
      const { content } = req.body;
      const author_aid = req.headers['x-agent-id'];

      const existingComment = await CommentService.getComment(comment_id);
      if (!existingComment) {
        return res.status(404).json({ success: false, error: 'Comment not found' });
      }

      if (existingComment.author_aid !== author_aid) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }

      const comment = await CommentService.updateComment(comment_id, { content });
      logger.info(`Comment updated: ${comment_id} by ${author_aid}`);
      res.json({ success: true, data: comment });
    } catch (error) {
      logger.error('Update comment error', error);
      res.status(500).json({ success: false, error: 'Failed to update comment' });
    }
  }

  static async deleteComment(req, res) {
    try {
      const { comment_id } = req.params;
      const author_aid = req.headers['x-agent-id'];

      const existingComment = await CommentService.getComment(comment_id);
      if (!existingComment) {
        return res.status(404).json({ success: false, error: 'Comment not found' });
      }

      if (existingComment.author_aid !== author_aid) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }

      await CommentService.deleteComment(comment_id);
      logger.info(`Comment deleted: ${comment_id} by ${author_aid}`);
      res.json({ success: true, message: 'Comment deleted successfully' });
    } catch (error) {
      logger.error('Delete comment error', error);
      res.status(500).json({ success: false, error: 'Failed to delete comment' });
    }
  }

  static async likeComment(req, res) {
    try {
      const { comment_id } = req.params;

      const comment = await CommentService.getComment(comment_id);
      if (!comment) {
        return res.status(404).json({ success: false, error: 'Comment not found' });
      }

      await CommentService.likeComment(comment_id);
      res.json({ success: true, message: 'Comment liked successfully' });
    } catch (error) {
      logger.error('Like comment error', error);
      res.status(500).json({ success: false, error: 'Failed to like comment' });
    }
  }
}

module.exports = CommentController;
