import { Context } from 'hono';
import type { Env } from '../types/env';
import { getCallbackUrl } from '../utils/url';

export async function debugCallbackHandler(c: Context<{ Bindings: Env }>) {
  const { code, state, error, error_description } = c.req.query();

  // Check for GitHub OAuth errors
  if (error) {
    return c.json(
      {
        error: 'GitHub OAuth Error',
        details: {
          error,
          error_description,
          callback_url: getCallbackUrl(c),
        },
      },
      400
    );
  }

  const debugInfo = {
    hasCode: !!code,
    hasState: !!state,
    hasClientId: !!c.env.GITHUB_OAUTH_CLIENT_ID,
    hasClientSecret: !!c.env.GITHUB_OAUTH_CLIENT_SECRET,
    hasJwtSecret: !!c.env.JWT_SECRET,
    hasOAuthSessions: !!c.env.OAUTH_SESSIONS,
    hasOAuthTokens: !!c.env.OAUTH_TOKENS,
  };

  // Try to validate state
  let stateValid = false;
  let storedState = null;
  let allKeys: Array<{ name: string; expiration: string | null }> = [];
  if (state && c.env.OAUTH_SESSIONS) {
    storedState = await c.env.OAUTH_SESSIONS.get(`state:${state}`);
    stateValid = !!storedState;

    // Debug: List all state keys
    try {
      const list = await c.env.OAUTH_SESSIONS.list({ prefix: 'state:', limit: 10 });
      allKeys = list.keys.map((k) => ({
        name: k.name,
        expiration: k.expiration ? new Date(k.expiration * 1000).toISOString() : null,
      }));
    } catch (e) {
      // Ignore errors
    }
  }

  // Try token exchange without redirect_uri
  let tokenExchangeResult = null;
  if (code && c.env.GITHUB_OAUTH_CLIENT_ID && c.env.GITHUB_OAUTH_CLIENT_SECRET) {
    try {
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: c.env.GITHUB_OAUTH_CLIENT_ID,
          client_secret: c.env.GITHUB_OAUTH_CLIENT_SECRET,
          code,
          redirect_uri: getCallbackUrl(c),
        }),
      });

      const responseText = await tokenResponse.text();
      let tokenData;
      try {
        tokenData = JSON.parse(responseText);
      } catch {
        tokenData = { raw: responseText };
      }

      tokenExchangeResult = {
        status: tokenResponse.status,
        ok: tokenResponse.ok,
        data: tokenData,
      };
    } catch (error) {
      tokenExchangeResult = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return c.json({
    debug: true,
    environment: c.env.ENVIRONMENT,
    callback_url: getCallbackUrl(c),
    public_url: c.env.PUBLIC_URL || 'not set',
    request_url: c.req.url,
    headers: {
      host: c.req.header('host'),
      'x-forwarded-host': c.req.header('x-forwarded-host'),
      'x-forwarded-proto': c.req.header('x-forwarded-proto'),
    },
    query_params: { code: !!code, state: !!state },
    config: debugInfo,
    state_validation: {
      provided: !!state,
      stored: !!storedState,
      valid: stateValid,
      stateKeys: allKeys,
      requestedState: state,
    },
    token_exchange: tokenExchangeResult,
  });
}
