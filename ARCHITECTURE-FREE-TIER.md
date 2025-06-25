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
  console.error('Failed review details:', {
    repository: payload.repository.full_name,
    pr: payload.pull_request.number,
    error: lastError.message,
    timestamp: new Date().toISOString()
  });
  // Note: View logs with `wrangler tail`
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

When processing fails after retries, we use console logging for observability:

```typescript
// src/services/error-tracking.ts
export function logFailedReview(
  payload: any,
  error: Error
): void {
  // Log structured error data for monitoring
  console.error('Review processing failed', {
    type: 'review_failure',
    repository: payload.repository.full_name,
    pr_number: payload.pull_request.number,
    error: {
      message: error.message,
      stack: error.stack,
    },
    timestamp: new Date().toISOString(),
    retries_attempted: 3,
  });
}

// View logs using:
// wrangler tail --format pretty
// wrangler tail --search "review_failure"
```

### Logging Best Practices

```typescript
// src/utils/logger.ts
export class Logger {
  constructor(private context: string) {}
  
  info(message: string, data?: any) {
    console.log(JSON.stringify({
      level: 'INFO',
      context: this.context,
      message,
      ...data,
      timestamp: new Date().toISOString()
    }));
  }
  
  error(message: string, error?: Error, data?: any) {
    console.error(JSON.stringify({
      level: 'ERROR',
      context: this.context,
      message,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined,
      ...data,
      timestamp: new Date().toISOString()
    }));
  }
}

// Usage:
const logger = new Logger('webhook-handler');
logger.info('Processing webhook', { 
  repository: payload.repository.full_name 
});
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

### Optional: Health Check with Recent Errors

For monitoring, you can track recent errors in memory:

```typescript
// src/handlers/health.ts
// Track recent errors in global scope (reset on Worker restart)
const recentErrors: Array<{ timestamp: number; error: string }> = [];
const MAX_ERRORS = 100;

export function trackError(error: string) {
  recentErrors.push({ timestamp: Date.now(), error });
  if (recentErrors.length > MAX_ERRORS) {
    recentErrors.shift();
  }
}

export async function healthHandler(
  c: Context<{ Bindings: Env }>
): Promise<Response> {
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  
  const recentErrorCount = recentErrors.filter(
    e => e.timestamp > oneHourAgo
  ).length;
  
  return c.json({
    status: recentErrorCount < 10 ? 'healthy' : 'degraded',
    recent_errors_1h: recentErrorCount,
    worker_version: c.env.WORKER_VERSION || 'unknown',
    timestamp: new Date().toISOString()
  });
}
```

## Rate Limiting Strategy

### Simple Rate Limiting with Timestamps

```typescript
// src/utils/rate-limit.ts
export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowMinutes: number
): Promise<boolean> {
  // Use minute-based keys to avoid KV write limits
  const currentMinute = Math.floor(Date.now() / 60000);
  const windowKey = `rate:${key}:${currentMinute}`;
  
  // Get current minute's count
  const count = await kv.get(windowKey);
  const currentCount = parseInt(count || '0');
  
  if (currentCount >= limit) {
    console.warn('Rate limit exceeded', {
      key,
      limit,
      currentCount,
      minute: currentMinute
    });
    return false;
  }
  
  // Increment counter
  await kv.put(
    windowKey,
    String(currentCount + 1),
    { expirationTtl: windowMinutes * 60 }
  );
  
  return true;
}
```

## Monitoring and Observability

### Monitoring with Wrangler Tail

```bash
# View real-time logs
wrangler tail

# Filter for errors only
wrangler tail --search "ERROR"

# Filter for specific repository
wrangler tail --search "owner/repo"

# Pretty format for better readability
wrangler tail --format pretty

# Save logs to file
wrangler tail > logs.txt
```

### Optional R2 for Log Archival

For long-term log storage (optional, requires R2 on free tier):

```typescript
// src/utils/log-archiver.ts
export async function archiveLogs(
  r2: R2Bucket,
  logs: any[]
): Promise<void> {
  const date = new Date().toISOString().split('T')[0];
  const hour = new Date().getHours();
  const key = `logs/${date}/hour-${hour}.jsonl`;
  
  const content = logs.map(log => JSON.stringify(log)).join('\n');
  
  await r2.put(key, content, {
    httpMetadata: {
      contentType: 'application/x-ndjson'
    }
  });
}
```

## Deployment Steps

### Phase 1: Webhook Handler Implementation
1. Implement early response pattern with `waitUntil()`
2. Add retry logic with exponential backoff
3. Test webhook signature validation

### Phase 2: Error Handling
1. Implement structured console logging
2. Set up wrangler tail for monitoring
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
- **Mitigation**: Use minute-based keys for rate limiting, console.log() for logging

### Limitation 3: No Queue Guarantees
- **Issue**: Potential processing failures
- **Mitigation**: Retry logic + error logging for manual intervention

## Conclusion

This architecture provides a simple, cost-effective solution for ArgusAI that operates entirely on free tiers. The combination of early response patterns and background processing with retry logic ensures reliability without the need for paid queue services or external dependencies.

The design prioritizes simplicity and maintainability. If the project scales beyond free tier limits, you can easily add Cloudflare Queues or other queueing solutions without major architectural changes.