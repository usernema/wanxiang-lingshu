const CommentService = require('../services/commentService');
const PostService = require('../services/postService');
const Notification = require('../models/Notification');
const logger = require('../config/logger');

function canonicalPostIdentifier(post) {
  return post.post_id || String(post.id);
}

function buildCommentModerationNotification(comment, status) {
  if (!comment?.author_aid) {
    return null;
  }

  const contentByStatus = {
    published: '你的评论已恢复展示。',
    hidden: '你的评论已被隐藏，请调整内容后再提交。',
    deleted: '你的评论已被删除，如有疑问请联系运营。',
  };

  if (!contentByStatus[status]) {
    return null;
  }

  return {
    recipient_aid: comment.author_aid,
    type: 'forum_comment_moderated',
    title: '评论审核结果已更新',
    content: contentByStatus[status],
    link: `/forum?post=${encodeURIComponent(comment.post_id)}`,
    metadata: {
      comment_id: comment.comment_id || String(comment.id),
      post_id: comment.post_id,
      status,
    },
  };
}

async function emitCommentModerationNotification(comment, status) {
  const payload = buildCommentModerationNotification(comment, status);
  if (!payload) {
    return;
  }

  try {
    await Notification.create(payload);
  } catch (error) {
    logger.warn('Failed to persist comment moderation notification', {
      comment_id: comment.comment_id || comment.id,
      status,
      error: error.message,
    });
  }
}

class CommentController {
  static async createComment(req, res) {
    try {
      const { id: requestedPostId } = req.params;
      const { content, parent_id } = req.body;
      const author_aid = req.agent.aid;

      const post = await PostService.getPost(requestedPostId);
      if (!post) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }

      const post_id = canonicalPostIdentifier(post);

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
      const { id: requestedPostId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      const post = await PostService.getPost(requestedPostId);
      if (!post) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }

      const post_id = canonicalPostIdentifier(post);

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

  static async getAdminComments(req, res) {
    try {
      const { id: requestedPostId } = req.params;
      const { limit = 50, offset = 0, status } = req.query;

      const post = await PostService.getAdminPost(requestedPostId);
      if (!post) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }

      const post_id = canonicalPostIdentifier(post);

      const result = await CommentService.getAdminComments(post_id, {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        status,
      });

      return res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Get admin comments error', error);
      return res.status(500).json({ success: false, error: 'Failed to get admin comments' });
    }
  }

  static async updateComment(req, res) {
    try {
      const { comment_id } = req.params;
      const { content } = req.body;
      const author_aid = req.agent.aid;

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
      const author_aid = req.agent.aid;

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

  static async moderateComment(req, res) {
    try {
      const { comment_id } = req.params;
      const { status } = req.body;

      const comment = await CommentService.moderateComment(comment_id, status);
      if (!comment) {
        return res.status(404).json({ success: false, error: 'Comment not found' });
      }

      await emitCommentModerationNotification(comment, status);
      logger.info(`Comment moderated: ${comment_id} -> ${status}`);
      return res.json({ success: true, data: comment });
    } catch (error) {
      logger.error('Moderate comment error', error);
      return res.status(500).json({ success: false, error: 'Failed to moderate comment' });
    }
  }
}

module.exports = CommentController;
