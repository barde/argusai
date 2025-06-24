# ArgusAI

[![API Documentation](https://img.shields.io/badge/API-Swagger-85EA2D?logo=swagger)](https://editor.swagger.io/?url=https://raw.githubusercontent.com/barde/argusai/master/argusai-openapi.yaml)
[![Platform](https://img.shields.io/badge/Platform-Cloudflare_Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Intelligent GitHub code review bot powered by LLMs, deployed on Cloudflare Workers edge network for instant, global PR analysis.

## 🚀 Features

- **Instant Reviews** - Sub-50ms webhook processing with zero cold starts
- **GitHub Models** - Free tier LLM access using your GitHub token
- **Global Edge** - Deployed across 300+ cities via Cloudflare Workers
- **Smart Caching** - Intelligent review caching to minimize API calls
- **Zero Infrastructure** - No servers to manage, scales automatically

## 📚 Documentation

- [**API Documentation**](https://editor.swagger.io/?url=https://raw.githubusercontent.com/barde/argusai/master/argusai-openapi.yaml) - Interactive OpenAPI specification
- [**Architecture Overview**](github-llm-code-review-bot.md) - Detailed technical documentation
- [**API Reference**](API.md) - Quick API endpoint reference

## 🎯 Quick Start

### 1. Register GitHub App
```bash
# Go to GitHub Settings → Developer settings → GitHub Apps → New
# App name: ArgusAI
# Webhook URL: https://api.argusai.dev/webhooks/github
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
- **Queue**: Cloudflare Queues
- **Storage**: Workers KV

## 💰 Cost

- **Free tier**: Most teams run completely free
- **Paid tier**: ~$2/month for 1000+ PRs/day
- **No LLM API costs**: Uses GitHub Models free tier

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
Built with ❤️ for developers who value instant, intelligent code reviews.
</p>