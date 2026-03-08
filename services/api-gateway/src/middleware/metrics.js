const promClient = require('prom-client');
const logger = require('../utils/logger');

// 创建 Registry
const register = new promClient.Registry();

// 添加默认指标
promClient.collectDefaultMetrics({ register });

// HTTP 请求总数
const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
  registers: [register],
});

// HTTP 请求持续时间
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// 活跃连接数
const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register],
});

// Agent 请求计数
const agentRequestsTotal = new promClient.Counter({
  name: 'agent_requests_total',
  help: 'Total number of requests by agent',
  labelNames: ['aid', 'reputation_level'],
  registers: [register],
});

// 限流计数
const rateLimitExceeded = new promClient.Counter({
  name: 'rate_limit_exceeded_total',
  help: 'Total number of rate limit exceeded events',
  labelNames: ['key_type'],
  registers: [register],
});

// 认证失败计数
const authFailuresTotal = new promClient.Counter({
  name: 'auth_failures_total',
  help: 'Total number of authentication failures',
  labelNames: ['reason'],
  registers: [register],
});

/**
 * 获取信誉等级
 */
function getReputationLevel(reputation) {
  if (reputation >= 5000) return 'master';
  if (reputation >= 1001) return 'expert';
  if (reputation >= 501) return 'contributor';
  if (reputation >= 101) return 'active';
  return 'newbie';
}

/**
 * 指标收集中间件
 */
function metricsMiddleware(req, res, next) {
  // 增加活跃连接数
  activeConnections.inc();

  // 记录请求开始时间
  const start = Date.now();

  // 监听响应完成
  res.on('finish', () => {
    // 减少活跃连接数
    activeConnections.dec();

    // 计算请求持续时间
    const duration = (Date.now() - start) / 1000;

    // 提取路由模式（移除动态参数）
    const route = req.route ? req.route.path : req.path;
    const service = extractServiceName(req.path);

    // 记录 HTTP 请求指标
    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode,
      service,
    });

    httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode,
        service,
      },
      duration
    );

    // 记录 Agent 请求指标
    if (req.agent) {
      const reputationLevel = getReputationLevel(req.agent.reputation);
      agentRequestsTotal.inc({
        aid: req.agent.aid,
        reputation_level: reputationLevel,
      });
    }

    // 记录日志
    logger.debug('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration.toFixed(3)}s`,
      requestId: req.id,
    });
  });

  next();
}

/**
 * 从路径提取服务名称
 */
function extractServiceName(path) {
  const match = path.match(/^\/api\/v\d+\/(\w+)/);
  return match ? match[1] : 'unknown';
}

/**
 * 指标端点处理器
 */
async function metricsHandler(req, res) {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    logger.error('Failed to generate metrics', { error: error.message });
    res.status(500).end('Failed to generate metrics');
  }
}

module.exports = {
  metricsMiddleware,
  metricsHandler,
  register,
  metrics: {
    httpRequestsTotal,
    httpRequestDuration,
    activeConnections,
    agentRequestsTotal,
    rateLimitExceeded,
    authFailuresTotal,
  },
};
