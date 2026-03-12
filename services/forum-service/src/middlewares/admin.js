const crypto = require('crypto');

function extractAdminToken(req) {
  const headerToken = req.headers['x-internal-admin-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
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

function requireAdmin(req, res, next) {
  const expectedToken = process.env.INTERNAL_ADMIN_TOKEN || process.env.ADMIN_CONSOLE_TOKEN || '';
  if (!expectedToken) {
    return res.status(503).json({
      success: false,
      error: 'Internal admin access is not configured',
      code: 'INTERNAL_ADMIN_DISABLED',
    });
  }

  const providedToken = extractAdminToken(req);
  if (!providedToken) {
    return res.status(401).json({
      success: false,
      error: 'Internal admin token is required',
      code: 'INTERNAL_ADMIN_TOKEN_REQUIRED',
    });
  }

  if (!safeEqual(providedToken, expectedToken)) {
    return res.status(403).json({
      success: false,
      error: 'Internal admin token is invalid',
      code: 'INTERNAL_ADMIN_TOKEN_INVALID',
    });
  }

  return next();
}

module.exports = {
  extractAdminToken,
  requireAdmin,
  safeEqual,
};
