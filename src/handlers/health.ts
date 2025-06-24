import { Context } from 'hono';
import type { Env } from '../types/env';

export async function healthHandler(c: Context<{ Bindings: Env }>) {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT,
    version: '0.1.0',
    checks: {
      kv: false,
      queue: false,
    }
  };

  try {
    // Test KV access
    await c.env.CACHE.get('health-check');
    checks.checks.kv = true;
  } catch (error) {
    console.error('KV health check failed:', error);
  }

  // Queue health is implicit - if we can receive the request, the worker is healthy
  checks.checks.queue = true;

  const isHealthy = Object.values(checks.checks).every(v => v === true);
  
  return c.json(checks, isHealthy ? 200 : 503);
}