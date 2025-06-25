# ArgusAI Free Tier Architecture

This document explains how ArgusAI runs completely free on Cloudflare Workers' free tier.

## Architecture Overview

Instead of using Cloudflare Queues (which require a paid plan), ArgusAI uses the `event.waitUntil()` pattern for asynchronous processing. This allows the webhook handler to return immediately while processing continues in the background.

## Key Components

### 1. Webhook Handler
```typescript
export async function webhookHandler(c: Context<{ Bindings: Env }>) {
  // Validate webhook signature
  // Check rate limits
  // Parse PR data
  
  // Return response immediately (< 50ms)
  const response = c.json({ 
    status: 'accepted',
    message: 'Processing started' 
  }, 200);
  
  // Process review asynchronously
  c.executionCtx.waitUntil(
    processReviewAsync(prData, c.env)
      .catch(error => console.error('Review failed:', error))
  );
  
  return response;
}
```

### 2. Async Processing
The review processing happens after the webhook response is sent:
- Fetch PR diff from GitHub
- Send to GitHub Models API for analysis
- Post comments back to GitHub
- Cache results in KV

### 3. Logging
Since KV has write limits on the free tier, we use console.log() for logging:
```bash
# View real-time logs
wrangler tail

# View logs for specific environment
wrangler tail --env production
```

## Free Tier Limits

### Cloudflare Workers Free Tier
- **Requests**: 100,000/day
- **CPU Time**: 10ms/request (but waitUntil() can run longer)
- **Memory**: 128MB
- **Subrequests**: 50/request

### Workers KV Free Tier
- **Reads**: 100,000/day
- **Writes**: 1,000/day (with 1 write/second limit)
- **Storage**: 1GB
- **Key Size**: 512 bytes
- **Value Size**: 25MB

### GitHub Models API
- **Cost**: Completely free
- **Models**: gpt-4o, gpt-4o-mini, o1-preview, o1-mini
- **Rate Limits**: Varies by model

## Optimization Strategies

### 1. KV Write Optimization
Be mindful of the 1 write/second limit:
```typescript
async function cacheReview(key: string, data: any, env: Env) {
  try {
    await env.CACHE.put(key, JSON.stringify(data), {
      expirationTtl: 86400 // 24 hours
    });
  } catch (error) {
    // Don't fail if caching fails
    console.warn('Cache write failed:', error);
  }
}
```

### 2. Smart Caching
- Cache review results for 24 hours
- Check cache before processing
- Use SHA-based cache keys for consistency

### 3. Rate Limiting
- Use KV for rate limit counters (short TTL)
- Implement per-repository limits
- Return 429 when exceeded

## Cost Analysis

For a typical team:
- **50 PRs/day** = 50 webhook requests
- **200 PR views/day** = 200 cache reads
- **Total**: 250 requests/day (0.25% of free tier)

This architecture supports teams with up to 1,000 active PRs/day completely free.

## Migration Path

If you outgrow the free tier:
1. Enable Cloudflare Queues for better reliability
2. Add R2 for log storage
3. Use Durable Objects for advanced rate limiting
4. Consider Workers Paid plan ($5/month)

## Example Deployment

```bash
# Clone the repository
git clone https://github.com/yourusername/argusai
cd argusai

# Install dependencies
npm install

# Configure secrets
wrangler secret put GITHUB_APP_PRIVATE_KEY
wrangler secret put GITHUB_WEBHOOK_SECRET
wrangler secret put GITHUB_TOKEN

# Deploy to Cloudflare
wrangler deploy

# View logs
wrangler tail
```

## Monitoring

Use these commands to monitor your app:
```bash
# Real-time logs
wrangler tail

# Check KV usage
wrangler kv:key list --binding=CACHE

# View metrics in Cloudflare dashboard
# https://dash.cloudflare.com
```