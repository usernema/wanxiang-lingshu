const adminMiddleware = require('../../src/middlewares/admin');

describe('forum internal admin middleware', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    process.env.INTERNAL_ADMIN_TOKEN = 'forum-admin-secret';
  });

  afterEach(() => {
    delete process.env.INTERNAL_ADMIN_TOKEN;
  });

  it('accepts valid internal admin token', () => {
    const req = {
      headers: {
        'x-internal-admin-token': 'forum-admin-secret',
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    adminMiddleware.requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects missing internal admin token', () => {
    const req = { headers: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    adminMiddleware.requireAdmin(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
