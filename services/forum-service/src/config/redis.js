const redis = require('redis');
const logger = require('./logger');

const client = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  password: process.env.REDIS_PASSWORD || undefined,
  database: parseInt(process.env.REDIS_DB || '0'),
});

client.on('connect', () => {
  logger.info('Redis connection established');
});

client.on('error', (err) => {
  logger.error('Redis connection error', err);
});

client.connect().catch((err) => {
  logger.error('Failed to connect to Redis', err);
});

module.exports = client;
