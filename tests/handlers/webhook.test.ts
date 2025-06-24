import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../../src/index';
import type { Env } from '../../src/types/env';

describe('Webhook Handler', () => {
  let env: Env;

  beforeEach(() => {
    env = {
      ENVIRONMENT: 'development',
      GITHUB_APP_ID: 'test-app-id',
      GITHUB_MODEL: 'gpt-4o-mini',
      LOG_LEVEL: 'debug',
      GITHUB_APP_PRIVATE_KEY: 'test-private-key',
      GITHUB_WEBHOOK_SECRET: 'test-secret',
      GITHUB_TOKEN: 'test-token',
      CACHE: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      } as any,
      RATE_LIMITS: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      } as any,
      CONFIG: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      } as any,
      REVIEW_QUEUE: {
        send: vi.fn(),
      } as any,
    };
  });

  it('should return 401 for invalid signature', async () => {
    const req = new Request('http://localhost/webhooks/github', {
      method: 'POST',
      headers: {
        'x-hub-signature-256': 'invalid-signature',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'test-delivery-id',
      },
      body: JSON.stringify({ action: 'opened' }),
    });

    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Invalid signature' });
  });

  it('should ignore non-pull_request events', async () => {
    const payload = { action: 'created' };
    const signature = await generateSignature(JSON.stringify(payload), env.GITHUB_WEBHOOK_SECRET);

    const req = new Request('http://localhost/webhooks/github', {
      method: 'POST',
      headers: {
        'x-hub-signature-256': signature,
        'x-github-event': 'issue',
        'x-github-delivery': 'test-delivery-id',
      },
      body: JSON.stringify(payload),
    });

    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ message: 'Event ignored' });
  });

  it('should queue valid pull request events', async () => {
    const payload = {
      action: 'opened',
      pull_request: {
        number: 123,
        draft: false,
        head: { sha: 'test-sha' },
      },
      repository: {
        full_name: 'test/repo',
      },
      installation: {
        id: 12345,
      },
    };

    const signature = await generateSignature(JSON.stringify(payload), env.GITHUB_WEBHOOK_SECRET);

    const req = new Request('http://localhost/webhooks/github', {
      method: 'POST',
      headers: {
        'x-hub-signature-256': signature,
        'x-github-event': 'pull_request',
        'x-github-delivery': 'test-delivery-id',
      },
      body: JSON.stringify(payload),
    });

    // Mock KV responses
    (env.CACHE.get as any).mockResolvedValue(null); // No duplicate
    (env.RATE_LIMITS.get as any).mockResolvedValue(null); // No rate limit

    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Review queued');
    expect(body.deliveryId).toBe('test-delivery-id');
    expect(env.REVIEW_QUEUE.send).toHaveBeenCalledWith({
      repository: 'test/repo',
      prNumber: 123,
      installationId: 12345,
      action: 'opened',
      sha: 'test-sha',
      timestamp: expect.any(Number),
      eventId: 'test-delivery-id',
      retryCount: 0,
    });
  });
});

async function generateSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const hex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return `sha256=${hex}`;
}