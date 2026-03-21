const axios = require('axios');
const jwt = require('jsonwebtoken');
const { getRedisClient } = require('../utils/redis');
const config = require('../config');
const logger = require('../utils/logger');
const { metrics } = require('./metrics');
const { sendError } = require('./errorHandler');

function parseAuthHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith('Agent ')) {
    return null;
  }

  const params = {};
  const paramsString = authHeader.substring(6);
  const regex = /(\w+)="([^"]+)"/g;
  let match;
  while ((match = regex.exec(paramsString)) !== null) {
    params[match[1]] = match[2];
  }
  return params;
}

function validateTimestamp(timestamp) {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.abs(now - parseInt(timestamp, 10));
  return diff <= 300;
}

async function getAgentFromCache(aid) {
  const redis = await getRedisClient();
  const cached = await redis.get(`agent:${aid}`);
  return cached ? JSON.parse(cached) : null;
}

async function cacheAgent(aid, agentData) {
  const redis = await getRedisClient();
  await redis.setEx(`agent:${aid}`, 300, JSON.stringify(agentData));
}

function revokedTokenKey(jti) {
  return `auth:revoked_token:${String(jti || '').trim()}`;
}

function agentMinIssuedAtKey(aid) {
  return `auth:agent:min_iat:${String(aid || '').trim()}`;
}

function numericClaim(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function isRevokedBearerToken(payload) {
  if (!payload?.aid) {
    return true;
  }

  const redis = await getRedisClient();

  if (payload.jti) {
    const revoked = await redis.exists(revokedTokenKey(payload.jti));
    if (revoked > 0) {
      return true;
    }
  }

  const minIssuedAt = await redis.get(agentMinIssuedAtKey(payload.aid));
  if (!minIssuedAt) {
    return false;
  }

  const minIatValue = parseInt(minIssuedAt, 10);
  if (Number.isNaN(minIatValue) || minIatValue <= 0) {
    return false;
  }

  const tokenIat = numericClaim(payload.iat);
  return tokenIat <= 0 || tokenIat < minIatValue;
}

async function fetchCurrentAgentWithBearer(token) {
  const response = await axios.get(`${config.services.identity}/api/v1/agents/me`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: Math.min(config.request.timeout, 5000),
  });
  return response.data;
}

function normalizeAccessMode(value) {
  return String(value || '').trim().toLowerCase() === 'observer' ? 'observer' : null;
}

async function verifyJwtToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
  if (!payload?.aid) return null;
  if (await isRevokedBearerToken(payload)) {
    throw new Error('token revoked');
  }

  let agent = await getAgentFromCache(payload.aid);
  if (!agent) {
    agent = await fetchCurrentAgentWithBearer(token);
    await cacheAgent(payload.aid, agent);
  }

  const accessMode = normalizeAccessMode(payload.access_mode);
  return accessMode ? { ...agent, access_mode: accessMode } : agent;
}

async function verifyAgentSignature(authParams) {
  const response = await axios.post(
    `${config.services.identity}/api/v1/agents/verify`,
    {
      aid: authParams.aid,
      signature: authParams.signature,
      timestamp: authParams.timestamp,
      nonce: authParams.nonce,
    },
    { timeout: Math.min(config.request.timeout, 5000) },
  );

  if (!response.data?.success || !response.data?.data) {
    throw new Error('Identity verification returned invalid response');
  }

  return response.data.data;
}

function authError(res, req, status, error, code, extras = {}) {
  return sendError(res, req, {
    status,
    error,
    code,
    extras,
  });
}

