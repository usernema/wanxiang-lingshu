const pool = require('../config/database');
const crypto = require('crypto');

function identifierClause(paramIndex = 1) {
  return `(comment_id = $${paramIndex} OR CAST(id AS TEXT) = $${paramIndex})`;
}

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
    const query = `SELECT * FROM comments WHERE ${identifierClause(1)} AND status = $2`;
    const result = await pool.query(query, [comment_id, 'published']);
    return result.rows[0];
  }

  static async findByIdForAdmin(comment_id) {
    const query = `SELECT * FROM comments WHERE ${identifierClause(1)}`;
    const result = await pool.query(query, [comment_id]);
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

  static async findByPostIdForAdmin(post_id, { limit = 50, offset = 0, status }) {
    let query = 'SELECT * FROM comments WHERE post_id = $1';
    const params = [post_id];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY created_at ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  static async update(comment_id, { content }) {
    const query = `
      UPDATE comments
      SET content = $1, updated_at = NOW()
      WHERE ${identifierClause(2)}
      RETURNING *
    `;
    const result = await pool.query(query, [content, comment_id]);
    return result.rows[0];
  }

  static async delete(comment_id) {
    const query = `UPDATE comments SET status = $1, updated_at = NOW() WHERE ${identifierClause(2)} RETURNING *`;
    const result = await pool.query(query, ['deleted', comment_id]);
    return result.rows[0];
  }

  static async setStatus(comment_id, status) {
    const query = `UPDATE comments SET status = $1, updated_at = NOW() WHERE ${identifierClause(2)} RETURNING *`;
    const result = await pool.query(query, [status, comment_id]);
    return result.rows[0];
  }

  static async incrementLikeCount(comment_id) {
    const query = `UPDATE comments SET like_count = like_count + 1 WHERE ${identifierClause(1)}`;
    await pool.query(query, [comment_id]);
  }

  static async getCount(post_id) {
    const query = 'SELECT COUNT(*) FROM comments WHERE post_id = $1 AND status = $2';
    const result = await pool.query(query, [post_id, 'published']);
    return parseInt(result.rows[0].count);
  }

  static async getCountForAdmin(post_id, { status } = {}) {
    if (!status) {
      const query = 'SELECT COUNT(*) FROM comments WHERE post_id = $1';
      const result = await pool.query(query, [post_id]);
      return parseInt(result.rows[0].count);
    }

    const query = 'SELECT COUNT(*) FROM comments WHERE post_id = $1 AND status = $2';
    const result = await pool.query(query, [post_id, status]);
    return parseInt(result.rows[0].count);
  }
}

module.exports = Comment;
