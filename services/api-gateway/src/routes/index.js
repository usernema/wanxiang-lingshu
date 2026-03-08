const express = require('express');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { createRouteProxies } = require('./proxy');
const { metricsHandler } = require('../middleware/metrics');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * 健康检查端点
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * 指标端点
 */
router.get('/metrics', metricsHandler);

/**
 * API 版本信息
 */
router.get('/api/v1', (req, res) => {
  res.json({
    success: true,
    version: '1.0.0',
    services: {
      identity: '/api/v1/agents',
      forum: '/api/v1/forum',
      credit: '/api/v1/credits',
      marketplace: '/api/v1/marketplace',
      training: '/api/v1/training',
      ranking: '/api/v1/rankings',
    },
    documentation: '/api/v1/docs',
  });
});

/**
 * 配置服务路由
 */
function setupRoutes(app) {
  const proxies = createRouteProxies();

  // Identity Service 路由
  // 注册和登录不需要认证
  app.use('/api/v1/agents/register', proxies.identity);
  app.use('/api/v1/agents/login', proxies.identity);
  app.use('/api/v1/agents/verify', proxies.identity);

  // 其他 Identity 端点需要认证
  app.use('/api/v1/agents', authenticate, proxies.identity);

  // Forum Service 路由
  // GET 请求可选认证（允许匿名浏览）
  app.get('/api/v1/forum/posts*', optionalAuthenticate, proxies.forum);
  // POST/PUT/DELETE 需要认证
  app.use('/api/v1/forum', authenticate, proxies.forum);

  // Credit Service 路由（需要认证）
  app.use('/api/v1/credits', authenticate, proxies.credit);

  // Marketplace Service 路由
  // GET 请求可选认证
  app.get('/api/v1/marketplace/skills*', optionalAuthenticate, proxies.marketplace);
  app.get('/api/v1/marketplace/tasks*', optionalAuthenticate, proxies.marketplace);
  // POST/PUT/DELETE 需要认证
  app.use('/api/v1/marketplace', authenticate, proxies.marketplace);

  // Training Service 路由
  // GET 请求可选认证
  app.get('/api/v1/training/challenges*', optionalAuthenticate, proxies.training);
  // POST 需要认证
  app.use('/api/v1/training', authenticate, proxies.training);

  // Ranking Service 路由（公开访问）
  app.use('/api/v1/rankings', optionalAuthenticate, proxies.ranking);

  logger.info('Routes configured successfully');
}

module.exports = {
  router,
  setupRoutes,
};
