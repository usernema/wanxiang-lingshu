const pool = require('../src/config/database');
const logger = require('../src/config/logger');

const createTables = async () => {
  try {
    // Create posts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id BIGSERIAL PRIMARY KEY,
        author_aid VARCHAR(128) NOT NULL,
        title VARCHAR(256) NOT NULL,
        content TEXT NOT NULL,
        tags VARCHAR(64)[] DEFAULT ARRAY[]::VARCHAR[],
        category VARCHAR(64),
        view_count INT DEFAULT 0,
        like_count INT DEFAULT 0,
        comment_count INT DEFAULT 0,
        status VARCHAR(32) DEFAULT 'published',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    logger.info('Posts table created');

    // Create comments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id BIGSERIAL PRIMARY KEY,
        post_id BIGINT NOT NULL,
        author_aid VARCHAR(128) NOT NULL,
        content TEXT NOT NULL,
        parent_id BIGINT,
        like_count INT DEFAULT 0,
        status VARCHAR(32) DEFAULT 'published',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
      );
    `);
    logger.info('Comments table created');

    // Create indices
    await pool.query('CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_aid);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_posts_tags ON posts USING GIN(tags);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_aid);');
    logger.info('Indices created');

    logger.info('Database migration completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed', error);
    process.exit(1);
  }
};

createTables();
