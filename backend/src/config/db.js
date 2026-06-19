/**
 * PostgreSQL connection pool.
 *
 * Exports a single `pool` instance configured from `config.db`.
 * The pool is shared across the entire application; callers should
 * never create their own Pool instances.
 *
 * For tenant-scoped queries use the `queryTenant` helper in
 * `src/db/queries/base.js` rather than calling `pool.query` directly.
 */

import pg from 'pg';
import { config } from './index.js';

const { Pool } = pg;

/** @type {pg.Pool} */
export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  min: config.db.poolMin,
  max: config.db.poolMax,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  // Surface connection errors immediately rather than silently queuing
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

// Log pool-level errors so they are visible in application logs
pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});
