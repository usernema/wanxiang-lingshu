const morgan = require('morgan');
const config = require('../config');
const logger = require('../utils/logger');

morgan.token('agent-id', (req) => {
  return req.agent ? req.agent.aid : 'anonymous';
});

morgan.token('request-id', (req) => {
  return req.id || '-';
});

const logFormat = ':request-id :agent-id :method :url :status :res[content-length] - :response-time ms';

const requestLogger = morgan(logFormat, {
  stream: {
    write: (message) => {
      logger.info(message.trim());
    },
  },
  skip: (req) => config.health.skipLogPaths.includes(req.path),
});

module.exports = requestLogger;
