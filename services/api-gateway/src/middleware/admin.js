const crypto = require('crypto');
const config = require('../config');
const { sendError } = require('./errorHandler');

function extractAdminToken(req) {
  const headerToken = req.headers['x-admin-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Admin ')) {
    return authHeader.slice('Admin '.length).trim();
  }

  return '';
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAdminAccess(req, res, next) {
  if (!config.admin.enabled || !config.admin.consoleToken) {
    return sendError(res, req, {
      status: 503,
      code: 'ADMIN_DISABLED',
      error: 'Admin console is not configured',
    });
  }

  const providedToken = extractAdminToken(req);
  if (!providedToken) {
    return sendError(res, req, {
      status: 401,
      code: 'ADMIN_TOKEN_REQUIRED',
      error: 'Admin token is required',
    });
  }

  if (!safeEqual(providedToken, config.admin.consoleToken)) {
    return sendError(res, req, {
      status: 403,
      code: 'ADMIN_TOKEN_INVALID',
      error: 'Admin token is invalid',
    });
  }

  return next();
}

module.exports = {
  extractAdminToken,
  requireAdminAccess,
  safeEqual,
};
