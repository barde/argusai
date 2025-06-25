# ArgusAI Free Tier Architecture

## Overview

This document presents an alternative architecture for ArgusAI that operates entirely on free tiers, eliminating the need for Cloudflare's paid Queue service. The design prioritizes reliability, scalability, and maintainability while keeping costs at zero.

## Architecture Comparison

### Original Architecture (with Queues)
```
GitHub Webhook → Worker → Cloudflare Queue → Consumer → LLM → GitHub API
```

### New Free Tier Architecture
```
GitHub Webhook → Worker (early response) → Background Processing → LLM → GitHub API
```

## Core Components

### 1. Webhook Handler with Early Response Pattern

The webhook handler uses Cloudflare's `event.waitUntil()` to process requests in the background while returning an immediate response to GitHub.

```typescript
// src/handlers/webhook-free.ts
import { Context } from 'hono';
import { validateWebhookSignature } from '../utils/crypto';
import { processReviewAsync } from '../services/review-processor';
import type { Env } from '../types/env';

export async function webhookHandlerFree(c: Context<{ Bindings: Env }>) {
  const startTime = Date.now();

  try {
    // Quick validation (must complete in <50ms)
    const body = await c.req.text();
    const signature = c.req.header('x-hub-signature-256') || '';
    
    const isValid = await validateWebhookSignature(
      body,
      signature,
      c.env.GITHUB_WEBHOOK_SECRET
    );

    if (!isValid) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    const payload = JSON.parse(body);
    const eventType = c.req.header('x-github-event');

    // Quick filters
    if (eventType !== 'pull_request' || 
        !['opened', 'synchronize'].includes(payload.action)) {
      return c.json({ message: 'Event ignored' }, 200);
    }

    // Early response to GitHub (prevents timeout)
    const response = c.json({ 
      message: 'Processing', 
      deliveryId: c.req.header('x-github-delivery') 
    }, 200);

    // Process in background using waitUntil
    c.executionCtx.waitUntil(
      processReviewWithRetry(c.env, payload)
    );

    return response;
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ error: 'Internal error' }, 500);
  }
}

async function processReviewWithRetry(env: Env, payload: any) {
  const maxAttempts = 3;
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await processReviewAsync(env, payload);
      return; // Success
    } catch (error) {
      lastError = error;
      console.error(`Processing attempt ${attempt} failed:`, error);
      
      if (attempt < maxAttempts) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All attempts failed
  console.error('All processing attempts failed:', lastError);
  // Log to KV for manual review if needed
  await env.CACHE.put(
    `failed:${payload.repository.full_name}:${payload.pull_request.number}`,
    JSON.stringify({ payload, error: lastError.message, timestamp: Date.now() }),
    { expirationTtl: 86400 } // 24 hours
  );
}
```

### 2. Background Review Processor

The review processor handles the actual LLM calls and GitHub interactions:

```typescript
// src/services/review-processor.ts
import { Env } from '../types/env';
import { GitHubService } from './github';
import { LLMService } from './llm';
import { StorageService } from './storage';

export async function processReviewAsync(env: Env, payload: any) {
  const github = new GitHubService(env);
  const llm = new LLMService(env);
  const storage = new StorageService(env);

  const { repository, pull_request, installation } = payload;
  
  // Check cache first
  const cacheKey = `review:${repository.full_name}:${pull_request.number}:${pull_request.head.sha}`;
  const cached = await storage.getReview(cacheKey);
  
  if (cached) {
    console.log('Using cached review');
    await github.postReview(repository.full_name, pull_request.number, cached);
    return;
  }

  // Rate limiting with KV-based sliding window
  const rateLimitKey = `rate:${installation.id}:${Math.floor(Date.now() / 60000)}`;
  const count = await env.RATE_LIMITS.get(rateLimitKey);
  
  if (count && parseInt(count) > 10) { // 10 reviews per minute
    throw new Error('Rate limit exceeded');
  }

  // Fetch PR data
  const prData = await github.getPullRequest(
    repository.full_name, 
    pull_request.number
  );

  // Generate review
  const review = await llm.generateReview(prData);

  // Post review
  await github.postReview(
    repository.full_name, 
    pull_request.number, 
    review
  );

  // Update cache and rate limit
  await Promise.all([
    storage.setReview(cacheKey, review, 3600), // 1 hour TTL
    env.RATE_LIMITS.put(rateLimitKey, String((parseInt(count || '0') + 1)), {
      expirationTtl: 60
    })
  ]);
}
```

