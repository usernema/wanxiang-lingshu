const Comment = require('../models/Comment');
const Post = require('../models/Post');
const logger = require('../config/logger');

class CommentService {
  static async syncPublishedCommentCount(postId) {
    const total = await Comment.getCount(postId);
    await Post.setCommentCount(postId, total);
  }

  static async createComment(data) {
    const comment = await Comment.create(data);
    await this.syncPublishedCommentCount(data.post_id);

    return comment;
  }

  static async getComment(id) {
    return await Comment.findById(id);
  }

  static async getComments(post_id, filters) {
    const comments = await Comment.findByPostId(post_id, filters);
    const total = await Comment.getCount(post_id);
    return { comments, total };
  }

  static async getAdminComments(post_id, filters) {
    const comments = await Comment.findByPostIdForAdmin(post_id, filters);
    const total = await Comment.getCountForAdmin(post_id, filters);
    return { comments, total };
  }

  static async updateComment(id, data) {
    return await Comment.update(id, data);
  }

  static async deleteComment(id) {
    const comment = await Comment.findByIdForAdmin(id);
    if (!comment) return null;
    const deleted = await Comment.delete(id);
    await this.syncPublishedCommentCount(comment.post_id);
    return deleted;
  }

  static async moderateComment(id, status) {
    const comment = await Comment.findByIdForAdmin(id);
    if (!comment) return null;

    const updated = await Comment.setStatus(id, status);
    await this.syncPublishedCommentCount(comment.post_id);
    return updated;
  }

  static async likeComment(id) {
    await Comment.incrementLikeCount(id);
  }
}

module.exports = CommentService;
