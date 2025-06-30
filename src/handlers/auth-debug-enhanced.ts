import { Context } from 'hono';
import type { Env } from '../types/env';
import { getCallbackUrl } from '../utils/url';
import { Logger } from '../utils/logger';

const logger = new Logger('auth-debug-enhanced');

export async function enhancedDebugCallbackHandler(c: Context<{ Bindings: Env }>) {
  const { code, state, error, error_description } = c.req.query();
  const timestamp = Date.now();

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
    timestamp: new Date(timestamp).toISOString(),
    request: {
      code: code ? `${code.substring(0, 8)}...` : null,
      state: state,
      url: c.req.url,
      headers: {
        'user-agent': c.req.header('user-agent'),
        referer: c.req.header('referer'),
        'cf-ray': c.req.header('cf-ray'),
      },
    },
    config: {
      hasCode: !!code,
      hasState: !!state,
      hasClientId: !!c.env.GITHUB_OAUTH_CLIENT_ID,
      hasClientSecret: !!c.env.GITHUB_OAUTH_CLIENT_SECRET,
      hasJwtSecret: !!c.env.JWT_SECRET,
      hasOAuthSessions: !!c.env.OAUTH_SESSIONS,
      hasOAuthTokens: !!c.env.OAUTH_TOKENS,
    },
  };

  // Enhanced state validation
  let stateValidation: any = {
    provided: !!state,
    stored: false,
    valid: false,
    value: null,
    cacheValue: null,
    dedupKey: null,
    possibleReuse: false,
  };

  if (state && c.env.OAUTH_SESSIONS) {
    // Check if state exists
    const storedState = await c.env.OAUTH_SESSIONS.get(`state:${state}`);
    stateValidation.value = storedState;
    stateValidation.stored = !!storedState;
    stateValidation.valid = !!storedState;

    // Check cache fallback
    if (c.env.CACHE) {
      const cacheState = await c.env.CACHE.get(`oauth-state:${state}`);
      stateValidation.cacheValue = cacheState;
    }

    // Check if this state was recently used (deduplication check)
    const dedupKey = `used-state:${state}`;
    const wasUsed = await c.env.OAUTH_SESSIONS.get(dedupKey);
    stateValidation.dedupKey = dedupKey;
    stateValidation.wasRecentlyUsed = !!wasUsed;

    if (wasUsed) {
      stateValidation.possibleReuse = true;
      stateValidation.usedAt = wasUsed;
    }

    // List all states
    const stateList = await c.env.OAUTH_SESSIONS.list({ prefix: 'state:', limit: 20 });
    stateValidation.allStates = stateList.keys.map((k) => ({
      name: k.name,
      expiration: k.expiration ? new Date(k.expiration * 1000).toISOString() : null,
      expiresIn: k.expiration
        ? Math.round((k.expiration * 1000 - timestamp) / 1000) + 's'
        : 'expired',
    }));

    // List recently used states
    const usedList = await c.env.OAUTH_SESSIONS.list({ prefix: 'used-state:', limit: 10 });
    stateValidation.recentlyUsedStates = usedList.keys.map((k) => ({
      name: k.name,
      expiration: k.expiration ? new Date(k.expiration * 1000).toISOString() : null,
    }));
  }

  // Try token exchange to see what happens
  let tokenExchangeResult = null;
  if (code && c.env.GITHUB_OAUTH_CLIENT_ID && c.env.GITHUB_OAUTH_CLIENT_SECRET) {
    try {
      logger.info('Attempting token exchange', {
        code: code.substring(0, 8) + '...',
        state,
        possibleReuse: stateValidation.possibleReuse,
      });

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
        timestamp: new Date().toISOString(),
      };

      // If we got a bad_verification_code error, mark this state/code as used
      if (tokenData.error === 'bad_verification_code' && state && c.env.OAUTH_SESSIONS) {
        await c.env.OAUTH_SESSIONS.put(
          `used-state:${state}`,
          JSON.stringify({
            usedAt: new Date().toISOString(),
            error: tokenData.error,
            code: code.substring(0, 8) + '...',
          }),
          { expirationTtl: 3600 } // Keep for 1 hour for debugging
        );
      }
    } catch (error) {
      tokenExchangeResult = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Analysis and recommendations
  const analysis = {
    likelyIssue: '',
    recommendations: [] as string[],
  };

  if (stateValidation.possibleReuse) {
    analysis.likelyIssue = 'Authorization code reuse detected';
    analysis.recommendations.push(
      'This authorization code was already used. OAuth codes are single-use only.',
      'This usually happens when: 1) Page is refreshed, 2) Back button is used, 3) Multiple tabs',
      'Start the OAuth flow again from /auth/login'
    );
  } else if (
    !stateValidation.stored &&
    stateValidation.allStates?.some((s: any) => s.name.includes(state))
  ) {
    analysis.likelyIssue = 'State exists in KV but returns null - likely already consumed';
    analysis.recommendations.push(
      'The state exists in KV listing but get() returns null',
      'This indicates the state was already used and deleted',
      'Check if you are hitting the callback URL multiple times'
    );
  } else if (!stateValidation.stored) {
    analysis.likelyIssue = 'State not found in KV';
    analysis.recommendations.push(
      'The state was not found in KV storage',
      'Either it expired (10 min TTL) or was never stored',
      'Check /auth/oauth-test to verify KV is working'
    );
  }

  if (tokenExchangeResult?.data?.error === 'bad_verification_code') {
    if (!analysis.likelyIssue) {
      analysis.likelyIssue = 'Invalid or expired authorization code';
    }
    analysis.recommendations.push(
      'GitHub returned bad_verification_code error',
      'Common causes: 1) Code expired (10 min TTL), 2) Code already used, 3) Wrong OAuth app'
    );
  }

  return c.json({
    debug: true,
    environment: c.env.ENVIRONMENT,
    callback_url: getCallbackUrl(c),
    timestamp: debugInfo.timestamp,
    request: debugInfo.request,
    config: debugInfo.config,
    state_validation: stateValidation,
    token_exchange: tokenExchangeResult,
    analysis,
  });
}
