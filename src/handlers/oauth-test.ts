import { Context } from 'hono';
import type { Env } from '../types/env';
import { getCallbackUrl, getPublicUrl } from '../utils/url';
import { storeWithVerification } from '../utils/kv-retry';

export async function oauthTestHandler(c: Context<{ Bindings: Env }>) {
  const results: any = {
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT,
    tests: {},
  };

  // Test 1: Environment Configuration
  results.tests.environment = {
    hasClientId: !!c.env.GITHUB_OAUTH_CLIENT_ID,
    hasClientSecret: !!c.env.GITHUB_OAUTH_CLIENT_SECRET,
    hasJwtSecret: !!c.env.JWT_SECRET,
    publicUrl: c.env.PUBLIC_URL || 'not set',
    derivedPublicUrl: getPublicUrl(c),
    callbackUrl: getCallbackUrl(c),
  };

  // Test 2: KV Namespace Availability
  results.tests.kvNamespaces = {
    OAUTH_SESSIONS: !!c.env.OAUTH_SESSIONS,
    OAUTH_TOKENS: !!c.env.OAUTH_TOKENS,
  };

  // Test 3: State Storage and Retrieval
  if (c.env.OAUTH_SESSIONS) {
    const testState = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const stateKey = `state:${testState}`;

    try {
      // Test direct put/get
      const putStart = Date.now();
      await c.env.OAUTH_SESSIONS.put(stateKey, 'test-value', { expirationTtl: 300 });
      const putTime = Date.now() - putStart;

      const getStart = Date.now();
      const retrieved = await c.env.OAUTH_SESSIONS.get(stateKey);
      const getTime = Date.now() - getStart;

      results.tests.directStorage = {
        success: retrieved === 'test-value',
        putTimeMs: putTime,
        getTimeMs: getTime,
        value: retrieved,
      };

      // Clean up
      await c.env.OAUTH_SESSIONS.delete(stateKey);

      // Test with retry mechanism
      const retryStart = Date.now();
      const retrySuccess = await storeWithVerification(
        c.env.OAUTH_SESSIONS,
        stateKey,
        'retry-test-value',
        { expirationTtl: 300 }
      );
      const retryTime = Date.now() - retryStart;

      results.tests.retryStorage = {
        success: retrySuccess,
        timeMs: retryTime,
      };

      // Clean up
      await c.env.OAUTH_SESSIONS.delete(stateKey);
    } catch (error) {
      results.tests.storageError = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      };
    }
  }

  // Test 4: List Current OAuth States
  if (c.env.OAUTH_SESSIONS) {
    try {
      const stateList = await c.env.OAUTH_SESSIONS.list({ prefix: 'state:', limit: 50 });
      results.tests.currentStates = {
        count: stateList.keys.length,
        states: stateList.keys.map((k) => ({
          name: k.name,
          expiration: k.expiration ? new Date(k.expiration * 1000).toISOString() : null,
          expiresIn: k.expiration
            ? Math.round((k.expiration * 1000 - Date.now()) / 1000) + 's'
            : null,
        })),
      };
    } catch (error) {
      results.tests.listError = {
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Test 5: GitHub OAuth URLs
  const testState = 'test-state-123';
  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', c.env.GITHUB_OAUTH_CLIENT_ID || 'missing');
  authUrl.searchParams.set('redirect_uri', getCallbackUrl(c));
  authUrl.searchParams.set('scope', 'repo user');
  authUrl.searchParams.set('state', testState);

  results.tests.oauthUrls = {
    authorizationUrl: authUrl.toString(),
    expectedCallbackUrl: getCallbackUrl(c),
    redirectUriParam: authUrl.searchParams.get('redirect_uri'),
  };

  // Test 6: Request Context
  results.tests.requestContext = {
    url: c.req.url,
    headers: {
      host: c.req.header('host'),
      'x-forwarded-host': c.req.header('x-forwarded-host'),
      'x-forwarded-proto': c.req.header('x-forwarded-proto'),
      'cf-connecting-ip': c.req.header('cf-connecting-ip'),
    },
  };

  // Test 7: Simulate Full OAuth State Flow
  if (c.env.OAUTH_SESSIONS) {
    const flowState = `flow-${Date.now()}`;
    const flowKey = `state:${flowState}`;

    try {
      // Store
      const storeStart = Date.now();
      await storeWithVerification(c.env.OAUTH_SESSIONS, flowKey, 'valid', { expirationTtl: 600 });
      const storeTime = Date.now() - storeStart;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Retrieve (simulating callback)
      const retrieveStart = Date.now();
      const retrievedValue = await c.env.OAUTH_SESSIONS.get(flowKey);
      const retrieveTime = Date.now() - retrieveStart;

      // Delete (simulating successful auth)
      await c.env.OAUTH_SESSIONS.delete(flowKey);

      // Verify deletion
      const afterDelete = await c.env.OAUTH_SESSIONS.get(flowKey);

      results.tests.fullFlow = {
        success: retrievedValue === 'valid' && afterDelete === null,
        storeTimeMs: storeTime,
        retrieveTimeMs: retrieveTime,
        totalTimeMs: Date.now() - storeStart,
      };
    } catch (error) {
      results.tests.fullFlowError = {
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Add recommendations
  results.recommendations = [];

  if (!results.tests.environment.hasClientId || !results.tests.environment.hasClientSecret) {
    results.recommendations.push(
      'Ensure GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET are set'
    );
  }

  if (!results.tests.kvNamespaces.OAUTH_SESSIONS) {
    results.recommendations.push(
      'OAUTH_SESSIONS KV namespace is not available - check wrangler.toml bindings'
    );
  }

  if (results.tests.currentStates?.count === 0 && results.tests.directStorage?.success) {
    results.recommendations.push(
      'KV storage works but no states are persisted - check if states are being stored during login'
    );
  }

  if (results.tests.environment.callbackUrl !== 'https://argus.vogel.yoga/auth/callback') {
    results.recommendations.push(
      `Callback URL mismatch: Expected https://argus.vogel.yoga/auth/callback, got ${results.tests.environment.callbackUrl}`
    );
  }

  return c.json(results, 200);
}
