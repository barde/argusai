# Migration Guide: Queue-Based to Queue-Free Architecture

## Overview

This guide walks through migrating ArgusAI from the original Cloudflare Queue-based architecture to the new free tier architecture that uses `event.waitUntil()` and alternative queue services.

## Migration Benefits

- **Cost**: $0/month vs $5+/month for Workers Paid plan
- **Flexibility**: Multiple fallback options
- **Portability**: No vendor lock-in
- **Scalability**: Clear upgrade paths

## Pre-Migration Checklist

- [ ] Backup current configuration
- [ ] Set up Upstash Redis account (free tier)
- [ ] Configure GitHub token with necessary permissions
- [ ] Review current queue consumer logic
- [ ] Plan migration window (minimal downtime)

## Phase 1: Update Configuration

### 1.1 Update Environment Variables

Add new environment variables to `wrangler.toml`:

```toml
[vars]
UPSTASH_REDIS_URL = "your-upstash-url"
UPSTASH_REDIS_TOKEN = "your-upstash-token"
GITHUB_ACTIONS_TRIGGER_TOKEN = "your-github-pat"
ENABLE_QUEUE_FREE_MODE = "true"
```

### 1.2 Remove Queue Configuration

Comment out or remove queue configurations:

```toml
# Remove these sections:
# [[queues.producers]]
# [[queues.consumers]]
```

### 1.3 Add Scheduled Workers

Add cron triggers for processing queued items:

```toml
[triggers]
crons = ["*/5 * * * *"]  # Process queue every 5 minutes
```

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
    processReviewWithFallback(c.env, payload)
  );
  
  return response;
}
```

### 2.2 Implement Fallback Processor

Create `src/services/fallback-processor.ts`:

```typescript
export async function processReviewWithFallback(
  env: Env,
  payload: WebhookPayload
): Promise<void> {
  const review = {
    repository: payload.repository.full_name,
    prNumber: payload.pull_request.number,
    installationId: payload.installation.id,
    action: payload.action,
    timestamp: Date.now(),
    retryCount: 0
  };

  try {
    // Try direct processing
    await processReview(env, review);
  } catch (error) {
    console.error('Direct processing failed:', error);
    
    try {
      // Fallback to Upstash
      await queueToUpstash(env, review);
    } catch (upstashError) {
      console.error('Upstash queueing failed:', upstashError);
      
      // Final fallback to GitHub Actions
      await triggerGitHubAction(env, review);
    }
  }
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

### 3.2 Add Scheduled Handler

Add scheduled handler for processing queued items:

```typescript
// src/index.ts
async scheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  await processQueuedReviews(env, ctx);
}
```

### 3.3 Implement Queue Processor

Create `src/services/queue-processor.ts`:

```typescript
export async function processQueuedReviews(
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const redis = Redis.fromEnv(env);
  
  // Process up to 10 items
  for (let i = 0; i < 10; i++) {
    const item = await redis.lpop('review-queue');
    if (!item) break;
    
    const review = JSON.parse(item);
    
    // Process with retry logic
    ctx.waitUntil(
      processWithRetry(env, review)
    );
  }
}
```

## Phase 4: Update Dependencies

### 4.1 Add New Dependencies

```bash
npm install @upstash/redis
npm install @octokit/action
```

### 4.2 Remove Queue-Related Dependencies

Remove any queue-specific utilities or types that are no longer needed.

## Phase 5: Testing

### 5.1 Local Testing

```bash
# Test webhook handler
curl -X POST http://localhost:8787/webhooks/github \
  -H "Content-Type: application/json" \
  -d @test-webhook-payload.json

# Test scheduled processor
wrangler dev --test-scheduled
```

### 5.2 Staging Deployment

1. Deploy to development environment:
```bash
wrangler deploy --env development
```

2. Test with real GitHub webhooks
3. Monitor logs for errors
4. Verify Upstash queue processing

## Phase 6: Production Deployment

### 6.1 Gradual Rollout

1. **Enable dual-mode operation** (if possible):
   - Keep queue consumer running
   - Enable new architecture in parallel
   - Compare results

2. **Monitor metrics**:
   - Response times
   - Error rates
   - Queue depths
   - Rate limit usage

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

1. Set `ENABLE_QUEUE_FREE_MODE = "false"`
2. Re-enable queue configuration
3. Deploy previous version
4. Investigate issues before retry

## Monitoring Post-Migration

### Key Metrics to Track

- **Webhook response times**: Should be <50ms
- **Background processing success rate**: Target >99%
- **Upstash Redis usage**: Monitor free tier limits
- **GitHub Actions usage**: For private repos
- **Error rates**: Compare to baseline

### Alerting

Set up alerts for:
- High error rates
- Upstash queue depth > threshold
- GitHub Actions failures
- Rate limit approaching

## Common Issues and Solutions

### Issue: Background processing timeouts

**Solution**: Break large reviews into smaller chunks or use GitHub Actions for heavy processing.

### Issue: Upstash connection failures

**Solution**: Implement exponential backoff and fallback to GitHub Actions.

### Issue: Rate limits hit

**Solution**: Adjust sliding window parameters or upgrade to paid tier.

## Migration Timeline

- **Week 1**: Development environment migration
- **Week 2**: Staging testing and monitoring
- **Week 3**: Production gradual rollout
- **Week 4**: Full cutover and cleanup

## Success Criteria

- [ ] All webhooks processed successfully
- [ ] No increase in error rates
- [ ] Response times < 50ms
- [ ] Zero dropped reviews
- [ ] Cost reduced to $0/month

## Support

For issues during migration:
1. Check logs: `wrangler tail`
2. Review error tracking
3. Consult ARCHITECTURE-FREE-TIER.md
4. Open GitHub issue if needed