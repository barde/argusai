# Configuration Best Practices for ArgusAI

## Overview

This document outlines best practices for managing configuration in ArgusAI, particularly regarding what should be committed to version control versus kept as secrets.

## What Goes in wrangler.toml (Safe to Commit)

### ✅ Resource IDs and Names
```toml
# KV Namespace IDs - NOT secrets
[[kv_namespaces]]
binding = "CACHE"
id = "13021ce160594c9bb2582e976da7a2cc"

# R2 Bucket Names
[[r2_buckets]]
binding = "STORAGE"
bucket_name = "my-bucket"

# D1 Database IDs
[[d1_databases]]
binding = "DB"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### ✅ Environment Variables (Non-Sensitive)
```toml
[vars]
ENVIRONMENT = "production"
GITHUB_APP_ID = "123456"  # App ID is public information
LOG_LEVEL = "info"
GITHUB_MODEL = "gpt-4o-mini"
```

### ✅ Routes and Domains
```toml
routes = [
  { pattern = "api.example.com/*", zone_name = "example.com" }
]
```

## What Should Be Secrets (Use wrangler secret put)

### 🔐 Authentication Credentials
```bash
# GitHub App Private Key
wrangler secret put GITHUB_APP_PRIVATE_KEY --env production

# Webhook Secrets
wrangler secret put GITHUB_WEBHOOK_SECRET --env production

# API Tokens
wrangler secret put GITHUB_TOKEN --env production
```

### 🔐 Third-Party Service Keys
```bash
# Optional services
wrangler secret put SENTRY_DSN --env production
wrangler secret put SLACK_WEBHOOK_URL --env production
```

## Environment-Specific Configuration

### Development vs Production
```toml
# Development environment
[env.development]
name = "argusai-dev"

[[env.development.kv_namespaces]]
binding = "CACHE"
id = "dev-namespace-id"  # Different namespace for dev

# Production environment
[env.production]
name = "argusai"

[[env.production.kv_namespaces]]
binding = "CACHE"
id = "prod-namespace-id"  # Different namespace for prod
```

## Local Development Secrets

### Using .dev.vars (Git Ignored)
```bash
# .dev.vars
GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----
GITHUB_WEBHOOK_SECRET=your-dev-secret
GITHUB_TOKEN=ghp_your_dev_token
```

### Environment-Specific .dev.vars
```bash
# .dev.vars.production
GITHUB_APP_PRIVATE_KEY=production-key
GITHUB_WEBHOOK_SECRET=production-secret

# .dev.vars.staging
GITHUB_APP_PRIVATE_KEY=staging-key
GITHUB_WEBHOOK_SECRET=staging-secret
```

## Why This Approach?

1. **Security**: Real secrets never touch version control
2. **Collaboration**: Team members can clone and understand the project structure
3. **Deployment**: CI/CD can use the committed configuration
4. **Transparency**: Resource bindings are clear and documented

## Common Misconceptions

### ❌ "KV Namespace IDs are secrets"
**Reality**: They're resource identifiers, not authentication credentials. Cloudflare validates ownership during deployment.

### ❌ "All IDs should be environment variables"
**Reality**: Only authentication credentials need to be secrets. Resource IDs are configuration.

### ❌ "wrangler.toml shouldn't be in Git"
**Reality**: It's designed to be committed. It's your infrastructure as code.

## Migration from Environment Variables

If you previously used environment variables for KV namespace IDs:

### Before (Not Recommended)
```bash
export KV_NAMESPACE_ID="13021ce160594c9bb2582e976da7a2cc"
```

### After (Recommended)
```toml
# wrangler.toml
[[kv_namespaces]]
binding = "CACHE"
id = "13021ce160594c9bb2582e976da7a2cc"
```

## Summary

- **Commit to Git**: wrangler.toml with all resource IDs
- **Keep as Secrets**: API keys, tokens, private keys
- **Use .dev.vars**: For local development secrets
- **Use wrangler secret**: For production secrets

This approach balances security, usability, and follows Cloudflare's intended design patterns.