import { Context } from 'hono';
import { Env } from '../types/env';
import { Logger } from '../utils/logger';
import { storeWithVerification } from '../utils/kv-retry';

const logger = new Logger('auth-debug-login');

/**
 * Generate a cryptographically secure random state
 */
function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Debug OAuth login flow with callback-debug endpoint
 */
export async function debugLoginHandler(c: Context<{ Bindings: Env }>) {
  const state = generateState();

  logger.info('Starting debug OAuth login flow', {
    state,
    environment: c.env.ENVIRONMENT,
  });

  // Store state in KV with 10 minute TTL
  if (c.env.OAUTH_SESSIONS) {
    try {
      await storeWithVerification(c.env.OAUTH_SESSIONS, `state:${state}`, 'valid', {
        expirationTtl: 600,
      });
      logger.info('Stored OAuth state for debug', { state });
    } catch (error) {
      logger.error('Failed to store OAuth state', { error });
      return c.json({ error: 'Failed to initialize OAuth flow' }, 500);
    }
  }

  const clientId = c.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: 'OAuth not configured' }, 500);
  }

  // Use the debug callback URL
  const redirectUri = 'https://argus.vogel.yoga/auth/callback-debug';
  const scope = 'repo user';

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('state', state);

  logger.info('Redirecting to GitHub OAuth (debug)', {
    authUrl: authUrl.toString(),
    redirectUri,
    state,
  });

  return c.redirect(authUrl.toString());
}
