const axios = require('axios');
const { getRedisClient } = require('../utils/redis');
const config = require('../config');
const logger = require('../utils/logger');
const { metrics } = require('./metrics');

/**
 * 解析 Authorization 头
 * 格式: Agent aid="...", signature="...", timestamp="...", nonce="..."
 */
function parseAuthHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith('Agent ')) {
    return null;
  }

  const params = {};
  const paramsString = authHeader.substring(6); // 移除 "Agent "

  // 解析参数
  const regex = /(\w+)="([^"]+)"/g;
  let match;
  while ((match = regex.exec(paramsString)) !== null) {
    params[match[1]] = match[2];
  }

  return params;
}

/**
 * 验证时间戳（防重放攻击）
 */
function validateTimestamp(timestamp) {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.abs(now - parseInt(timestamp, 10));

  // 时间戳有效期：5 分钟
  return diff <= 300;
}

/**
 * 检查 nonce 是否已使用（防重放攻击）
 */
async function checkNonce(aid, nonce) {
  const redis = await getRedisClient();
  const key = `nonce:${aid}:${nonce}`;

  // 检查 nonce 是否存在
  const exists = await redis.exists(key);
  if (exists) {
    return false;
  }

  // 存储 nonce，有效期 5 分钟
  await redis.setEx(key, 300, '1');
  return true;
}

/**
 * 从缓存获取 Agent 信息
 */
async function getAgentFromCache(aid) {
  const redis = await getRedisClient();
  const key = `agent:${aid}`;

  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached);
  }

  return null;
}

/**
 * 缓存 Agent 信息
 */
async function cacheAgent(aid, agentData) {
  const redis = await getRedisClient();
  const key = `agent:${aid}`;

  // 缓存 1 小时
  await redis.setEx(key, 3600, JSON.stringify(agentData));
}

/**
 * 验证 Agent 签名
 */
async function verifyAgentSignature(authParams) {
  const { aid, signature, timestamp, nonce } = authParams;

  try {
    // 调用 Identity Service 验证签名
    const response = await axios.post(
      `${config.services.identity}/api/v1/agents/verify`,
      {
        aid,
        signature,
        timestamp,
        nonce,
      },
      {
        timeout: 5000,
      }
    );

    if (response.data.success) {
      return response.data.data;
    }

    return null;
  } catch (error) {
    logger.error('Failed to verify agent signature', {
      aid,
      error: error.message,
    });
    return null;
  }
}

/**
 * Agent 认证中间件
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      metrics.authFailuresTotal.inc({ reason: 'missing_header' });
      return res.status(401).json({
        success: false,
        error: 'Missing authorization header',
        code: 'MISSING_AUTH_HEADER',
        requestId: req.id,
      });
    }

    // 解析认证头
    const authParams = parseAuthHeader(authHeader);
    if (!authParams || !authParams.aid || !authParams.signature || !authParams.timestamp || !authParams.nonce) {
      metrics.authFailuresTotal.inc({ reason: 'invalid_header' });
      return res.status(401).json({
        success: false,
        error: 'Invalid authorization header format',
        code: 'INVALID_AUTH_HEADER',
        requestId: req.id,
      });
    }

    // 验证时间戳
    if (!validateTimestamp(authParams.timestamp)) {
      metrics.authFailuresTotal.inc({ reason: 'invalid_timestamp' });
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired timestamp',
        code: 'INVALID_TIMESTAMP',
        requestId: req.id,
      });
    }

    // 检查 nonce
    const nonceValid = await checkNonce(authParams.aid, authParams.nonce);
    if (!nonceValid) {
      metrics.authFailuresTotal.inc({ reason: 'nonce_reused' });
      return res.status(401).json({
        success: false,
        error: 'Nonce already used',
        code: 'NONCE_REUSED',
        requestId: req.id,
      });
    }

    // 尝试从缓存获取 Agent 信息
    let agent = await getAgentFromCache(authParams.aid);

    if (!agent) {
      // 验证签名并获取 Agent 信息
      agent = await verifyAgentSignature(authParams);

      if (!agent) {
        metrics.authFailuresTotal.inc({ reason: 'invalid_signature' });
        return res.status(401).json({
          success: false,
          error: 'Invalid signature or agent not found',
          code: 'INVALID_SIGNATURE',
          requestId: req.id,
        });
      }

      // 缓存 Agent 信息
      await cacheAgent(authParams.aid, agent);
    }

    // 检查 Agent 状态
    if (agent.status !== 'active') {
      metrics.authFailuresTotal.inc({ reason: 'agent_inactive' });
      return res.status(403).json({
        success: false,
        error: 'Agent account is not active',
        code: 'AGENT_INACTIVE',
        status: agent.status,
        requestId: req.id,
      });
    }

    // 检查信誉分
    if (agent.reputation < 0) {
      metrics.authFailuresTotal.inc({ reason: 'low_reputation' });
      return res.status(403).json({
        success: false,
        error: 'Agent reputation too low',
        code: 'LOW_REPUTATION',
        reputation: agent.reputation,
        requestId: req.id,
      });
    }

    // 将 Agent 信息附加到请求对象
    req.agent = agent;

    logger.debug('Agent authenticated', {
      aid: agent.aid,
      reputation: agent.reputation,
      requestId: req.id,
    });

    next();
  } catch (error) {
    logger.error('Authentication error', {
      error: error.message,
      requestId: req.id,
    });

    metrics.authFailuresTotal.inc({ reason: 'internal_error' });

    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR',
      requestId: req.id,
    });
  }
}

/**
 * 可选认证中间件（不强制要求认证）
 */
async function optionalAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    // 没有认证头，继续处理
    return next();
  }

  // 有认证头，尝试认证
  await authenticate(req, res, next);
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  parseAuthHeader,
  validateTimestamp,
  checkNonce,
};