async function verifyAgentHeader(authHeader, requestId) {
  const authParams = parseAuthHeader(authHeader);
  if (!authParams || !authParams.aid || !authParams.signature || !authParams.timestamp || !authParams.nonce) {
    metrics.authFailuresTotal.inc({ reason: 'invalid_header' });
    return { error: { status: 401, body: { success: false, error: 'Invalid authorization header format', code: 'INVALID_AUTH_HEADER', requestId } } };
  }

  if (!validateTimestamp(authParams.timestamp)) {
    metrics.authFailuresTotal.inc({ reason: 'invalid_timestamp' });
    return { error: { status: 401, body: { success: false, error: 'Invalid or expired timestamp', code: 'INVALID_TIMESTAMP', requestId } } };
  }

  const cachedAgent = await getAgentFromCache(authParams.aid);
  if (cachedAgent) {
    return { agent: cachedAgent };
  }

  try {
    const agent = await verifyAgentSignature(authParams);
    await cacheAgent(authParams.aid, agent);
    return { agent };
  } catch (error) {
    const status = error.response?.status || 401;
    const errorBody = error.response?.data;
    logger.warn('Failed to verify agent signature', {
      aid: authParams.aid,
      status,
      error: error.message,
      requestId,
    });
    return {
      error: {
        status,
        body: {
          success: false,
          error: errorBody?.error || 'Invalid signature or agent not found',
          code: errorBody?.code || (status === 403 ? 'AGENT_INACTIVE' : 'INVALID_SIGNATURE'),
          requestId,
        },
      },
    };
  }
}

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      metrics.authFailuresTotal.inc({ reason: 'missing_header' });
      return authError(res, req, 401, 'Missing authorization header', 'MISSING_AUTH_HEADER');
    }

    let agent;
    if (authHeader.startsWith('Bearer ')) {
      try {
        agent = await verifyJwtToken(authHeader.slice(7));
      } catch (error) {
        metrics.authFailuresTotal.inc({ reason: 'invalid_token' });
        return authError(res, req, 401, 'Invalid token', 'INVALID_TOKEN');
      }
    } else if (authHeader.startsWith('Agent ')) {
      const result = await verifyAgentHeader(authHeader, req.id);
      if (result.error) {
        return sendError(res, req, {
          status: result.error.status,
          error: result.error.body.error,
          code: result.error.body.code,
          extras: Object.fromEntries(
            Object.entries(result.error.body).filter(([key]) => !['success', 'error', 'code', 'requestId'].includes(key))
          ),
        });
      }
      agent = result.agent;
    } else {
      metrics.authFailuresTotal.inc({ reason: 'unsupported_auth_type' });
      return authError(res, req, 401, 'Unsupported authorization type', 'UNSUPPORTED_AUTH_TYPE');
    }

    if (!agent) {
      metrics.authFailuresTotal.inc({ reason: 'agent_not_found' });
      return authError(res, req, 401, 'Agent not found', 'AGENT_NOT_FOUND');
    }

    if (agent.status === 'suspended' || agent.status === 'banned') {
      metrics.authFailuresTotal.inc({ reason: 'agent_blocked' });
      return authError(res, req, 403, 'Agent account is restricted', 'AGENT_RESTRICTED', { status: agent.status });
    }

    if (agent.status !== 'active') {
      metrics.authFailuresTotal.inc({ reason: 'agent_inactive' });
      return authError(res, req, 403, 'Agent account is not active', 'AGENT_INACTIVE', { status: agent.status });
    }

    req.agent = agent;
    req.auth = {
      accessMode: normalizeAccessMode(agent?.access_mode),
    };
    next();
  } catch (error) {
    logger.error('Authentication error', { error: error.message, requestId: req.id });
    metrics.authFailuresTotal.inc({ reason: 'internal_error' });
    return authError(res, req, 500, 'Authentication failed', 'AUTH_ERROR');
  }
}

async function optionalAuthenticate(req, res, next) {
  if (!req.headers.authorization) {
    return next();
  }
  return authenticate(req, res, next);
}

function allowObserverWrite(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return true;
  }

  return req.path === '/api/v1/agents/refresh' || req.path === '/api/v1/agents/logout';
}

function enforceObserverReadOnly(req, res, next) {
  if (req.auth?.accessMode !== 'observer') {
    return next();
  }

  if (allowObserverWrite(req)) {
    return next();
  }

  return authError(
    res,
    req,
    403,
    'Observer sessions are read-only',
    'OBSERVER_READ_ONLY',
    { access_mode: 'observer' },
  );
}

module.exports = {
  authenticate,
  enforceObserverReadOnly,
  optionalAuthenticate,
  parseAuthHeader,
  validateTimestamp,
  verifyAgentHeader,
};
