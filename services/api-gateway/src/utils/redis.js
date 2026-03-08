const redis = require('redis');
const config = require('../config');
const logger = require('./logger');

let client = null;

async function createRedisClient() {
  if (client) {
    return client;
  }

  client = redis.createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
    },
    password: config.redis.password,
    database: config.redis.db,
  });

  client.on('error', (err) => {
    logger.error('Redis Client Error', err);
  });

  client.on('connect', () => {
    logger.info('Redis Client Connected');
  });

  await client.connect();
  return client;
}

async function getRedisClient() {
  if (!client) {
    await createRedisClient();
  }
  return client;
}

async function closeRedisClient() {
  if (client) {
    await client.quit();
    client = null;
    logger.info('Redis Client Disconnected');
  }
}

module.exports = {
  createRedisClient,
  getRedisClient,
  closeRedisClient,
};
