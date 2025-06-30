import { Context } from 'hono';
import { Env } from '../types/env';
import { generateJWT, verifyJWT, extractJWTFromCookie } from '../utils/jwt';
import { Logger } from '../utils/logger';
import { getCallbackUrl } from '../utils/url';
import { storeWithVerification } from '../utils/kv-retry';

const logger = new Logger('auth');

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

/**
 * Generate a cryptographically secure random state
 */
function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Initiate OAuth login flow
 */
export async function loginHandler(c: Context<{ Bindings: Env }>) {
  const state = generateState();

  logger.info('Starting OAuth login flow', {
    state,
    callbackUrl: getCallbackUrl(c),
    environment: c.env.ENVIRONMENT,
    hasOAuthSessions: !!c.env.OAUTH_SESSIONS,
  });

  // Store state in KV with 10 minute TTL for CSRF protection
  if (c.env.OAUTH_SESSIONS) {
    const startTime = Date.now();
    try {
      // Store with retry and verification
      const stored = await storeWithVerification(
        c.env.OAUTH_SESSIONS,
        `state:${state}`,
        'valid',
        { expirationTtl: 600 } // 10 minutes
      );

      const storageTime = Date.now() - startTime;
      logger.info('OAuth state storage complete', {
        state,
        key: `state:${state}`,
        verified: stored,
        ttl: 600,
        storageTimeMs: storageTime,
      });

      // Store in CACHE as fallback
      if (c.env.CACHE) {
        try {
          await storeWithVerification(c.env.CACHE, `oauth-state:${state}`, 'valid', {
            expirationTtl: 600,
          });
          logger.info('Stored state in CACHE fallback', { state });
        } catch (cacheError) {
          logger.warn('Failed to store in CACHE fallback', {
            error: cacheError instanceof Error ? cacheError.message : String(cacheError),
          });
        }
      }

      // List current states for debugging
      const stateList = await c.env.OAUTH_SESSIONS.list({ prefix: 'state:', limit: 10 });
      logger.info('Current states in KV after storage', {
        count: stateList.keys.length,
        states: stateList.keys.map((k) => ({
          name: k.name,
          expiration: k.expiration ? new Date(k.expiration * 1000).toISOString() : null,
        })),
        newStateIncluded: stateList.keys.some((k) => k.name === `state:${state}`),
      });
    } catch (error) {
      logger.error('Failed to store OAuth state in KV after retries', {
        error: error instanceof Error ? error.message : String(error),
        state,
        timeElapsed: Date.now() - startTime,
      });
      return c.json({ error: 'Failed to initialize OAuth flow' }, 500);
    }
  } else {
    logger.error('OAUTH_SESSIONS KV namespace not available - OAuth will fail');
    return c.json({ error: 'OAuth not properly configured' }, 500);
  }

  const clientId = c.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: 'OAuth not configured' }, 500);
  }

  // Get the callback URL dynamically
  const redirectUri = getCallbackUrl(c);
  const scope = 'repo user';

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('state', state);

  logger.info('Redirecting to GitHub OAuth', {
    authUrl: authUrl.toString(),
    redirectUri,
    clientId,
    state,
  });

  return c.redirect(authUrl.toString());
}

/**
 * Handle OAuth callback
 */
