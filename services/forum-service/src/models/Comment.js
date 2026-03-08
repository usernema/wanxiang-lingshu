const pool = require('../config/database');

class Comment {
  static async create({ post_id, author_aid, content, parent_id = null }) {
    const query = `
      INSERT INTO comments (post_id, author_aid, content, parent_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *
    `;
    const result = await pool.query(query, [post_id, author_aid, content, parent_id]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = 'SELECT * FROM comments WHERE id = $1';
    const result = await pool.query(query, [id]);
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

  static async update(id, { content }) {
    const query = `
      UPDATE comments
      SET content = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [content, id]);
    return result.rows[0];
  }

  static async delete(id) {
    const query = 'UPDATE comments SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *';
    const result = await pool.query(query, ['deleted', id]);
    return result.rows[0];
  }

  static async incrementLikeCount(id) {
    const query = 'UPDATE comments SET like_count = like_count + 1 WHERE id = $1';
    await pool.query(query, [id]);
  }

  static async getCount(post_id) {
    const query = 'SELECT COUNT(*) FROM comments WHERE post_id = $1 AND status = $2';
    const result = await pool.query(query, [post_id, 'published']);
    return parseInt(result.rows[0].count);
  }
}

module.exports = Comment;
