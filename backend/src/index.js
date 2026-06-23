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
  // Auto-run pending DB migrations on startup
  import('./db/migrate.js').then(({ runMigrations }) =>
    runMigrations().catch(err => console.error('Migration error:', err.message))
  ).catch(() => {});

  app.listen(env.PORT, () => {
    console.info(`TAILORSTAQ backend listening on port ${env.PORT}`);
  });
}

export default app;
