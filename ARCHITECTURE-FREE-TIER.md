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
                                         ↓
                                    Upstash Redis (backup queue)
                                         ↓
                                    GitHub Actions (fallback)
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
      processReviewWithFallback(c.env, payload)
    );

    return response;
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ error: 'Internal error' }, 500);
  }
}

async function processReviewWithFallback(env: Env, payload: any) {
  try {
    // Primary: Direct processing
    await processReviewAsync(env, payload);
  } catch (error) {
    console.error('Primary processing failed:', error);
    
    // Fallback 1: Queue to Upstash Redis
    try {
      await queueToUpstash(env, payload);
    } catch (upstashError) {
      console.error('Upstash fallback failed:', upstashError);
      
      // Fallback 2: Trigger GitHub Action
      await triggerGitHubAction(env, payload);
    }
  }
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

### 3. Upstash Redis Integration (Free Backup Queue)

When direct processing fails, we queue to Upstash Redis:

```typescript
// src/services/upstash-queue.ts
import { Redis } from '@upstash/redis/cloudflare';

export async function queueToUpstash(env: Env, payload: any) {
  const redis = new Redis({
    url: env.UPSTASH_REDIS_URL,
    token: env.UPSTASH_REDIS_TOKEN,
  });

  const queueItem = {
    id: crypto.randomUUID(),
    payload,
    timestamp: Date.now(),
    attempts: 0,
    maxAttempts: 3,
  };

  // Add to queue using Redis list
  await redis.lpush('argusai:queue', JSON.stringify(queueItem));
  
  // Set processing flag with TTL to prevent duplicates
  await redis.setex(
    `argusai:processing:${payload.pull_request.id}`, 
    300, // 5 minute TTL
    '1'
  );
}

// Separate worker or scheduled handler to process queue
export async function processUpstashQueue(env: Env) {
  const redis = new Redis({
    url: env.UPSTASH_REDIS_URL,
    token: env.UPSTASH_REDIS_TOKEN,
  });

  // Process up to 10 items
  for (let i = 0; i < 10; i++) {
    const item = await redis.rpop('argusai:queue');
    if (!item) break;

    const queueItem = JSON.parse(item as string);
    
    try {
      await processReviewAsync(env, queueItem.payload);
    } catch (error) {
      queueItem.attempts++;
      
      if (queueItem.attempts < queueItem.maxAttempts) {
        // Requeue with exponential backoff
        await redis.lpush('argusai:queue:delayed', JSON.stringify({
          ...queueItem,
          processAfter: Date.now() + (Math.pow(2, queueItem.attempts) * 1000)
        }));
      } else {
        // Move to dead letter queue
        await redis.lpush('argusai:queue:dlq', JSON.stringify(queueItem));
      }
    }
  }
}
```

### 4. GitHub Actions Fallback

As a last resort, we can trigger GitHub Actions:

```typescript
// src/services/github-action-fallback.ts
export async function triggerGitHubAction(env: Env, payload: any) {
  const { repository, pull_request } = payload;
  
  const response = await fetch(
    `https://api.github.com/repos/${repository.full_name}/dispatches`,
    {
      method: 'POST',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'process-argusai-review',
        client_payload: {
          pr_number: pull_request.number,
          sha: pull_request.head.sha,
          installation_id: payload.installation.id,
          timestamp: Date.now(),
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub dispatch failed: ${response.status}`);
  }
}
```

### 5. Scheduled Queue Processor

A scheduled worker processes any queued items:

```typescript
// src/scheduled.ts
export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    switch (controller.cron) {
      case '* * * * *': // Every minute
        await processUpstashQueue(env);
        break;
      case '*/5 * * * *': // Every 5 minutes
        await processDelayedQueue(env);
        break;
      case '0 * * * *': // Every hour
        await cleanupExpiredData(env);
        break;
    }
  },
};
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

# Scheduled handlers for queue processing
[triggers]
crons = ["* * * * *", "*/5 * * * *", "0 * * * *"]

# Environment variables
[vars]
ENVIRONMENT = "production"
GITHUB_APP_ID = "your-app-id"
GITHUB_MODEL = "gpt-4o-mini"
LOG_LEVEL = "info"
UPSTASH_REDIS_URL = "https://your-instance.upstash.io"

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

# KV for queue state management
[[kv_namespaces]]
binding = "QUEUE_STATE"
id = "your-queue-state-id"

# Secrets
# - GITHUB_APP_PRIVATE_KEY
# - GITHUB_WEBHOOK_SECRET
# - GITHUB_TOKEN
# - UPSTASH_REDIS_TOKEN
```

### GitHub Actions Workflow (Fallback Processor)

```yaml
# .github/workflows/argusai-processor.yml
name: ArgusAI Review Processor

on:
  repository_dispatch:
    types: [process-argusai-review]

jobs:
  process-review:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Process PR Review
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          # Install dependencies
          npm ci --only=production
          
          # Run review processor
          node scripts/process-review.js \
            --pr "${{ github.event.client_payload.pr_number }}" \
            --sha "${{ github.event.client_payload.sha }}" \
            --repo "${{ github.repository }}"
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
    upstash: 'unknown',
    github: 'unknown',
  };

  // Check KV
  try {
    await c.env.CACHE.get('health:check');
    checks.kv = 'ok';
  } catch (error) {
    checks.kv = 'error';
  }

  // Check Upstash
  try {
    const redis = new Redis({
      url: c.env.UPSTASH_REDIS_URL,
      token: c.env.UPSTASH_REDIS_TOKEN,
    });
    await redis.ping();
    checks.upstash = 'ok';
  } catch (error) {
    checks.upstash = 'error';
  }

  const allHealthy = Object.values(checks).every(v => v === 'ok');
  
  return c.json({
    status: allHealthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  }, allHealthy ? 200 : 503);
}
```

## Migration Path

### Phase 1: Webhook Handler Update
1. Implement early response pattern
2. Add `waitUntil()` processing
3. Test with small percentage of traffic

### Phase 2: Add Upstash Integration
1. Set up Upstash Redis account (free tier)
2. Implement queue operations
3. Add scheduled queue processor

### Phase 3: GitHub Actions Fallback
1. Create workflow file
2. Implement dispatch logic
3. Test failover scenarios

### Phase 4: Remove Queue Dependencies
1. Update wrangler.toml
2. Remove queue consumer code
3. Deploy to production

## Cost Analysis

### Monthly Costs (10,000 PR reviews)
- **Cloudflare Workers**: $0 (100k requests/day free)
- **Cloudflare KV**: $0 (100k reads, 1k writes/day free)
- **Upstash Redis**: $0 (10k commands/day free)
- **GitHub Actions**: $0 (public repos unlimited)
- **GitHub Models API**: $0 (free tier)

**Total: $0/month**

## Advantages of This Architecture

1. **Zero Cost**: Operates entirely on free tiers
2. **High Reliability**: Multiple fallback mechanisms
3. **Low Latency**: Early response pattern prevents timeouts
4. **Scalable**: Can handle bursts with queuing
5. **Simple Operations**: No queue infrastructure to manage

## Limitations and Mitigations

### Limitation 1: Worker CPU Time Limits
- **Issue**: 10ms CPU time on free tier
- **Mitigation**: Early response + background processing

### Limitation 2: KV Write Limits
- **Issue**: 1 write/second per key
- **Mitigation**: Use timestamp-based keys for distribution

### Limitation 3: No Built-in Queue Guarantees
- **Issue**: Potential message loss
- **Mitigation**: Multiple fallback layers + idempotency

### Limitation 4: Scheduled Worker Limits
- **Issue**: Cron triggers have minimum 1-minute interval
- **Mitigation**: Process multiple items per execution

## Conclusion

This architecture provides a robust, cost-effective solution for ArgusAI that operates entirely on free tiers. The combination of early response patterns, background processing, and multiple fallback mechanisms ensures reliability without the need for paid queue services.

The design prioritizes simplicity and maintainability while providing clear upgrade paths if the project scales beyond free tier limits in the future.