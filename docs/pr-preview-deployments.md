# Cloudflare Preview Deployments

ArgusAI uses Cloudflare's native preview deployment system to automatically create preview environments for every commit and pull request.

## How It Works

1. **Automatic Deployment**: Cloudflare automatically deploys every commit to a unique preview URL
2. **GitHub Integration**: Preview URLs are posted as comments on your pull requests
3. **Production-like Environment**: Previews inherit all settings and secrets from production
4. **Debug Logging**: Preview deployments have debug logging enabled for easier troubleshooting

## Features

- Zero configuration required - it just works!
- Full ArgusAI functionality (webhook handling, OAuth, dashboard)
- Same KV namespaces and secrets as production
- Automatic cleanup of old preview deployments
- Preview URLs follow the pattern: `https://{hash}.argusai.pages.dev`
- Automatic PR comments with deployment status

## Setup Requirements

### Enable Preview Deployments

1. Connect your GitHub repository to Cloudflare Pages/Workers:
   - Go to Cloudflare Dashboard → Workers & Pages
   - Select your ArgusAI project
   - Go to Settings → Builds & deployments
   - Connect to your GitHub repository

2. Configure build settings:
   - Build command: `npm run build` (if applicable)
   - Build output directory: `/`
   - Root directory: `/`

3. Environment variables are automatically inherited from production

### No Additional Setup Needed!

Since preview deployments inherit from production:
- All secrets are automatically available
- KV namespaces are shared with production
- No separate configuration required

## Preview Environment Configuration

The preview environment uses these settings (from `wrangler.toml`):

```toml
[env.preview]
name = "argusai-preview"

[env.preview.vars]
ENVIRONMENT = "development"
LOG_LEVEL = "debug"
GITHUB_APP_ID = "1454778"
GITHUB_MODEL = "gpt-4o-mini"
```

## Limitations

1. **Shared KV Storage**: All preview deployments share the same KV namespaces, so data may overlap between PRs
2. **OAuth Callbacks**: GitHub OAuth won't work unless you configure your OAuth app to accept the preview URLs
3. **Webhook URLs**: GitHub webhooks need to be manually configured to test webhook functionality

## Testing Your Preview

1. Open your preview URL from the PR comment
2. Test the dashboard and status page
3. For webhook testing, update your GitHub App's webhook URL temporarily
4. Check logs with: `wrangler tail --env preview --search "argusai-pr-{number}"`

## Troubleshooting

### Preview deployment failed

Check the GitHub Actions logs for errors. Common issues:
- Missing secrets in GitHub repository settings
- KV namespace configuration issues
- TypeScript compilation errors

### Can't access preview URL

- Ensure the deployment completed successfully
- Check if the worker name matches the pattern `argusai-pr-{number}`
- Verify Cloudflare Workers subdomain in the URL

### Logs not showing

Use the correct worker name when tailing logs:
```bash
wrangler tail --env preview --search "argusai-pr-123"
```