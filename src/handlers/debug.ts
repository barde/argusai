import { Context } from 'hono';
import type { Env } from '../types/env';

export async function debugHandler(c: Context<{ Bindings: Env }>) {
  const info = {
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT,
    configuration: {
      hasAppId: !!c.env.GITHUB_APP_ID,
      appId: c.env.GITHUB_APP_ID,
      hasPrivateKey: !!c.env.GITHUB_APP_PRIVATE_KEY,
      privateKeyLength: c.env.GITHUB_APP_PRIVATE_KEY?.length || 0,
      hasWebhookSecret: !!c.env.GITHUB_WEBHOOK_SECRET,
      webhookSecretLength: c.env.GITHUB_WEBHOOK_SECRET?.length || 0,
      hasGitHubToken: !!c.env.GITHUB_TOKEN,
      githubTokenLength: c.env.GITHUB_TOKEN?.length || 0,
      model: c.env.GITHUB_MODEL
    },
    kvNamespaces: {
      cache: !!c.env.CACHE,
      rateLimits: !!c.env.RATE_LIMITS,
      config: !!c.env.CONFIG
    }
  };

  // Try to get last error from cache
  let lastError = null;
  try {
    const errorData = await c.env.CACHE.get('debug:last-error');
    if (errorData) {
      lastError = JSON.parse(errorData);
    }
  } catch (e) {
    // Ignore
  }

  // Try to get last webhook from cache
  let lastWebhook = null;
  try {
    const webhookData = await c.env.CACHE.get('debug:last-webhook');
    if (webhookData) {
      lastWebhook = JSON.parse(webhookData);
    }
  } catch (e) {
    // Ignore
  }

  return c.json({
    ...info,
    lastError,
    lastWebhook
  });
}

export async function saveDebugError(env: Env, error: any, context: any) {
  try {
    await env.CACHE.put('debug:last-error', JSON.stringify({
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error,
      context
    }), {
      expirationTtl: 3600 // 1 hour
    });
  } catch (e) {
    console.error('Failed to save debug error:', e);
  }
}

export async function saveDebugWebhook(env: Env, payload: any) {
  try {
    await env.CACHE.put('debug:last-webhook', JSON.stringify({
      timestamp: new Date().toISOString(),
      event: payload.action,
      pr: payload.pull_request?.number,
      repo: payload.repository?.full_name,
      installation: payload.installation?.id
    }), {
      expirationTtl: 3600 // 1 hour
    });
  } catch (e) {
    console.error('Failed to save debug webhook:', e);
  }
}