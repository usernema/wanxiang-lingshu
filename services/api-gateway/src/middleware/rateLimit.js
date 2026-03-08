const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { getRedisClient } = require('../utils/redis');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * 基于 Agent 信誉等级的动态限流
 */
function getReputationBasedLimit(reputation) {
  if (reputation >= 5000) {
    // 大师级别：1000 请求/分钟
    return 1000;
  } else if (reputation >= 1001) {
    // 专家级别：500 请求/分钟
    return 500;
  } else if (reputation >= 501) {
    // 贡献者级别：300 请求/分钟
    return 300;
  } else if (reputation >= 101) {
    // 活跃级别：150 请求/分钟
    return 150;
  } else {
    // 新手级别：100 请求/分钟
    return 100;
  }
}

/**
 * 创建限流中间件
 */
async function createRateLimiter() {
  const redis = await getRedisClient();

  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: async (req) => {
      // 如果有 Agent 信息，基于信誉等级限流
      if (req.agent && req.agent.reputation !== undefined) {
        const limit = getReputationBasedLimit(req.agent.reputation);
        logger.debug('Rate limit for agent', {
          aid: req.agent.aid,
          reputation: req.agent.reputation,
          limit,
        });
        return limit;
      }

      // 匿名用户或未认证用户使用默认限制
      return config.rateLimit.maxRequests;
    },
    keyGenerator: (req) => {
      // 优先使用 Agent ID，否则使用 IP
      if (req.agent && req.agent.aid) {
        return `agent:${req.agent.aid}`;
      }
      return `ip:${req.ip}`;
    },
    store: new RedisStore({
      client: redis,
      prefix: 'ratelimit:',
    }),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        key: req.agent ? req.agent.aid : req.ip,
        requestId: req.id,
      });

      res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: res.getHeader('Retry-After'),
      });
    },
    skip: (req) => {
      // 健康检查端点不限流
      return req.path === '/health' || req.path === '/metrics';
    },
  });
}

/**
 * IP 限流（防止暴力攻击）
 */
async function createIpRateLimiter() {
  const redis = await getRedisClient();

  return rateLimit({
    windowMs: 60000, // 1 分钟
    max: 200, // 每个 IP 最多 200 请求/分钟
    keyGenerator: (req) => `ip:${req.ip}`,
    store: new RedisStore({
      client: redis,
      prefix: 'ratelimit:ip:',
    }),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('IP rate limit exceeded', {
        ip: req.ip,
        requestId: req.id,
      });

      res.status(429).json({
        success: false,
        error: 'Too many requests from this IP',
        code: 'IP_RATE_LIMIT_EXCEEDED',
      });
    },
    skip: (req) => req.path === '/health' || req.path === '/metrics',
  });
}

module.exports = {
  createRateLimiter,
  createIpRateLimiter,
  getReputationBasedLimit,
};
