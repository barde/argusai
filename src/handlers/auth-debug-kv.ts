import { Context } from 'hono';
import type { Env } from '../types/env';

export async function debugKVHandler(c: Context<{ Bindings: Env }>) {
  const testKey = `test:${Date.now()}`;
  const testValue = 'test-value';

  const results = {
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
    kvNamespaces: {
      OAUTH_SESSIONS: !!c.env.OAUTH_SESSIONS,
      OAUTH_TOKENS: !!c.env.OAUTH_TOKENS,
      CACHE: !!c.env.CACHE,
      RATE_LIMITS: !!c.env.RATE_LIMITS,
      CONFIG: !!c.env.CONFIG,
    },
    tests: {
      oauthSessions: {
        available: false,
        writeSuccess: false,
        readSuccess: false,
        deleteSuccess: false,
        listSuccess: false,
        error: null as string | null,
      },
    },
  };

  // Test OAUTH_SESSIONS KV namespace
  if (c.env.OAUTH_SESSIONS) {
    results.tests.oauthSessions.available = true;

    try {
      // Test write
      await c.env.OAUTH_SESSIONS.put(testKey, testValue, {
        expirationTtl: 60, // 1 minute
      });
      results.tests.oauthSessions.writeSuccess = true;

      // Test read
      const readValue = await c.env.OAUTH_SESSIONS.get(testKey);
      results.tests.oauthSessions.readSuccess = readValue === testValue;

      // Test list
      await c.env.OAUTH_SESSIONS.list({ prefix: 'test:', limit: 10 });
      results.tests.oauthSessions.listSuccess = true;

      // Test delete
      await c.env.OAUTH_SESSIONS.delete(testKey);
      results.tests.oauthSessions.deleteSuccess = true;

      // Add list of current states
      const stateList = await c.env.OAUTH_SESSIONS.list({ prefix: 'state:', limit: 20 });
      (results as any).currentStates = {
        count: stateList.keys.length,
        keys: stateList.keys.map((k) => ({
          name: k.name,
          expiration: k.expiration ? new Date(k.expiration * 1000).toISOString() : null,
        })),
      };
    } catch (error) {
      results.tests.oauthSessions.error = error instanceof Error ? error.message : String(error);
    }
  }

  // Add KV namespace IDs from wrangler.toml for verification
  (results as any).expectedKVIds = {
    OAUTH_SESSIONS: 'be789daea4d24d73ba3ef27659c085ee',
    OAUTH_TOKENS: '617a4a28461b4372bd4b109e9a6ea151',
    CACHE: 'df70afec18184e6da7a50bad00cbae45',
    RATE_LIMITS: '3f9fae87dddd4751823a13ce49dfa81c',
    CONFIG: '6155db907791462998569c559e71a8cd',
  };

  return c.json(results, 200);
}
