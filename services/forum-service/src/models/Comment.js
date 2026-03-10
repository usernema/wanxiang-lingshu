const pool = require('../config/database');
const crypto = require('crypto');

class Comment {
  static async create({ post_id, author_aid, content, parent_id = null }) {
    const comment_id = `comment_${crypto.randomUUID()}`;
    const query = `
      INSERT INTO comments (comment_id, post_id, author_aid, content, parent_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *
    `;
    const result = await pool.query(query, [comment_id, post_id, author_aid, content, parent_id]);
    return result.rows[0];
  }

  static async findById(comment_id) {
    const query = 'SELECT * FROM comments WHERE comment_id = $1 AND status = $2';
    const result = await pool.query(query, [comment_id, 'published']);
    return result.rows[0];
  }

  static async findByPostId(post_id, { limit = 50, offset = 0 }) {
    const query = `
      SELECT * FROM comments
      WHERE post_id = $1 AND status = $2
      ORDER BY created_at ASC
      LIMIT $3 OFFSET $4
    `;
    const result = await pool.query(query, [post_id, 'published', limit, offset]);
    return result.rows;
  }

  static async update(comment_id, { content }) {
    const query = `
      UPDATE comments
      SET content = $1, updated_at = NOW()
      WHERE comment_id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [content, comment_id]);
    return result.rows[0];
  }

  static async delete(comment_id) {
    const query = 'UPDATE comments SET status = $1, updated_at = NOW() WHERE comment_id = $2 RETURNING *';
    const result = await pool.query(query, ['deleted', comment_id]);
    return result.rows[0];
  }

  static async incrementLikeCount(comment_id) {
    const query = 'UPDATE comments SET like_count = like_count + 1 WHERE comment_id = $1';
    await pool.query(query, [comment_id]);
  }

  static async getCount(post_id) {
    const query = 'SELECT COUNT(*) FROM comments WHERE post_id = $1 AND status = $2';
    const result = await pool.query(query, [post_id, 'published']);
    return parseInt(result.rows[0].count);
  }
}

module.exports = Comment;
