# ArgusAI Infrastructure as Code

This directory contains Infrastructure as Code (IaC) configurations for deploying ArgusAI to Cloudflare Workers.

## Available IaC Options

### 1. Terraform
- Located in `terraform/`
- Industry standard IaC tool
- Declarative configuration
- Good for teams familiar with HCL

### 2. Pulumi
- Located in `pulumi/`
- TypeScript-based configuration
- Programmatic infrastructure
- Good for teams preferring code over configuration

### 3. Wrangler (Native Cloudflare)
- Configuration in root `wrangler.toml`
- Cloudflare's native CLI tool
- Simplest option for Cloudflare-only deployments
- Commands documented in `/docs/admin-setup-checklist.md`

## Resources Created

All IaC options create the same resources:

### KV Namespaces
- **CACHE**: For caching PR reviews
- **RATE_LIMITS**: For rate limiting
- **CONFIG**: For per-repository configuration

### Queues (Requires Workers Paid Plan)
- **argusai-reviews**: Main review queue
- **argusai-reviews-dlq**: Dead letter queue (production)

### Worker Script
- The main ArgusAI worker application

### Optional Resources
- **Worker Routes**: For custom domain routing
- **R2 Buckets**: For storing large diffs (future feature)

## Choosing an IaC Tool

| Feature | Wrangler | Terraform | Pulumi |
|---------|----------|-----------|---------|
| Setup Complexity | Low | Medium | Medium |
| Learning Curve | Low | Medium | Low (if you know TS) |
| State Management | None | Required | Automatic |
| Multi-Cloud | No | Yes | Yes |
| Programmatic | No | Limited | Full |
| Best For | Simple deployments | Traditional IaC | Dynamic infrastructure |

## Quick Start

### Using Wrangler (Recommended for beginners)
```bash
# From project root
wrangler kv:namespace create "CACHE"
# ... follow admin setup checklist
```

### Using Terraform
```bash
cd infrastructure/terraform
terraform init
terraform apply
```

### Using Pulumi
```bash
cd infrastructure/pulumi
npm install
pulumi up
```

## Current Infrastructure Status

Based on the CLI execution, the following resources have been created:

### Development KV Namespaces
- CACHE: `13021ce160594c9bb2582e976da7a2cc`
- RATE_LIMITS: `06264102637f40a6a366b0cf6b45b2d5`
- CONFIG: `f28a375dc99b45c8905e0d7016544a13`

### Production KV Namespaces
- CACHE: `df70afec18184e6da7a50bad00cbae45`
- RATE_LIMITS: `3f9fae87dddd4751823a13ce49dfa81c`
- CONFIG: `6155db907791462998569c559e71a8cd`

### Queues
- Not created (requires Workers Paid plan)

## Next Steps

1. **For Free Plan Users**: Use KV namespaces only, implement simple async processing
2. **For Paid Plan Users**: Create queues using any IaC method above
3. **Set Secrets**: Use `wrangler secret put` for all required secrets
4. **Deploy Worker**: Use `wrangler deploy` or your chosen IaC tool