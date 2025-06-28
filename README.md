# ArgusAI

[![CI](https://github.com/barde/argusai/actions/workflows/ci.yml/badge.svg)](https://github.com/barde/argusai/actions/workflows/ci.yml)
[![CodeQL](https://github.com/barde/argusai/actions/workflows/codeql.yml/badge.svg)](https://github.com/barde/argusai/actions/workflows/codeql.yml)
[![API Documentation](https://img.shields.io/badge/API-Swagger-85EA2D?logo=swagger)](https://editor.swagger.io/?url=https://raw.githubusercontent.com/barde/argusai/master/argusai-openapi.yaml)
[![Platform](https://img.shields.io/badge/Platform-Cloudflare_Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Page-brightgreen)](https://argus.vogel.yoga)

Intelligent GitHub code review bot powered by LLMs, deployed on Cloudflare Workers edge network for instant, global PR analysis.

## 🚀 Features

- **Instant Reviews** - Sub-50ms webhook processing with zero cold starts
- **GitHub Models** - Free tier LLM access using your GitHub token
- **Global Edge** - Deployed across 300+ cities via Cloudflare Workers
- **Smart Caching** - Intelligent review caching to minimize API calls
- **Zero Infrastructure** - No servers to manage, scales automatically
- **Free Tier Optimized** - Runs completely free for most teams

## 📚 Documentation

- [**API Documentation**](https://editor.swagger.io/?url=https://raw.githubusercontent.com/barde/argusai/master/argusai-openapi.yaml) - Interactive OpenAPI specification
- [**Architecture Overview**](github-llm-code-review-bot.md) - Detailed technical documentation
- [**API Reference**](API.md) - Quick API endpoint reference

## 🔍 Monitoring & Status

### Production Instance
- **Status Page**: [https://argus.vogel.yoga](https://argus.vogel.yoga) - Visual health dashboard (root page)
- **Status API**: [https://argus.vogel.yoga/status](https://argus.vogel.yoga/status) - JSON status endpoint
- **Health Check**: [https://argus.vogel.yoga/health](https://argus.vogel.yoga/health) - Simple health endpoint

### Local Development
When running locally with `wrangler dev`:
- **Status Page**: [http://localhost:8787](http://localhost:8787) - Root page
- **Status API**: [http://localhost:8787/status](http://localhost:8787/status)
- **Health Check**: [http://localhost:8787/health](http://localhost:8787/health)

## 🎯 Quick Start

### 1. Register GitHub App
```bash
# Go to GitHub Settings → Developer settings → GitHub Apps → New
# App name: ArgusAI
# Webhook URL: https://argus.vogel.yoga/webhooks/github
```

### 2. Get GitHub Token
Create a fine-grained personal access token with `models:read` permission for GitHub Models API access.

### 3. Deploy to Cloudflare
```bash
git clone https://github.com/barde/argusai.git
cd argusai
npm install
wrangler login
wrangler secret put GITHUB_TOKEN
wrangler deploy --env production
```

### 4. Install on Repository
Install the ArgusAI app on your repositories and watch it review PRs instantly!

## 🛠️ Tech Stack

- **Runtime**: Cloudflare Workers (V8 Isolates)
- **Language**: TypeScript
- **LLM**: GitHub Models API (free tier)
- **Processing**: event.waitUntil() for async tasks
- **Storage**: Workers KV
- **Logging**: Console logs with wrangler tail

## 💰 Cost

- **Workers**: 100,000 requests/day free
- **KV**: 100,000 reads/day, 1,000 writes/day free
- **GitHub Models**: Completely free
- **Total**: $0 for most teams

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
Built with ❤️ for developers who value instant, intelligent code reviews.
</p>