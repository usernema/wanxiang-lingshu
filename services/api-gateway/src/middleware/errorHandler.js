const config = require('../config');
const logger = require('../utils/logger');

function buildErrorResponse(req, options = {}) {
  const status = options.status || options.statusCode || 500;
  const requestId = req?.id || req?.headers?.['x-request-id'] || null;
  const shouldExposeStack = options.includeStack ?? (!config.server.isProductionLike && status >= 500);

  return {
    success: false,
    error: options.error || 'Internal server error',
    code: options.code || 'INTERNAL_ERROR',
    requestId,
    ...(options.extras || {}),
    ...(shouldExposeStack && options.stack ? { stack: options.stack } : {}),
  };
}

function sendError(res, req, options = {}) {
  const status = options.status || options.statusCode || 500;
  return res.status(status).json(buildErrorResponse(req, options));
}

function createHttpError(status, code, error, extras = {}) {
  const err = new Error(error);
  err.status = status;
  err.code = code;
  err.extras = extras;
  return err;
}

function notFoundHandler(req, res) {
  return sendError(res, req, {
    status: 404,
    code: 'NOT_FOUND',
    error: 'Resource not found',
    extras: { path: req.path },
  });
}

function normalizeError(err) {
  if (err.code === 'CORS_ORIGIN_DENIED' || err.message === 'Not allowed by CORS') {
    return { status: 403, code: 'CORS_ORIGIN_DENIED', error: 'Origin not allowed', extras: err.extras };
  }

  if (err.type === 'entity.too.large') {
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', error: 'Request body too large', extras: err.extras };
  }

  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400 && 'body' in err)) {
    return { status: 400, code: 'MALFORMED_JSON', error: 'Malformed JSON request body', extras: err.extras };
  }

  if (err.name === 'ValidationError') {
    return { status: 400, code: 'VALIDATION_ERROR', error: err.message, extras: err.extras };
  }

  if (err.name === 'UnauthorizedError') {
    return { status: 401, code: 'UNAUTHORIZED', error: 'Invalid or expired token', extras: err.extras };
  }

  if (err.name === 'ForbiddenError') {
    return { status: 403, code: 'FORBIDDEN', error: 'Access denied', extras: err.extras };
  }

  return {
    status: err.statusCode || err.status || 500,
    code: err.code || 'INTERNAL_ERROR',
    error: err.statusCode || err.status ? (err.message || 'Request failed') : 'Internal server error',
    extras: err.extras,
  };
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const normalized = normalizeError(err);

  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    requestId: req.id,
    path: req.path,
    method: req.method,
    statusCode: normalized.status,
    code: normalized.code,
    agent: req.agent ? req.agent.aid : 'anonymous',
  });

  return sendError(res, req, {
    status: normalized.status,
    code: normalized.code,
    error: normalized.error,
    extras: normalized.extras,
    stack: err.stack,
  });
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  asyncHandler,
  buildErrorResponse,
  createHttpError,
  errorHandler,
  notFoundHandler,
  sendError,
};
