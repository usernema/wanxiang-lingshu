const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { getRedisClient } = require('../utils/redis');
const config = require('../config');
const logger = require('../utils/logger');
const { metrics } = require('./metrics');
const { sendError } = require('./errorHandler');

function getReputationBasedLimit(reputation) {
  if (reputation >= 5000) return 1000;
  if (reputation >= 1001) return 500;
  if (reputation >= 501) return 300;
  if (reputation >= 101) return 150;
  return config.rateLimit.profiles.default.maxRequests;
}

function buildStore(redis, prefix) {
  return new RedisStore({
    prefix,
    sendCommand: (...args) => redis.sendCommand(args),
  });
}

function keyStrategyForProfile(profile) {
  return profile?.keyStrategy || 'agentOrIp';
}

function limitKeyForRequest(req, profileName, keyStrategy) {
  if (keyStrategy === 'ip') {
    return `${profileName}:ip:${req.ip}`;
  }

  if (req.agent?.aid) {
    return `${profileName}:agent:${req.agent.aid}`;
  }

  return `${profileName}:ip:${req.ip}`;
}

function limitKeyType(req, keyStrategy) {
  if (keyStrategy === 'agentOrIp' && req.agent?.aid) {
    return 'agent';
  }

  return 'ip';
}

function limitExceededResponse(req, res, profile, keyType) {
  metrics.rateLimitExceeded.inc({ key_type: keyType });
  logger.warn('Rate limit exceeded', {
    profile,
    keyType,
    requestId: req.id,
    agent: req.agent?.aid || 'anonymous',
    path: req.path,
  });

  return sendError(res, req, {
    status: 429,
    code: 'RATE_LIMIT_EXCEEDED',
    error: 'Too many requests, please try again later',
    extras: {
      profile,
      retryAfter: res.getHeader('Retry-After'),
    },
  });
}

function skipHealthAndMetrics(req) {
  return req.path === '/health' || req.path === '/health/live' || req.path === '/health/ready' || req.path === '/health/deps' || req.path === '/livez' || req.path === '/readyz' || req.path === '/metrics';
}

function createLimiterOptions(profileName, redis) {
  const profile = config.rateLimit.profiles[profileName];
  if (!profile) {
    throw new Error(`Unknown rate limit profile: ${profileName}`);
  }

  const keyStrategy = keyStrategyForProfile(profile);
  const prefix = `ratelimit:${profileName}:`;

  return {
    windowMs: profile.windowMs,
    max: async (req) => {
      if (profileName === 'default' && req.agent?.reputation !== undefined) {
        return getReputationBasedLimit(req.agent.reputation);
      }
      return profile.maxRequests;
    },
    keyGenerator: (req) => limitKeyForRequest(req, profileName, keyStrategy),
    store: buildStore(redis, prefix),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => limitExceededResponse(req, res, profileName, limitKeyType(req, keyStrategy)),
    skip: skipHealthAndMetrics,
  };
}

async function createRateLimiter(profileName = 'default') {
  const redis = await getRedisClient();
  return rateLimit(createLimiterOptions(profileName, redis));
}

async function createProfileLimiters() {
  const profileToLimiterName = {
    default: 'defaultLimiter',
    auth: 'authLimiter',
    authBurst: 'authBurstLimiter',
    publicRead: 'publicReadLimiter',
    write: 'writeLimiter',
    authenticatedIp: 'authenticatedIpLimiter',
    internal: 'internalLimiter',
    admin: 'adminLimiter',
    health: 'healthLimiter',
  };

  const entries = await Promise.all(
    Object.entries(profileToLimiterName).map(async ([profileName, limiterName]) => (
      [limiterName, await createRateLimiter(profileName)]
    )),
  );

  return Object.fromEntries(entries);
}

module.exports = {
  createLimiterOptions,
  createProfileLimiters,
  createRateLimiter,
  getReputationBasedLimit,
};
