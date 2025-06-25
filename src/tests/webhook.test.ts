import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { webhookHandler } from '../handlers/webhook';
import type { Env } from '../types/env';
import { validateWebhookSignature } from '../utils/crypto';

// Mock the crypto validation
vi.mock('../utils/crypto', () => ({
  validateWebhookSignature: vi.fn()
}));

// Mock the review processor
vi.mock('../services/review-processor', () => ({
  processReviewWithRetry: vi.fn()
}));

describe('Webhook Handler', () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    app = new Hono<{ Bindings: Env }>();
    app.post('/webhooks/github', webhookHandler);

    env = {
      GITHUB_APP_ID: 'test-app-id',
      GITHUB_APP_PRIVATE_KEY: 'test-private-key',
      GITHUB_WEBHOOK_SECRET: 'test-secret',
      GITHUB_TOKEN: 'test-token',
      ENVIRONMENT: 'test',
      GITHUB_MODEL: 'gpt-4o-mini',
      LOG_LEVEL: 'info',
      CACHE: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn()
      } as any,
      RATE_LIMITS: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn()
      } as any,
      CONFIG: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn()
      } as any
    };

    vi.clearAllMocks();
  });

  it('should reject requests with invalid signature', async () => {
    vi.mocked(validateWebhookSignature).mockResolvedValue(false);

    const response = await app.request('/webhooks/github', {
      method: 'POST',
      headers: {
        'x-hub-signature-256': 'invalid-signature',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'test-delivery-id'
      },
      body: JSON.stringify({
        action: 'opened',
        pull_request: { number: 1 },
        repository: { full_name: 'test/repo' }
      })
    }, env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid signature' });
  });

  it('should ignore non-pull_request events', async () => {
    vi.mocked(validateWebhookSignature).mockResolvedValue(true);

    const response = await app.request('/webhooks/github', {
      method: 'POST',
      headers: {
        'x-hub-signature-256': 'valid-signature',
        'x-github-event': 'push',
        'x-github-delivery': 'test-delivery-id'
      },
      body: JSON.stringify({
        ref: 'refs/heads/main'
      })
    }, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: 'Event ignored' });
  });

  it('should process valid pull request opened event', async () => {
    vi.mocked(validateWebhookSignature).mockResolvedValue(true);
    vi.mocked(env.CACHE.get).mockResolvedValue(null); // No duplicate
    vi.mocked(env.RATE_LIMITS.get).mockResolvedValue(null); // No rate limit

    const payload = {
      action: 'opened',
      pull_request: {
        number: 1,
        draft: false,
        user: { type: 'User', login: 'test-user' },
        head: { sha: 'abc123' }
      },
      repository: { full_name: 'test/repo' },
      installation: { id: 12345 }
    };

    const executionCtx = {
      waitUntil: vi.fn()
    };

    const response = await app.request('/webhooks/github', {
      method: 'POST',
      headers: {
        'x-hub-signature-256': 'valid-signature',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'test-delivery-id'
      },
      body: JSON.stringify(payload)
    }, { ...env, executionCtx } as any);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.message).toBe('Review processing started');
    expect(json.deliveryId).toBe('test-delivery-id');
    expect(executionCtx.waitUntil).toHaveBeenCalled();
  });

  it('should ignore draft PRs', async () => {
    vi.mocked(validateWebhookSignature).mockResolvedValue(true);

    const payload = {
      action: 'opened',
      pull_request: {
        number: 1,
        draft: true,
        user: { type: 'User', login: 'test-user' },
        head: { sha: 'abc123' }
      },
      repository: { full_name: 'test/repo' },
      installation: { id: 12345 }
    };

    const response = await app.request('/webhooks/github', {
      method: 'POST',
      headers: {
        'x-hub-signature-256': 'valid-signature',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'test-delivery-id'
      },
      body: JSON.stringify(payload)
    }, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: 'Draft PR ignored' });
  });

  it('should respect rate limits', async () => {
    vi.mocked(validateWebhookSignature).mockResolvedValue(true);
    vi.mocked(env.CACHE.get).mockResolvedValue(null); // No duplicate
    vi.mocked(env.RATE_LIMITS.get).mockResolvedValue('11'); // Over limit

    const payload = {
      action: 'opened',
      pull_request: {
        number: 1,
        draft: false,
        user: { type: 'User', login: 'test-user' },
        head: { sha: 'abc123' }
      },
      repository: { full_name: 'test/repo' },
      installation: { id: 12345 }
    };

    const response = await app.request('/webhooks/github', {
      method: 'POST',
      headers: {
        'x-hub-signature-256': 'valid-signature',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'test-delivery-id'
      },
      body: JSON.stringify(payload)
    }, env);

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'Rate limit exceeded' });
  });
});