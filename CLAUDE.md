# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ArgusAI is an intelligent GitHub code review bot powered by LLMs, deployed on Cloudflare Workers edge network. It provides instant, automated PR analysis using GitHub Models API (free tier).

## Key Architecture Components

### Three-Layer Architecture
1. **Webhook Handler** (src/index.ts) - Receives GitHub webhooks, validates signatures, queues tasks
2. **Queue Consumer** (src/consumer.ts) - Processes reviews asynchronously via Cloudflare Queues
3. **Storage Layer** (Workers KV) - Caches reviews, rate limits, and configurations

### Core Services
- **LLM Service** (src/services/llm.ts) - GitHub Models API integration
- **GitHub Service** (src/services/github.ts) - Octokit-based PR interactions
- **Storage Service** (src/services/storage.ts) - KV-based caching and rate limiting
- **Config Service** (src/services/config.ts) - Per-repository configuration

## Development Commands

### Initial Setup
```bash
npm install                    # Install dependencies
wrangler login                # Authenticate with Cloudflare
```

### Local Development
```bash
wrangler dev --local --persist # Run locally with persistence
wrangler dev --env production  # Run with production config
```

### Testing
```bash
npm test                      # Run test suite (when implemented)
npm run test:watch           # Run tests in watch mode
```

### Deployment
```bash
# Set secrets (required before first deploy)
wrangler secret put GITHUB_APP_PRIVATE_KEY
wrangler secret put GITHUB_WEBHOOK_SECRET
wrangler secret put GITHUB_TOKEN  # GitHub PAT with models:read scope

# Deploy to production
wrangler deploy --env production
```

### Queue Management
```bash
wrangler queues create argusai-reviews  # Create queue (one-time)
```

### KV Namespace Creation
```bash
wrangler kv:namespace create "CACHE"
wrangler kv:namespace create "RATE_LIMITS"
wrangler kv:namespace create "CONFIG"
```

## Critical Implementation Details

### GitHub Webhook Signature Validation
- Must validate `X-Hub-Signature-256` header using HMAC-SHA256
- Return 401 if signature is invalid
- Process must complete in <50ms to avoid timeouts

### Queue Message Format
```typescript
interface ReviewMessage {
  repository: string;
  prNumber: number;
  installationId: number;
  action: 'opened' | 'synchronize';
  timestamp: number;
}
```

### KV Storage Patterns
- **Cache keys**: `review:${owner}/${repo}/${pr}:${sha}`
- **Rate limit keys**: `rate:${installationId}:${window}`
- **Config keys**: `config:${owner}/${repo}`
- **Dedup keys**: `dedup:${owner}/${repo}/${pr}:${eventId}`

### GitHub Models API
- Endpoint: `https://api.github.com/chat/completions`
- Models: `gpt-4o`, `gpt-4o-mini`, `o1-preview`, `o1-mini`
- Authentication: Bearer token with `models:read` permission
- Rate limits: Varies by model, handle 429 responses

### Environment Variables (via wrangler.toml bindings)
```toml
[vars]
GITHUB_APP_ID = "your-app-id"
ENVIRONMENT = "production"

[[kv_namespaces]]
binding = "CACHE"
id = "your-cache-namespace-id"

[[kv_namespaces]]
binding = "RATE_LIMITS"
id = "your-rate-limits-namespace-id"

[[kv_namespaces]]
binding = "CONFIG"
id = "your-config-namespace-id"

[[queues.producers]]
binding = "REVIEW_QUEUE"
queue = "argusai-reviews"

[[queues.consumers]]
queue = "argusai-reviews"
max_batch_size = 10
max_retries = 3
```

## Project Status

Currently in documentation phase. No source code exists yet. When implementing:

1. Start with Phase 1 issues (#2, #3, #4) - can be done in parallel
2. Webhook handler (#5) must be completed before queue consumer (#6)
3. GitHub Models integration (#7) can be developed independently
4. Features in Phase 3 (#8, #9, #10) can all be done in parallel
5. Always run linting/type checking before committing (commands TBD based on package.json setup)

## Key Dependencies

- **Hono v4** - Web framework for Workers
- **@cloudflare/workers-types** - TypeScript types
- **@octokit/rest** - GitHub API client
- **TypeScript** - Type safety
- **Wrangler** - Cloudflare CLI tool

## API Endpoints

- `POST /webhooks/github` - GitHub webhook receiver
- `GET /health` - Health check endpoint
- `GET /config/{repository}` - Get repo configuration
- `PUT /config/{repository}` - Update repo configuration

See argusai-openapi.yaml for complete API specification.