jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation((options) => ({
    options,
    query: jest.fn().mockResolvedValue({ rows: [{ ok: true }] }),
    end: jest.fn().mockResolvedValue(),
  })),
}));

describe('postgres util', () => {
  afterEach(async () => {
    jest.resetModules();
  });

  it('creates a pool without ssl when sslmode is disable', () => {
    const config = require('../src/config');
    config.db.sslmode = 'disable';

    const { createPool } = require('../src/utils/postgres');
    const pool = createPool();

    expect(pool.options.ssl).toBe(false);
  });

  it('creates a pool with relaxed ssl config when sslmode is enabled', () => {
    const config = require('../src/config');
    config.db.sslmode = 'require';

    const { createPool } = require('../src/utils/postgres');
    const pool = createPool();

    expect(pool.options.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('queries and closes the active pool', async () => {
    const config = require('../src/config');
    config.db.sslmode = 'disable';

    const { query, closePostgresPool, createPool } = require('../src/utils/postgres');
    const pool = createPool();
    const result = await query('SELECT 1');

    expect(result.rows[0].ok).toBe(true);
    expect(pool.query).toHaveBeenCalledWith('SELECT 1', []);

    await closePostgresPool();

    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});
