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
import {
  getAllowedReposHandler,
  addAllowedRepoHandler,
  removeAllowedRepoHandler,
  checkAllowedRepoHandler,
} from './handlers/allowed-repos';
import {
  loginHandler,
  callbackHandler,
  logoutHandler,
  userHandler,
  requireAuth,
} from './handlers/auth';
import { getUserRepos, enableRepo, disableRepo } from './handlers/repos';
import { dashboardHandler } from './handlers/dashboard';
import { debugCallbackHandler } from './handlers/auth-debug';
import { debugKVHandler } from './handlers/auth-debug-kv';
import { oauthTestHandler } from './handlers/oauth-test';
import { enhancedDebugCallbackHandler } from './handlers/auth-debug-enhanced';
import type { Env } from './types/env';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());
app.use('/api/*', cors());

// Root endpoint - dashboard page (HTML)
app.get('/', dashboardHandler);

// Health check endpoint
app.get('/health', healthHandler);

// Status endpoint - shows connection status and model quotas
app.get('/status', statusHandler);
// Legacy status page route (redirect to root)
app.get('/status-page', (c) => {
  return c.redirect('/', 301);
});

// Debug endpoint (development only or when DEBUG_MODE is enabled)
app.get('/debug', (c) => {
  if (c.env.ENVIRONMENT !== 'development' && c.env.DEBUG_MODE !== 'true') {
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

// Allowed repositories management endpoints
app.get('/admin/allowed-repos', getAllowedReposHandler);
app.post('/admin/allowed-repos', addAllowedRepoHandler);
app.delete('/admin/allowed-repos/:owner/:repo', removeAllowedRepoHandler);
app.get('/allowed-repos/:owner/:repo', checkAllowedRepoHandler);

// OAuth authentication endpoints
app.get('/auth/login', loginHandler);
app.get('/auth/callback', callbackHandler);
app.post('/auth/logout', logoutHandler);
app.get('/auth/user', userHandler);

// Debug endpoints (only available when DEBUG_MODE is enabled)
app.get('/auth/callback-debug', (c) => {
  if (c.env.DEBUG_MODE !== 'true') {
    return c.json({ error: 'Debug mode not enabled' }, 404);
  }
  return debugCallbackHandler(c);
});
app.get('/auth/callback-debug-v2', (c) => {
  if (c.env.DEBUG_MODE !== 'true') {
    return c.json({ error: 'Debug mode not enabled' }, 404);
  }
  return enhancedDebugCallbackHandler(c);
});
app.get('/auth/debug-kv', (c) => {
  if (c.env.DEBUG_MODE !== 'true') {
    return c.json({ error: 'Debug mode not enabled' }, 404);
  }
  return debugKVHandler(c);
});
app.get('/auth/oauth-test', (c) => {
  if (c.env.DEBUG_MODE !== 'true') {
    return c.json({ error: 'Debug mode not enabled' }, 404);
  }
  return oauthTestHandler(c);
});

// Protected API endpoints (require authentication)
app.get('/api/user/repos', requireAuth, getUserRepos);
app.post('/api/user/repos/:owner/:repo/enable', requireAuth, enableRepo);
app.delete('/api/user/repos/:owner/:repo/enable', requireAuth, disableRepo);

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
