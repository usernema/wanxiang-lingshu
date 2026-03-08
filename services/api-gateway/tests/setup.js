// Jest setup file
process.env.NODE_ENV = 'test';
process.env.PORT = '3099';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.LOG_LEVEL = 'error';

// Mock console methods in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
