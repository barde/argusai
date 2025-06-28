import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { webhookHandler } from './handlers/webhook';
import { healthHandler } from './handlers/health';
import { configHandler } from './handlers/config';
import { debugHandler } from './handlers/debug';
import { testAuthHandler } from './handlers/test-auth';
import { testReviewHandler } from './handlers/test-review';
import { statusHandler } from './handlers/status';
import type { Env } from './types/env';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());
app.use('/api/*', cors());

// Root endpoint - status page (HTML by default)
app.get('/', (c) => {
  c.req.query = () => 'html'; // Force HTML format
  return statusHandler(c);
});

// Health check endpoint
app.get('/health', healthHandler);

// Status endpoint - shows connection status and model quotas
app.get('/status', statusHandler);
// Legacy status page route (redirect to root)
app.get('/status-page', (c) => {
  return c.redirect('/', 301);
});

// Debug endpoint (development only)
app.get('/debug', (c) => {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not available in production' }, 404);
  }
  return debugHandler(c);
});

// Test auth endpoint (development only)
app.get('/test-auth', testAuthHandler);

// Test review endpoint (development only)
app.get('/test-review', testReviewHandler);

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
