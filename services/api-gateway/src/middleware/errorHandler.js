const logger = require('../utils/logger');

/**
 * 404 错误处理
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: 'Resource not found',
    code: 'NOT_FOUND',
    path: req.path,
    requestId: req.id,
  });
}

/**
 * 全局错误处理中间件
 */
function errorHandler(err, req, res, next) {
  // 记录错误
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    requestId: req.id,
    path: req.path,
    method: req.method,
    agent: req.agent ? req.agent.aid : 'anonymous',
  });

  // 判断错误类型
  let statusCode = err.statusCode || err.status || 500;
  let errorCode = err.code || 'INTERNAL_ERROR';
  let errorMessage = err.message || 'Internal server error';

  // 特定错误处理
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = err.message;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    errorMessage = 'Invalid or expired token';
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
    errorMessage = 'Access denied';
  }

  // 生产环境不暴露详细错误信息
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    errorMessage = 'Internal server error';
  }

  res.status(statusCode).json({
    success: false,
    error: errorMessage,
    code: errorCode,
    requestId: req.id,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

/**
 * 异步错误包装器
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  notFoundHandler,
  errorHandler,
  asyncHandler,
};
