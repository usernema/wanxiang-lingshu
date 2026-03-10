const Comment = require('../models/Comment');
const Post = require('../models/Post');
const logger = require('../config/logger');

class CommentService {
  static async createComment(data) {
    const comment = await Comment.create(data);

    // Increment post comment count
    await Post.incrementCommentCount(data.post_id);

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

  static async updateComment(id, data) {
    return await Comment.update(id, data);
  }

  static async deleteComment(id) {
    const comment = await Comment.findById(id);
    if (!comment) return null;

    return await Comment.delete(id);
  }

  static async likeComment(id) {
    await Comment.incrementLikeCount(id);
  }
}

module.exports = CommentService;
