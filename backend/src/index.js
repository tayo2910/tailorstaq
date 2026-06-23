import 'dotenv/config';
import express from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import authRouter from './modules/auth/auth.routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
import tenantsRouter from './modules/tenants/tenants.routes.js';
import adminRouter from './modules/admin/admin.routes.js';
import shopsRouter from './modules/shops/shops.routes.js';
import productsRouter from './modules/products/products.routes.js';
import ordersRouter, { customerOrdersRouter } from './modules/orders/orders.routes.js';
import receiptsRouter from './modules/receipts/receipts.routes.js';
import subscriptionsRouter from './modules/subscriptions/subscriptions.routes.js';
import customersRouter from './modules/customers/customers.routes.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve built frontend in production
const frontendDist = join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'tailorstaq-backend' });
});

app.get('/debug/admin', async (_req, res) => {
  try {
    const { query } = await import('./db/queries/base.js');
    const r = await query(
      `SELECT email, role, account_status, failed_attempts,
              LEFT(password_hash, 20) AS hash_prefix
       FROM users WHERE email = $1`,
      ['admin@tailorstaq.com'],
    );
    if (!r.rows[0]) return res.json({ error: 'Admin not found' });
    res.json({
      exists: true,
      email: r.rows[0].email,
      role: r.rows[0].role,
      status: r.rows[0].account_status,
      failed_attempts: r.rows[0].failed_attempts,
      hash_prefix: r.rows[0].hash_prefix,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auth routes — login, registration, email verification
app.use('/api/v1/auth', authRouter);

// Tenant routes — registration, approval request submission
app.use('/api/v1/tenants', tenantsRouter);

// Admin routes — approval management, tenant management, metrics
app.use('/api/v1/admin', adminRouter);

// Shop settings routes — GET, PATCH, and logo upload (task 5.2)
// Requirements: 2.1, 2.2, 2.3, 2.4, 2.7, 2.8
app.use('/api/v1/shops/:shopId', shopsRouter);

// Product routes — CRUD for shop products (task 6.1)
app.use('/api/v1/shops/:shopId/products', productsRouter);

// Order routes — placement, status updates, shop order list (tasks 7.2, 7.4)
app.use('/api/v1/shops/:shopId/orders', ordersRouter);

// Customer order routes — list and detail across all shops (task 7.7)
// Requirements: 5.5, 5.6
app.use('/api/v1/customers/me/orders', customerOrdersRouter);
app.use('/api/v1/customers/me/orders', receiptsRouter);
app.use('/api/v1/customers/me', customersRouter);

// Subscription routes — tier query, upgrade, confirm (task 10.1)
// Requirements: 3.1, 3.2, 3.5, 3.6, 3.7, 3.9
app.use('/api/v1/subscriptions', subscriptionsRouter);

// SPA fallback — any non-API route serves the frontend
app.get('*', (_req, res) => {
  res.sendFile(join(frontendDist, 'index.html'));
});

// Only start the HTTP server when this file is run directly (not imported by tests)
if (process.env.NODE_ENV !== 'test') {
  // Auto-run pending DB migrations then seed admin on startup
  (async () => {
    try {
      const { runMigrations } = await import('./db/migrate.js');
      await runMigrations();
      try {
        const { seed } = await import('./db/seed.js');
        await seed();
      } catch (seedErr) {
        console.error('Seed error:', seedErr.message);
      }
    } catch (migrateErr) {
      console.error('Migration error:', migrateErr.message);
    }
  })();

  app.listen(env.PORT, () => {
    console.info(`TAILORSTAQ backend listening on port ${env.PORT}`);
  });
}

export default app;
