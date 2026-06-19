/**
 * Base tenant-scoped query helper.
 *
 * All data-access functions that touch tenant-scoped tables
 * (`shops`, `products`, `orders`, `order_status_history`, `receipts`)
 * MUST use `queryTenant` instead of calling `pool.query` directly.
 *
 * This provides two layers of tenant isolation:
 *   1. Application layer  — `WHERE tenant_id = $N` appended to every query.
 *   2. PostgreSQL RLS     — `SET LOCAL app.current_tenant_id` activates the
 *                           `tenant_isolation` RLS policy as a safety net.
 *
 * Requirements: 7.2, 7.5
 */

import { pool } from '../../config/db.js';

/**
 * Execute a tenant-scoped SQL query inside a dedicated client connection.
 *
 * The function:
 *   1. Checks out a client from the pool.
 *   2. Begins a transaction.
 *   3. Sets `app.current_tenant_id` as a LOCAL session variable so that
 *      PostgreSQL RLS policies can read it via `current_setting(...)`.
 *   4. Appends a `tenant_id = $<N>` filter to the caller's query.
 *   5. Commits and releases the client.
 *   6. Rolls back and releases on any error.
 *
 * @param {string}  sql       - Parameterised SQL statement.  Must NOT already
 *                              contain a `tenant_id` filter — this helper adds
 *                              one automatically.
 * @param {Array}   params    - Positional parameters for the SQL statement
 *                              (i.e. the values for $1, $2, …).
 * @param {string}  tenantId  - UUID of the authenticated tenant.  Throws if
 *                              falsy so callers cannot accidentally omit it.
 * @returns {Promise<pg.QueryResult>}
 *
 * @throws {Error} When `tenantId` is missing/falsy.
 * @throws {Error} When the database query fails (original pg error is re-thrown).
 */
export async function queryTenant(sql, params, tenantId) {
  if (!tenantId) {
    throw new Error('queryTenant: tenantId is required but was not provided');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Activate the RLS policy for this transaction
    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant_id',
      tenantId,
    ]);

    // Append the tenant_id filter as the next positional parameter
    const tenantParamIndex = params.length + 1;
    const tenantFilteredSql = appendTenantFilter(sql, tenantParamIndex);
    const tenantFilteredParams = [...params, tenantId];

    const result = await client.query(tenantFilteredSql, tenantFilteredParams);

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute a raw (non-tenant-scoped) query using the shared pool.
 *
 * Use this ONLY for queries that genuinely do not require tenant scoping,
 * such as platform-admin operations, user authentication lookups, or
 * queries on non-tenant tables (`users`, `approval_requests`, etc.).
 *
 * @param {string} sql
 * @param {Array}  [params=[]]
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(sql, params = []) {
  return pool.query(sql, params);
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Append a `tenant_id = $N` clause to an existing SQL statement.
 *
 * Handles the three most common statement shapes:
 *   - SELECT … WHERE …  → AND tenant_id = $N
 *   - SELECT … (no WHERE) → WHERE tenant_id = $N
 *   - INSERT … RETURNING … → unchanged (tenant_id must be in the VALUES list)
 *   - UPDATE … SET … WHERE … → AND tenant_id = $N
 *   - DELETE … WHERE … → AND tenant_id = $N
 *
 * For INSERT statements the caller is responsible for including `tenant_id`
 * in the column list and passing `tenantId` as one of the `params`.  This
 * function does not modify INSERT statements.
 *
 * @param {string} sql
 * @param {number} paramIndex  - The positional index for the new parameter.
 * @returns {string}
 */
function appendTenantFilter(sql, paramIndex) {
  const normalised = sql.trim();
  const upper = normalised.toUpperCase();

  // INSERT statements: tenant_id must be supplied by the caller in VALUES
  if (upper.startsWith('INSERT')) {
    return normalised;
  }

  const tenantClause = `tenant_id = $${paramIndex}`;

  if (upper.includes(' WHERE ')) {
    // Append to existing WHERE clause
    return `${normalised} AND ${tenantClause}`;
  }

  // No WHERE clause — find a safe insertion point before ORDER BY / GROUP BY /
  // LIMIT / OFFSET / RETURNING / FOR UPDATE so the clause is syntactically valid.
  const insertBefore = [
    ' ORDER BY ',
    ' GROUP BY ',
    ' HAVING ',
    ' LIMIT ',
    ' OFFSET ',
    ' RETURNING ',
    ' FOR UPDATE',
    ' FOR SHARE',
  ];

  const upperNorm = normalised.toUpperCase();
  for (const keyword of insertBefore) {
    const idx = upperNorm.indexOf(keyword);
    if (idx !== -1) {
      return (
        normalised.slice(0, idx) +
        ` WHERE ${tenantClause}` +
        normalised.slice(idx)
      );
    }
  }

  // Append at the end
  return `${normalised} WHERE ${tenantClause}`;
}