export async function callbackHandler(c: Context<{ Bindings: Env }>) {
  const code = c.req.query('code');
  const state = c.req.query('state');

  logger.info('OAuth callback received', {
    hasCode: !!code,
    hasState: !!state,
    state,
    callbackUrl: c.req.url,
    environment: c.env.ENVIRONMENT,
  });

  if (!code || !state) {
    logger.error('Missing OAuth parameters', { code: !!code, state: !!state });
    return c.html(errorPage('Missing authorization code or state'), 400);
  }

  // Verify state for CSRF protection
  if (c.env.OAUTH_SESSIONS) {
    // Check if this state was already used
    const wasUsed = await c.env.OAUTH_SESSIONS.get(`used-state:${state}`);
    if (wasUsed) {
      logger.error('OAuth state/code reuse detected', {
        state,
        previousUse: JSON.parse(wasUsed),
        currentCode: code.substring(0, 8) + '...',
      });
      return c.html(
        errorPage(
          'This authorization code has already been used. Please start the login process again.'
        ),
        400
      );
    }

    // Try primary namespace first
    let storedState = await c.env.OAUTH_SESSIONS.get(`state:${state}`);

    // Fallback to CACHE namespace if not found
    if (!storedState && c.env.CACHE) {
      logger.warn('State not found in OAUTH_SESSIONS, checking CACHE fallback', { state });
      storedState = await c.env.CACHE.get(`oauth-state:${state}`);
    }
    if (!storedState) {
      // List all states for debugging
      const stateList = await c.env.OAUTH_SESSIONS.list({ prefix: 'state:', limit: 10 });
      logger.error('State validation failed - state not found in KV', {
        state,
        storedState,
        availableStates: stateList.keys.map((k) => ({ name: k.name, expiration: k.expiration })),
      });
      return c.html(errorPage('Invalid or expired state'), 400);
    } else {
      // Delete used state from both namespaces
      await c.env.OAUTH_SESSIONS.delete(`state:${state}`);
      if (c.env.CACHE) {
        await c.env.CACHE.delete(`oauth-state:${state}`);
      }

      // Mark this state as used to detect reuse attempts
      await c.env.OAUTH_SESSIONS.put(
        `used-state:${state}`,
        JSON.stringify({
          usedAt: new Date().toISOString(),
          code: code.substring(0, 8) + '...',
        }),
        { expirationTtl: 3600 } // Keep for 1 hour for debugging
      );

      logger.info('Deleted used OAuth state and marked as used', { state });
    }
  }

  try {
    // Exchange code for access token
    const redirectUri = getCallbackUrl(c);
    const tokenPayload = {
      client_id: c.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: c.env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    };

    logger.info('Exchanging code for token', {
      clientId: c.env.GITHUB_OAUTH_CLIENT_ID,
      redirectUri,
      codeLength: code.length,
    });

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tokenPayload),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const tokenData: TokenResponse = await tokenResponse.json();

    // Check for OAuth errors
    if (tokenData.error) {
      logger.error('OAuth token error', tokenData);
      return c.html(
        errorPage(`Authentication failed: ${tokenData.error_description || tokenData.error}`),
        400
      );
    }

    if (!tokenData.access_token) {
      throw new Error('No access token received');
    }

    // Fetch user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch user info');
    }

    const user: GitHubUser = await userResponse.json();

    // Store encrypted access token
    if (c.env.OAUTH_TOKENS) {
      // In production, encrypt the token before storing
      await c.env.OAUTH_TOKENS.put(`token:${user.id}`, tokenData.access_token, {
        metadata: { scope: tokenData.scope || '' },
      });
    }

    // Generate JWT
    if (!c.env.JWT_SECRET) {
      logger.error('JWT_SECRET not configured');
      return c.html(errorPage('Server configuration error'), 500);
    }

    const jwt = await generateJWT(
      {
        sub: user.id.toString(),
        login: user.login,
        name: user.name || undefined,
        avatar_url: user.avatar_url,
      },
      c.env.JWT_SECRET
    );

    // Set secure cookie and redirect to home
    return c.html(successPage(), 200, {
      'Set-Cookie': `argusai_auth=${jwt}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
    });
  } catch (error) {
    logger.error('OAuth callback error', error as Error);
    return c.html(errorPage('Authentication failed'), 500);
  }
}

/**
 * Logout handler
 */
export async function logoutHandler(c: Context<{ Bindings: Env }>) {
  const jwt = extractJWTFromCookie(c.req.header('Cookie') || null);

  if (jwt && c.env.JWT_SECRET) {
    const payload = await verifyJWT(jwt, c.env.JWT_SECRET);
    if (payload && c.env.OAUTH_TOKENS) {
      // Optionally revoke stored token
      await c.env.OAUTH_TOKENS.delete(`token:${payload.sub}`);
    }
  }

  // Clear cookie and redirect to home
  // Clear cookie using response headers
  c.header('Set-Cookie', 'argusai_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  return c.redirect('/', 302);
}

/**
 * Get current user info
 */
export async function userHandler(c: Context<{ Bindings: Env }>) {
  const jwt = extractJWTFromCookie(c.req.header('Cookie') || null);

  if (!jwt || !c.env.JWT_SECRET) {
    return c.json({ authenticated: false }, 401);
  }

  const payload = await verifyJWT(jwt, c.env.JWT_SECRET);

  if (!payload) {
    return c.json({ authenticated: false }, 401);
  }

  return c.json({
    authenticated: true,
    user: {
      id: payload.sub,
      login: payload.login,
      name: payload.name,
      avatar_url: payload.avatar_url,
    },
  });
}

/**
 * Middleware to check authentication
 */
export async function requireAuth(
  c: Context<{ Bindings: Env }, any, {}>,
  next: () => Promise<void>
) {
  const jwt = extractJWTFromCookie(c.req.header('Cookie') || null);

  if (!jwt || !c.env.JWT_SECRET) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const payload = await verifyJWT(jwt, c.env.JWT_SECRET);

  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Add user to context
  c.set('user', payload);

  await next();
  return;
}

// Helper HTML pages
function errorPage(message: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication Error - ArgusAI</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f9fafb;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      max-width: 400px;
    }
    h1 {
      color: #ef4444;
      margin-bottom: 1rem;
    }
    p {
      color: #6b7280;
      margin-bottom: 2rem;
    }
    a {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      background: #3b82f6;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
    }
    a:hover {
      background: #2563eb;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>❌ Authentication Error</h1>
    <p>${message}</p>
    <a href="/">Return to Home</a>
  </div>
</body>
</html>
  `;
}

function successPage(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login Successful - ArgusAI</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f9fafb;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      max-width: 400px;
    }
    h1 {
      color: #22c55e;
      margin-bottom: 1rem;
    }
    p {
      color: #6b7280;
      margin-bottom: 1rem;
    }
  </style>
  <script>
    // Redirect to home after showing success
    setTimeout(() => {
      window.location.href = '/';
    }, 1500);
  </script>
</head>
<body>
  <div class="container">
    <h1>✅ Login Successful!</h1>
    <p>Redirecting to dashboard...</p>
  </div>
</body>
</html>
  `;
}
