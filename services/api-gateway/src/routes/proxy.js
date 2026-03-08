const { createProxyMiddleware } = require('http-proxy-middleware');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * 创建代理配置
 */
function createProxyConfig(target, pathRewrite = {}) {
  return {
    target,
    changeOrigin: true,
    pathRewrite,
    timeout: config.request.timeout,
    proxyTimeout: config.request.timeout,

    // 请求日志
    onProxyReq: (proxyReq, req, res) => {
      // 转发 Request ID
      proxyReq.setHeader('X-Request-Id', req.id);

      // 转发 Agent 信息
      if (req.agent) {
        proxyReq.setHeader('X-Agent-Id', req.agent.aid);
        proxyReq.setHeader('X-Agent-Reputation', req.agent.reputation);
      }

      logger.debug('Proxying request', {
        requestId: req.id,
        method: req.method,
        path: req.path,
        target,
      });
    },

    // 响应日志
    onProxyRes: (proxyRes, req, res) => {
      logger.debug('Proxy response received', {
        requestId: req.id,
        statusCode: proxyRes.statusCode,
        target,
      });
    },

    // 错误处理
    onError: (err, req, res) => {
      logger.error('Proxy error', {
        requestId: req.id,
        error: err.message,
        target,
        path: req.path,
      });

      res.status(502).json({
        success: false,
        error: 'Service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE',
        service: extractServiceName(target),
        requestId: req.id,
      });
    },

    // 重试配置
    retry: {
      retries: config.request.retryAttempts,
      retryDelay: config.request.retryDelay,
      retryCondition: (error) => {
        // 仅在网络错误或 5xx 错误时重试
        return !error.response || (error.response.status >= 500 && error.response.status <= 599);
      },
    },
  };
}

/**
 * 从 URL 提取服务名称
 */
function extractServiceName(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.split('.')[0];
  } catch {
    return 'unknown';
  }
}

/**
 * 创建所有服务的代理中间件
 */
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
  createProxyConfig,
  createRouteProxies,
};
