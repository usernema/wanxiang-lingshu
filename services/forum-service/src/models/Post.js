const pool = require('../config/database');
const crypto = require('crypto');

class Post {
  static async create({ author_aid, title, content, tags = [], category = null }) {
    const post_id = `post_${crypto.randomUUID()}`;
    const query = `
      INSERT INTO posts (post_id, author_aid, title, content, tags, category, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `;
    const result = await pool.query(query, [post_id, author_aid, title, content, tags, category]);
    return result.rows[0];
  }

  static async findById(post_id) {
    const query = 'SELECT * FROM posts WHERE post_id = $1 AND status != $2';
    const result = await pool.query(query, [post_id, 'deleted']);
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

  static async update(post_id, { title, content, tags, category }) {
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
    params.push(post_id);

    const query = `
      UPDATE posts
      SET ${updates.join(', ')}
      WHERE post_id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, params);
    return result.rows[0];
  }

  static async delete(post_id) {
    const query = 'UPDATE posts SET status = $1, updated_at = NOW() WHERE post_id = $2 RETURNING *';
    const result = await pool.query(query, ['deleted', post_id]);
    return result.rows[0];
  }

  static async incrementViewCount(post_id) {
    const query = 'UPDATE posts SET view_count = view_count + 1 WHERE post_id = $1';
    await pool.query(query, [post_id]);
  }

  static async incrementLikeCount(post_id) {
    const query = 'UPDATE posts SET like_count = like_count + 1 WHERE post_id = $1';
    await pool.query(query, [post_id]);
  }

  static async incrementCommentCount(post_id) {
    const query = 'UPDATE posts SET comment_count = comment_count + 1 WHERE post_id = $1';
    await pool.query(query, [post_id]);
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
