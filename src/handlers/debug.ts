import { Context } from 'hono';
import type { Env } from '../types/env';
import { StorageServiceFactory } from '../storage';

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
      model: c.env.GITHUB_MODEL,
    },
    kvNamespaces: {
      cache: !!c.env.CACHE,
      rateLimits: !!c.env.RATE_LIMITS,
      config: !!c.env.CONFIG,
    },
  };

  // Initialize storage service
  const storageFactory = new StorageServiceFactory();
  const storage = storageFactory.create(c.env);

  // Try to get last error from storage
  let lastError = null;
  try {
    lastError = await storage.getDebugData('error');
  } catch (_e) {
    // Ignore
  }

  // Try to get last webhook from storage
  let lastWebhook = null;
  try {
    lastWebhook = await storage.getDebugData('webhook');
  } catch (_e) {
    // Ignore
  }

  return c.json({
    ...info,
    lastError,
    lastWebhook,
  });
}

export async function saveDebugError(env: Env, error: any, context: any) {
  try {
    const storageFactory = new StorageServiceFactory();
    const storage = storageFactory.create(env);

    await storage.saveDebugData('error', {
      timestamp: new Date().toISOString(),
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
      context,
    });
  } catch (e) {
    console.error('Failed to save debug error:', e);
  }
}

export async function saveDebugWebhook(env: Env, payload: any) {
  try {
    const storageFactory = new StorageServiceFactory();
    const storage = storageFactory.create(env);

    await storage.saveDebugData('webhook', {
      timestamp: new Date().toISOString(),
      event: payload.action,
      pr: payload.pull_request?.number,
      repo: payload.repository?.full_name,
      installation: payload.installation?.id,
    });
  } catch (e) {
    console.error('Failed to save debug webhook:', e);
  }
}
