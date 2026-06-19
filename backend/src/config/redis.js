/**
 * Redis client configuration.
 *
 * Exports a single `redisClient` instance configured from `config.redis`.
 * The client is shared across the application (BullMQ queues, caching).
 *
 * Call `await redisClient.connect()` once at application startup before
 * using the client.  BullMQ creates its own internal connections from the
 * `redisConnection` options object exported below.
 */

import { createClient } from 'redis';
import { config } from './index.js';

/**
 * Build the redis URL from individual config values so we have a single
 * source of truth and avoid duplicating host/port/password logic.
 */
function buildRedisUrl() {
  const { host, port, password } = config.redis;
  const auth = password ? `:${password}@` : '';
  const scheme = config.redis.tls ? 'rediss' : 'redis';
  return `${scheme}://${auth}${host}:${port}`;
}

/** @type {import('redis').RedisClientType} */
export const redisClient = createClient({
  url: buildRedisUrl(),
  socket: {
    tls: config.redis.tls,
    reconnectStrategy: (retries) => {
      // Exponential back-off capped at 30 s
      const delay = Math.min(1000 * 2 ** retries, 30_000);
      console.warn(`[redis] Reconnecting in ${delay}ms (attempt ${retries + 1})`);
      return delay;
    },
  },
});

redisClient.on('error', (err) => {
  console.error('[redis] Client error:', err.message);
});

redisClient.on('connect', () => {
  console.info('[redis] Connected');
});

redisClient.on('reconnecting', () => {
  console.warn('[redis] Reconnecting…');
});

/**
 * Plain connection options object for BullMQ.
 * BullMQ accepts `{ host, port, password, tls }` directly.
 */
export const redisConnection = {
  host: config.redis.host,
  port: config.redis.port,
  ...(config.redis.password ? { password: config.redis.password } : {}),
  ...(config.redis.tls ? { tls: {} } : {}),
};
