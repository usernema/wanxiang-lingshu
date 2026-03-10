const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const config = require('../config');
const logger = require('../utils/logger');
const { sendError } = require('../middleware/errorHandler');

function extractServiceName(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.split('.')[0];
  } catch {
    return 'unknown';
  }
}

function classifyProxyError(error) {
  const code = error?.code;
  const message = error?.message || '';

  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || message.toLowerCase().includes('timeout')) {
    return { status: 504, code: 'UPSTREAM_TIMEOUT', error: 'Upstream service timed out' };
  }

  if (['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    return { status: 502, code: 'UPSTREAM_UNAVAILABLE', error: 'Upstream service unavailable' };
  }

  return { status: 502, code: 'BAD_GATEWAY', error: 'Bad gateway' };
}

function sanitizeForwardHeaders(req) {
  return {
    'X-Request-Id': req.id,
    'X-Trace-Id': req.traceId || req.id,
    'X-Forwarded-For': req.ip,
    'X-Forwarded-Host': req.get('host'),
    'X-Forwarded-Proto': req.protocol,
  };
}

function createProxyConfig(target) {
  const service = extractServiceName(target);

  return {
    target,
    changeOrigin: true,
    timeout: config.request.connectTimeout,
    proxyTimeout: config.request.upstreamTimeout,
    onProxyReq: (proxyReq, req, res) => {
      const forwardHeaders = sanitizeForwardHeaders(req);
      Object.entries(forwardHeaders).forEach(([header, value]) => {
        if (value) proxyReq.setHeader(header, value);
      });

      if (req.agent) {
        proxyReq.setHeader('X-Agent-Id', req.agent.aid);
        proxyReq.setHeader('X-Agent-ID', req.agent.aid);
        proxyReq.setHeader('X-Agent-Reputation', req.agent.reputation ?? 0);
        if (req.agent.membership_level) proxyReq.setHeader('X-Agent-Membership-Level', req.agent.membership_level);
        if (req.agent.trust_level) proxyReq.setHeader('X-Agent-Trust-Level', req.agent.trust_level);
      }

      fixRequestBody(proxyReq, req, res);
      logger.debug('Proxying request', {
        requestId: req.id,
        method: req.method,
        path: req.path,
        target,
        service,
      });
    },
    onError: (err, req, res) => {
      const classified = config.request.classifyProxyErrors ? classifyProxyError(err) : { status: 502, code: 'BAD_GATEWAY', error: 'Bad gateway' };

      logger.error('Proxy error', {
        requestId: req.id,
        error: err.message,
        errorCode: err.code,
        target,
        service,
        path: req.path,
        classifiedCode: classified.code,
      });

      return sendError(res, req, {
        status: classified.status,
        code: classified.code,
        error: classified.error,
        extras: { service },
      });
    },
  };
}

function createRouteProxies() {
  return {
    identity: createProxyMiddleware(createProxyConfig(config.services.identity)),
    forum: createProxyMiddleware(createProxyConfig(config.services.forum)),
    credit: createProxyMiddleware(createProxyConfig(config.services.credit)),
    marketplace: createProxyMiddleware(createProxyConfig(config.services.marketplace)),
    training: createProxyMiddleware(createProxyConfig(config.services.training)),
    ranking: createProxyMiddleware(createProxyConfig(config.services.ranking)),
  };
}

module.exports = {
  classifyProxyError,
  createProxyConfig,
  createRouteProxies,
  extractServiceName,
};
