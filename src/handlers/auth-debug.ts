import { Context } from 'hono';
import type { Env } from '../types/env';

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
          callback_url: 'https://argus.vogel.yoga/auth/callback',
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
  if (state && c.env.OAUTH_SESSIONS) {
    storedState = await c.env.OAUTH_SESSIONS.get(`state:${state}`);
    stateValid = !!storedState;
  }

  // Try token exchange
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
          redirect_uri: 'https://argus.vogel.yoga/auth/callback',
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
    callback_url: 'https://argus.vogel.yoga/auth/callback',
    query_params: { code: !!code, state: !!state },
    config: debugInfo,
    state_validation: {
      provided: !!state,
      stored: !!storedState,
      valid: stateValid,
    },
    token_exchange: tokenExchangeResult,
  });
}
