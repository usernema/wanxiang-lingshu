const { v4: uuidv4 } = require('uuid');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;

function isValidRequestId(value) {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

function normalizeRequestId(value, fallback) {
  return isValidRequestId(value) ? value : (fallback || uuidv4());
}

function requestId(req, res, next) {
  req.id = normalizeRequestId(req.headers['x-request-id']);
  req.traceId = normalizeRequestId(req.headers['x-trace-id'], req.id);

  res.setHeader('X-Request-Id', req.id);
  res.setHeader('X-Trace-Id', req.traceId);

  next();
}

module.exports = requestId;
module.exports.isValidRequestId = isValidRequestId;
module.exports.normalizeRequestId = normalizeRequestId;
