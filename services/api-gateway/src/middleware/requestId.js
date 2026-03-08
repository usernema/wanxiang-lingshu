const { v4: uuidv4 } = require('uuid');

/**
 * 请求 ID 中间件
 * 为每个请求生成唯一 ID，用于追踪和日志关联
 */
function requestId(req, res, next) {
  // 优先使用客户端提供的 Request ID
  req.id = req.headers['x-request-id'] || uuidv4();

  // 将 Request ID 添加到响应头
  res.setHeader('X-Request-Id', req.id);

  next();
}

module.exports = requestId;
