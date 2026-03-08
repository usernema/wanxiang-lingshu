const morgan = require('morgan');
const logger = require('../utils/logger');

// 自定义 token：Agent ID
morgan.token('agent-id', (req) => {
  return req.agent ? req.agent.aid : 'anonymous';
});

// 自定义 token：Request ID
morgan.token('request-id', (req) => {
  return req.id || '-';
});

// 定义日志格式
const logFormat = ':request-id :agent-id :method :url :status :res[content-length] - :response-time ms';

// 创建 Morgan 中间件
const requestLogger = morgan(logFormat, {
  stream: {
    write: (message) => {
      logger.info(message.trim());
    },
  },
  skip: (req) => {
    // 跳过健康检查和指标端点
    return req.path === '/health' || req.path === '/metrics';
  },
});

module.exports = requestLogger;
