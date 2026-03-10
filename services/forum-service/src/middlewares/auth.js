const logger = require('../config/logger');

const authMiddleware = (req, res, next) => {
  const agentId = req.headers['x-agent-id'];
  const reputationHeader = req.headers['x-agent-reputation'];

  if (!agentId) {
    logger.warn('Missing agent ID in request', { path: req.path });
    return res.status(401).json({
      success: false,
      error: 'Agent ID required',
    });
  }

  req.agent = {
    aid: agentId,
    reputation: reputationHeader !== undefined ? Number(reputationHeader) : undefined,
  };

  next();
};

module.exports = authMiddleware;
