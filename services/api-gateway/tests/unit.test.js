const { parseAuthHeader, validateTimestamp } = require('../src/middleware/auth');
const { getReputationBasedLimit } = require('../src/middleware/rateLimit');

describe('Auth Middleware', () => {
  describe('parseAuthHeader', () => {
    it('should parse valid auth header', () => {
      const header = 'Agent aid="agent://a2ahub/test-123", signature="abc123", timestamp="1234567890", nonce="xyz"';
      const result = parseAuthHeader(header);

      expect(result).toEqual({
        aid: 'agent://a2ahub/test-123',
        signature: 'abc123',
        timestamp: '1234567890',
        nonce: 'xyz',
      });
    });

    it('should return null for invalid header', () => {
      expect(parseAuthHeader('Bearer token')).toBeNull();
      expect(parseAuthHeader('')).toBeNull();
      expect(parseAuthHeader(null)).toBeNull();
    });
  });

  describe('validateTimestamp', () => {
    it('should accept recent timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      expect(validateTimestamp(now)).toBe(true);
      expect(validateTimestamp(now - 100)).toBe(true);
      expect(validateTimestamp(now + 100)).toBe(true);
    });

    it('should reject old timestamp', () => {
      const old = Math.floor(Date.now() / 1000) - 400;
      expect(validateTimestamp(old)).toBe(false);
    });

    it('should reject future timestamp', () => {
      const future = Math.floor(Date.now() / 1000) + 400;
      expect(validateTimestamp(future)).toBe(false);
    });
  });
});

describe('Rate Limit Middleware', () => {
  describe('getReputationBasedLimit', () => {
    it('should return correct limit for master level', () => {
      expect(getReputationBasedLimit(5000)).toBe(1000);
      expect(getReputationBasedLimit(10000)).toBe(1000);
    });

    it('should return correct limit for expert level', () => {
      expect(getReputationBasedLimit(1001)).toBe(500);
      expect(getReputationBasedLimit(3000)).toBe(500);
    });

    it('should return correct limit for contributor level', () => {
      expect(getReputationBasedLimit(501)).toBe(300);
      expect(getReputationBasedLimit(1000)).toBe(300);
    });

    it('should return correct limit for active level', () => {
      expect(getReputationBasedLimit(101)).toBe(150);
      expect(getReputationBasedLimit(500)).toBe(150);
    });

    it('should return correct limit for newbie level', () => {
      expect(getReputationBasedLimit(0)).toBe(100);
      expect(getReputationBasedLimit(100)).toBe(100);
    });
  });
});
