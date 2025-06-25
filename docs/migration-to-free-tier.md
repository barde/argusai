# Migration Guide: Queue-Based to Queue-Free Architecture

## Overview

This guide walks through migrating ArgusAI from the original Cloudflare Queue-based architecture to the new free tier architecture that uses only `event.waitUntil()` for background processing.

## Migration Benefits

- **Cost**: $0/month vs $5+/month for Workers Paid plan
- **Flexibility**: Multiple fallback options
- **Portability**: No vendor lock-in
- **Scalability**: Clear upgrade paths

## Pre-Migration Checklist

- [ ] Backup current configuration
- [ ] Configure GitHub token with necessary permissions
- [ ] Review current queue consumer logic
- [ ] Plan migration window (minimal downtime)

## Phase 1: Update Configuration

### 1.1 Update Environment Variables

No new environment variables needed for the simplified architecture.

### 1.2 Remove Queue Configuration

Comment out or remove queue configurations:

```toml
# Remove these sections:
# [[queues.producers]]
# [[queues.consumers]]
```

### 1.3 Remove Scheduled Workers

No scheduled workers needed in the simplified architecture.

## Phase 2: Update Webhook Handler

### 2.1 Replace Queue Producer with Early Response

**Before (Queue-based):**
```typescript
// src/handlers/webhook.ts
export async function handleWebhook(c: Context): Promise<Response> {
  const payload = await c.req.json<WebhookPayload>();
  
  // Queue the review
  await c.env.REVIEW_QUEUE.send({
    repository: payload.repository.full_name,
    prNumber: payload.pull_request.number,
    installationId: payload.installation.id,
    action: payload.action,
    timestamp: Date.now()
  });
  
  return c.json({ message: 'Queued for processing' }, 200);
}
```

**After (Queue-free):**
```typescript
// src/handlers/webhook.ts
export async function handleWebhook(c: Context): Promise<Response> {
  const payload = await c.req.json<WebhookPayload>();
  
  // Return immediately
  const response = c.json({ message: 'Processing' }, 200);
  
  // Process in background
  c.executionCtx.waitUntil(
    processReviewWithRetry(c.env, payload)
  );
  
  return response;
}
```

### 2.2 Implement Simple Retry Logic

Create `src/services/retry-processor.ts`:

```typescript
export async function processReviewWithRetry(
  env: Env,
  payload: WebhookPayload
): Promise<void> {
  const maxAttempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await processReview(env, {
        repository: payload.repository.full_name,
        prNumber: payload.pull_request.number,
        installationId: payload.installation.id,
        action: payload.action,
        timestamp: Date.now()
      });
      return; // Success
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt} failed:`, error);
      
      if (attempt < maxAttempts) {
        // Exponential backoff
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Log failure for monitoring
  await logFailedReview(env, payload, lastError);
}
```

## Phase 3: Replace Queue Consumer

### 3.1 Remove Queue Handler

Delete or comment out the `queue` handler in `src/index.ts`:

```typescript
// Remove this:
// async queue(batch: MessageBatch<ReviewMessage>, env: Env): Promise<void> {
//   // Queue processing logic
// }
```

### 3.2 Add Error Monitoring (Optional)

Add simple monitoring for failed reviews:

```typescript
// src/services/monitoring.ts
export async function logFailedReview(
  env: Env,
  payload: WebhookPayload,
  error: Error
): Promise<void> {
  const key = `failed:${payload.repository.full_name}:${payload.pull_request.number}`;
  
  await env.CACHE.put(
    key,
    JSON.stringify({
      payload,
      error: error.message,
      timestamp: Date.now()
    }),
    { expirationTtl: 86400 } // 24 hours
  );
}

// Optional admin endpoint to view failures
export async function getFailedReviews(
  env: Env
): Promise<any[]> {
  const keys = await env.CACHE.list({ prefix: 'failed:' });
  const failed = [];
  
  for (const key of keys.keys) {
    const data = await env.CACHE.get(key.name);
    if (data) failed.push(JSON.parse(data));
  }
  
  return failed;
}
```

## Phase 4: Update Dependencies

### 4.1 Remove External Dependencies

No new dependencies needed. Remove any queue-specific utilities or types that are no longer needed.

## Phase 5: Testing

### 5.1 Local Testing

```bash
# Test webhook handler
curl -X POST http://localhost:8787/webhooks/github \
  -H "Content-Type: application/json" \
  -d @test-webhook-payload.json

# Monitor logs
wrangler tail
```

### 5.2 Staging Deployment

1. Deploy to development environment:
```bash
wrangler deploy --env development
```

2. Test with real GitHub webhooks
3. Monitor logs for errors with `wrangler tail`
4. Check logs for any failed reviews using `wrangler tail --search "ERROR"`

## Phase 6: Production Deployment

### 6.1 Simple Rollout

1. **Deploy new version**:
   - Remove queue consumer
   - Enable waitUntil() processing

2. **Monitor metrics**:
   - Response times (should be <50ms)
   - Error rates via `wrangler tail --search "ERROR"`
   - Failed review logs via `wrangler tail --search "review_failure"`
   - Rate limit logs via `wrangler tail --search "rate_limit"`

### 6.2 Final Cutover

```bash
# Deploy to production
wrangler deploy --env production

# Monitor logs
wrangler tail --env production
```

## Phase 7: Cleanup

After successful migration:

1. Remove queue bindings from `wrangler.toml`
2. Delete queue consumer code
3. Remove queue-related types and interfaces
4. Update documentation
5. Cancel Workers Paid plan (if no other features needed)

## Rollback Plan

If issues arise:

1. Re-enable queue configuration in wrangler.toml
2. Deploy previous version with queue consumer
3. Investigate issues before retry

## Monitoring Post-Migration

### Key Metrics to Track

- **Webhook response times**: Should be <50ms
- **Background processing success rate**: Target >99%
- **Failed reviews in logs**: Monitor with `wrangler tail`
- **Error rates**: Compare to baseline using log analysis

### Alerting

Set up alerts for:
- High error rates
- Failed review count > threshold
- Rate limit approaching

## Common Issues and Solutions

### Issue: Background processing timeouts

**Solution**: Optimize review processing or break into smaller chunks.

### Issue: Rate limits hit

**Solution**: Adjust sliding window parameters or upgrade to paid tier.

## Migration Timeline

- **Day 1**: Development environment testing
- **Day 2-3**: Staging deployment and monitoring
- **Day 4**: Production deployment
- **Day 5**: Cleanup and optimization

## Success Criteria

- [ ] All webhooks processed successfully
- [ ] No increase in error rates
- [ ] Response times < 50ms
- [ ] Zero dropped reviews
- [ ] Cost reduced to $0/month

## Support

For issues during migration:
1. Check logs: `wrangler tail`
2. Review failed reviews in KV
3. Consult ARCHITECTURE-FREE-TIER.md
4. Add manual retry if needed