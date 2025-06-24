import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { webhookHandler } from './handlers/webhook';
import { healthHandler } from './handlers/health';
import { configHandler } from './handlers/config';
import type { Env } from './types/env';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());
app.use('/api/*', cors());

// Health check endpoint
app.get('/health', healthHandler);

// GitHub webhook endpoint
app.post('/webhooks/github', webhookHandler);

// Configuration endpoints
app.get('/config/:owner/:repo', configHandler.get);
app.put('/config/:owner/:repo', configHandler.update);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);

  if (c.env.SENTRY_DSN) {
    // TODO: Send to Sentry
  }

  return c.json(
    {
      error: 'Internal Server Error',
      message: c.env.ENVIRONMENT === 'development' ? err.message : undefined,
    },
    500
  );
});

export default app;
