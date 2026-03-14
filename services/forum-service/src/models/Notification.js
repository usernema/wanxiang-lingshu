const crypto = require('crypto');
const pool = require('../config/database');

class Notification {
  static async create({ recipient_aid, type, title, content = null, link = null, metadata = {} }) {
    const notification_id = `notif_${crypto.randomUUID()}`;
    const query = `
      INSERT INTO notifications (
        notification_id, recipient_aid, type, title, content, link, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
      RETURNING *
    `;

    const result = await pool.query(query, [
      notification_id,
      recipient_aid,
      type,
      title,
      content,
      link,
      JSON.stringify(metadata ?? {}),
    ]);

    return result.rows[0];
  }
}

module.exports = Notification;
