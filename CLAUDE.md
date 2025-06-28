# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ArgusAI is an intelligent GitHub code review bot powered by LLMs, deployed on Cloudflare Workers edge network. It provides instant, automated PR analysis using GitHub Models API (free tier).

## Key Architecture Components

### Free Tier Architecture
1. **Webhook Handler** (src/handlers/webhook.ts) - Receives webhooks, validates, returns fast response
2. **Async Processing** (event.waitUntil) - Processes reviews asynchronously without queues
3. **Storage Layer** (Workers KV) - Caches reviews, rate limits, and configurations

### Core Services
- **LLM Service** (src/services/llm.ts) - GitHub Models API integration
- **GitHub Service** (src/services/github.ts) - Octokit-based PR interactions
- **Review Service** (src/services/review.ts) - Async review processing logic
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

### Logging and Debugging

#### View Real-Time Logs
```bash
# Basic real-time logs
wrangler tail --env development

# Pretty formatted logs (human-readable with colors)
wrangler tail --env development --format pretty

# JSON formatted logs (for parsing/piping)
wrangler tail --env development --format json

# View logs for production
wrangler tail --env production --format pretty
```

#### Filter and Search Logs
```bash
# Filter by error status
wrangler tail --env development --status error

# Search for specific text (e.g., errors)
wrangler tail --env development --search "ERROR"
wrangler tail --env development --search "Failed"

# Filter by HTTP method
wrangler tail --env development --method POST

# Apply sampling rate (e.g., 10% of logs)
wrangler tail --env development --sampling-rate 0.1

# Combine filters
wrangler tail --env development --format pretty --search "ERROR" --method POST
```

#### Advanced Log Analysis
```bash
# Parse JSON logs with jq
wrangler tail --env development --format json | jq '.logs[0].message'

# Save logs to file
wrangler tail --env development --format json > worker-logs.json

# Get single log event then disconnect
wrangler tail --env development --once

# Extract specific fields from logs
wrangler tail --env development --format json | jq -r '.logs[].message[] | select(. | contains("ERROR"))'

# Monitor errors in real-time with pretty output
wrangler tail --env development --format pretty --search "[ERROR]"
```

#### Common Log Patterns in ArgusAI
- Webhook received: `"Webhook responded in Xms"`
- Processing started: `"Starting review processing"`
- Errors: Look for `[ERROR]` prefix
- GitHub API failures: `"Failed to fetch pull request"`
- Models API issues: `"GitHub Models API error"`

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
- Return response in <50ms using early response pattern
- Use event.waitUntil() for async processing

### KV Storage Patterns
- **Cache keys**: `review:${owner}/${repo}/${pr}:${sha}`
- **Rate limit keys**: `rate:${installationId}:${window}`
- **Config keys**: `config:${owner}/${repo}`
- **Dedup keys**: `dedup:${owner}/${repo}/${pr}:${eventId}`

### Free Tier Limits
- **Workers**: 100,000 requests/day
- **KV Reads**: 100,000/day
- **KV Writes**: 1,000/day (1 write/second limit)
- **CPU Time**: 10ms per request (use waitUntil for longer tasks)

### GitHub Models API
- Endpoint: `https://models.inference.ai.azure.com/chat/completions`
- Models: `gpt-4o`, `gpt-4o-mini`, `o1-preview`, `o1-mini`
- Authentication: Fine-grained personal access token with "Models" permission (read-only)
- Rate limits: Varies by model, handle 429 responses
- Note: Classic tokens with `models:read` scope do NOT work (as of 2025)

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

# No queues needed for free tier
# Processing happens via event.waitUntil()
```

## Project Status

Currently implementing free tier architecture. When implementing:

1. Webhook handler with event.waitUntil() pattern
2. Review processing service for async operations
3. GitHub Models integration for LLM analysis
4. Simple logging using console.log() and wrangler tail
5. KV storage with awareness of 1 write/second limit

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