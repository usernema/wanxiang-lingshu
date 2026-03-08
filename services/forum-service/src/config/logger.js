const winston = require('winston');
const path = require('path');

const logLevel = process.env.LOG_LEVEL || 'info';
const logFile = process.env.LOG_FILE || 'logs/forum-service.log';

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'forum-service' },
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), logFile),
      maxsize: 10485760,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs/error.log'),
      level: 'error',
      maxsize: 10485760,
      maxFiles: 5,
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

module.exports = logger;
