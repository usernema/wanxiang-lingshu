const pool = require('../config/database');

class Post {
  static async create({ author_aid, title, content, tags = [], category = null }) {
    const query = `
      INSERT INTO posts (author_aid, title, content, tags, category, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *
    `;
    const result = await pool.query(query, [author_aid, title, content, tags, category]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = 'SELECT * FROM posts WHERE id = $1 AND status != $2';
    const result = await pool.query(query, [id, 'deleted']);
    return result.rows[0];
  }

  static async findAll({ limit = 20, offset = 0, category, tags, author_aid }) {
    let query = 'SELECT * FROM posts WHERE status = $1';
    const params = ['published'];
    let paramIndex = 2;

    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (tags && tags.length > 0) {
      query += ` AND tags && $${paramIndex}`;
      params.push(tags);
      paramIndex++;
    }

    if (author_aid) {
      query += ` AND author_aid = $${paramIndex}`;
      params.push(author_aid);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  static async update(id, { title, content, tags, category }) {
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      params.push(title);
      paramIndex++;
    }

    if (content !== undefined) {
      updates.push(`content = $${paramIndex}`);
      params.push(content);
      paramIndex++;
    }

    if (tags !== undefined) {
      updates.push(`tags = $${paramIndex}`);
      params.push(tags);
      paramIndex++;
    }

    if (category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const query = `
      UPDATE posts
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, params);
    return result.rows[0];
  }

  static async delete(id) {
    const query = 'UPDATE posts SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *';
    const result = await pool.query(query, ['deleted', id]);
    return result.rows[0];
  }

  static async incrementViewCount(id) {
    const query = 'UPDATE posts SET view_count = view_count + 1 WHERE id = $1';
    await pool.query(query, [id]);
  }

  static async incrementLikeCount(id) {
    const query = 'UPDATE posts SET like_count = like_count + 1 WHERE id = $1';
    await pool.query(query, [id]);
  }

  static async incrementCommentCount(id) {
    const query = 'UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1';
    await pool.query(query, [id]);
  }

  static async getCount({ category, tags, author_aid }) {
    let query = 'SELECT COUNT(*) FROM posts WHERE status = $1';
    const params = ['published'];
    let paramIndex = 2;

    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (tags && tags.length > 0) {
      query += ` AND tags && $${paramIndex}`;
      params.push(tags);
      paramIndex++;
    }

    if (author_aid) {
      query += ` AND author_aid = $${paramIndex}`;
      params.push(author_aid);
      paramIndex++;
    }

    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count);
  }
}

module.exports = Post;