### 3. Simple Error Handling and Monitoring

When processing fails after retries, we log to KV for monitoring:

```typescript
// src/services/error-tracking.ts
export async function logFailedReview(
  env: Env,
  payload: any,
  error: Error
): Promise<void> {
  const key = `failed:${payload.repository.full_name}:${payload.pull_request.number}`;
  
  await env.CACHE.put(
    key,
    JSON.stringify({
      payload,
      error: {
        message: error.message,
        stack: error.stack,
      },
      timestamp: Date.now(),
      retries: 3,
    }),
    { expirationTtl: 86400 } // 24 hours
  );
  
  // Increment failure counter for monitoring
  const dailyKey = `failures:${new Date().toISOString().split('T')[0]}`;
  const count = await env.CACHE.get(dailyKey);
  await env.CACHE.put(
    dailyKey,
    String(parseInt(count || '0') + 1),
    { expirationTtl: 172800 } // 48 hours
  );
}

// Optional: Add endpoint to check failed reviews
export async function getFailedReviews(
  env: Env,
  limit = 10
): Promise<any[]> {
  const keys = await env.CACHE.list({ prefix: 'failed:' });
  const failed = [];
  
  for (const key of keys.keys.slice(0, limit)) {
    const data = await env.CACHE.get(key.name);
    if (data) {
      failed.push(JSON.parse(data));
    }
  }
  
  return failed;
}
```

## Error Handling and Retry Strategy

### Exponential Backoff Implementation

```typescript
// src/utils/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2,
  } = options;

  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }

      const delay = Math.min(
        initialDelay * Math.pow(factor, attempt - 1),
        maxDelay
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
```

### Circuit Breaker Pattern

```typescript
// src/utils/circuit-breaker.ts
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold = 5,
    private timeout = 60000, // 1 minute
    private resetTimeout = 300000 // 5 minutes
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this.threshold) {
        this.state = 'open';
      }

      throw error;
    }
  }
}
```

## Configuration

### Updated wrangler.toml (Free Tier)

```toml
name = "argusai"
main = "src/index.ts"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

# Environment variables
[vars]
ENVIRONMENT = "production"
GITHUB_APP_ID = "your-app-id"
GITHUB_MODEL = "gpt-4o-mini"
LOG_LEVEL = "info"

# KV Namespaces (same as before)
[[kv_namespaces]]
binding = "CACHE"
id = "your-cache-id"

[[kv_namespaces]]
binding = "RATE_LIMITS"
id = "your-rate-limits-id"

[[kv_namespaces]]
binding = "CONFIG"
id = "your-config-id"

# Secrets
# - GITHUB_APP_PRIVATE_KEY
# - GITHUB_WEBHOOK_SECRET
# - GITHUB_TOKEN
```

### Optional: Manual Retry Endpoint

For failed reviews, you can add an admin endpoint to manually retry:

```typescript
// src/handlers/admin.ts
export async function retryFailedReview(
  c: Context<{ Bindings: Env }>
): Promise<Response> {
  const { repository, prNumber } = await c.req.json();
  const key = `failed:${repository}:${prNumber}`;
  
  const failedData = await c.env.CACHE.get(key);
  if (!failedData) {
    return c.json({ error: 'Failed review not found' }, 404);
  }
  
  const { payload } = JSON.parse(failedData);
  
  // Retry processing
  c.executionCtx.waitUntil(
    processReviewWithRetry(c.env, payload)
  );
  
  // Clean up failed record
  await c.env.CACHE.delete(key);
  
  return c.json({ message: 'Retry initiated' });
}
```

