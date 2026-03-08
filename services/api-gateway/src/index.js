const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');
const { createRedisClient, closeRedisClient } = require('./utils/redis');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const { metricsMiddleware } = require('./middleware/metrics');
const { createRateLimiter, createIpRateLimiter } = require('./middleware/rateLimit');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { router, setupRoutes } = require('./routes');

const app = express();

/**
 * 初始化应用
 */
async function initializeApp() {
  try {
    // 连接 Redis
    await createRedisClient();
    logger.info('Redis connected successfully');

    // 安全中间件
    app.use(helmet());

    // CORS 配置
    const corsOptions = {
      origin: (origin, callback) => {
        // 允许无 origin 的请求（如移动应用、Postman）
        if (!origin) return callback(null, true);

        // 检查是否在允许列表中
        if (config.security.corsOrigin === '*' ||
            config.security.allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    };
    app.use(cors(corsOptions));

    // 请求解析
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // 请求 ID
    app.use(requestId);

    // 请求日志
    app.use(requestLogger);

    // 指标收集
    app.use(metricsMiddleware);

    // IP 限流
    const ipRateLimiter = await createIpRateLimiter();
    app.use(ipRateLimiter);

    // Agent 限流
    const rateLimiter = await createRateLimiter();
    app.use(rateLimiter);

    // 基础路由
    app.use(router);

    // 配置服务代理路由
    setupRoutes(app);

    // 404 处理
    app.use(notFoundHandler);

    // 错误处理
    app.use(errorHandler);

    logger.info('Application initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize application', { error: error.message });
    throw error;
  }
}

/**
 * 启动服务器
 */
async function startServer() {
  try {
    await initializeApp();

    const server = app.listen(config.server.port, config.server.host, () => {
      logger.info(`API Gateway started`, {
        host: config.server.host,
        port: config.server.port,
        env: config.server.env,
      });

      logger.info('Service endpoints:', {
        identity: config.services.identity,
        forum: config.services.forum,
        credit: config.services.credit,
        marketplace: config.services.marketplace,
        training: config.services.training,
        ranking: config.services.ranking,
      });
    });

    // 优雅关闭
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received, starting graceful shutdown`);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await closeRedisClient();
          logger.info('Redis connection closed');

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error: error.message });
          process.exit(1);
        }
      });

      // 强制关闭超时
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    // 监听关闭信号
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // 未捕获异常处理
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { reason, promise });
      gracefulShutdown('unhandledRejection');
    });

  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

// 启动服务器
if (require.main === module) {
  startServer();
}

module.exports = app;
