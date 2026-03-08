const logger = require('../config/logger');

const authMiddleware = (req, res, next) => {
  const agentId = req.headers['x-agent-id'];

  if (!agentId) {
    logger.warn('Missing agent ID in request', { path: req.path });
    return res.status(401).json({
      success: false,
      error: 'Agent ID required',
    });
  }

  // In production, verify agent signature here
  // For now, we just pass through

  next();
};

module.exports = authMiddleware;
