const { Pool } = require('pg');
const config = require('../config');

let pool;

function getSslConfig() {
  const mode = String(config.db.sslmode || 'disable').toLowerCase();
  if (mode === 'disable') return false;
  return { rejectUnauthorized: false };
}

function createPool() {
  if (pool) return pool;

  pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    ssl: getSslConfig(),
    max: config.db.maxConnections,
    idleTimeoutMillis: config.db.idleTimeoutMs,
    connectionTimeoutMillis: config.db.connectionTimeoutMs,
  });

  return pool;
}

async function query(text, params = []) {
  const activePool = createPool();
  return activePool.query(text, params);
}

async function closePostgresPool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

module.exports = {
  closePostgresPool,
  createPool,
  query,
};