## Rate Limiting Strategy

### KV-Based Sliding Window

```typescript
// src/utils/kv-rate-limit.ts
export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  // Get all entries for this key
  const prefix = `rl:${key}:`;
  const entries = await kv.list({ prefix });
  
  // Count recent requests
  let recentCount = 0;
  const expiredKeys: string[] = [];
  
  for (const entry of entries.keys) {
    const timestamp = parseInt(entry.name.split(':').pop() || '0');
    
    if (timestamp > windowStart) {
      recentCount++;
    } else {
      expiredKeys.push(entry.name);
    }
  }
  
  // Clean up expired entries
  await Promise.all(expiredKeys.map(k => kv.delete(k)));
  
  if (recentCount >= limit) {
    return false;
  }
  
  // Add current request
  await kv.put(`${prefix}${now}`, '1', {
    expirationTtl: Math.ceil(windowMs / 1000)
  });
  
  return true;
}
```

## Monitoring and Observability

### Health Check Endpoint

```typescript
// src/handlers/health-free.ts
export async function healthHandler(c: Context<{ Bindings: Env }>) {
  const checks = {
    worker: 'ok',
    kv: 'unknown',
    github: 'unknown',
    failureRate: 'unknown',
  };

  // Check KV
  try {
    await c.env.CACHE.get('health:check');
    checks.kv = 'ok';
  } catch (error) {
    checks.kv = 'error';
  }

  // Check failure rate
  try {
    const dailyKey = `failures:${new Date().toISOString().split('T')[0]}`;
    const failures = await c.env.CACHE.get(dailyKey);
    checks.failureRate = parseInt(failures || '0') < 10 ? 'ok' : 'warning';
  } catch (error) {
    checks.failureRate = 'error';
  }

  const allHealthy = Object.values(checks).every(v => v === 'ok');
  
  return c.json({
    status: allHealthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  }, allHealthy ? 200 : 503);
}
```

## Deployment Steps

### Phase 1: Webhook Handler Implementation
1. Implement early response pattern with `waitUntil()`
2. Add retry logic with exponential backoff
3. Test webhook signature validation

### Phase 2: Error Handling
1. Implement KV-based error logging
2. Add monitoring endpoints
3. Test failure scenarios

### Phase 3: Production Deployment
1. Update wrangler.toml
2. Deploy to production
3. Monitor error rates

## Cost Analysis

### Monthly Costs (10,000 PR reviews)
- **Cloudflare Workers**: $0 (100k requests/day free)
- **Cloudflare KV**: $0 (100k reads, 1k writes/day free)
- **GitHub Models API**: $0 (free tier)

**Total: $0/month**

## Advantages of This Architecture

1. **Zero Cost**: Operates entirely on free tiers
2. **Simplicity**: No external dependencies or queue infrastructure
3. **Low Latency**: Early response pattern prevents timeouts
4. **Direct Processing**: Immediate feedback on PRs
5. **Easy Debugging**: All logic in one place

## Limitations and Mitigations

### Limitation 1: Worker CPU Time Limits
- **Issue**: 10ms CPU time on free tier
- **Mitigation**: Early response + background processing

### Limitation 2: KV Write Limits
- **Issue**: 1 write/second per key
- **Mitigation**: Use timestamp-based keys for distribution

### Limitation 3: No Queue Guarantees
- **Issue**: Potential processing failures
- **Mitigation**: Retry logic + error logging for manual intervention

## Conclusion

This architecture provides a simple, cost-effective solution for ArgusAI that operates entirely on free tiers. The combination of early response patterns and background processing with retry logic ensures reliability without the need for paid queue services or external dependencies.

The design prioritizes simplicity and maintainability. If the project scales beyond free tier limits, you can easily add Cloudflare Queues or other queueing solutions without major architectural changes.