# ArgusAI Secrets Setup Guide

This guide will help you set up the required secrets for ArgusAI to function properly.

## Required Secrets

The following secrets are **required** for ArgusAI to work:

### 1. GITHUB_APP_PRIVATE_KEY

This is the private key for authenticating as your GitHub App.

**How to get it:**
1. Go to https://github.com/settings/apps/argusai-code-review
2. Scroll down to "Private keys" section
3. Click "Generate a private key"
4. Save the downloaded `.pem` file

**How to set it:**
```bash
wrangler secret put GITHUB_APP_PRIVATE_KEY --env production
# Paste the entire contents of the .pem file, including BEGIN and END lines
```

### 2. GITHUB_WEBHOOK_SECRET

This secret is used to validate that webhooks are coming from GitHub.

**How to get it:**
1. Go to https://github.com/settings/apps/argusai-code-review
2. Find the "Webhook secret" field
3. If empty, generate a secure random string (e.g., `openssl rand -hex 32`)
4. Set it in the GitHub App settings

**How to set it:**
```bash
wrangler secret put GITHUB_WEBHOOK_SECRET --env production
# Enter the webhook secret string
```

### 3. GITHUB_TOKEN

This is a Personal Access Token with access to GitHub Models API.

**How to create one:**
1. Go to https://github.com/settings/personal-access-tokens/new
2. Choose "Fine-grained personal access tokens"
3. Set an expiration (recommend 90 days)
4. Under "Repository access", select "Public Repositories (read-only)"
5. Under "Permissions" → "Account permissions", find "Models" and set to "Read"
6. Click "Generate token"

**Important:** Classic tokens with `models:read` scope do NOT work as of 2025. You must use a fine-grained token.

**How to set it:**
```bash
wrangler secret put GITHUB_TOKEN --env production
# Paste your token (starts with github_pat_)
```

## Optional Secrets

### SENTRY_DSN
For error tracking and monitoring. Get it from your Sentry project settings.

```bash
wrangler secret put SENTRY_DSN --env production
```

### SLACK_WEBHOOK_URL
For sending notifications to Slack. Create an incoming webhook in your Slack workspace.

```bash
wrangler secret put SLACK_WEBHOOK_URL --env production
```

## Quick Setup Script

Run the provided setup script:
```bash
./scripts/set-secrets.sh
```

## Verification

After setting all secrets, verify your deployment:
1. Check status page: https://argus.vogel.yoga/status
2. All checks should show "ok" status
3. Test the webhook: https://argus.vogel.yoga/test

## Troubleshooting

### "Missing" errors on status page
- Ensure you're setting secrets for the `production` environment
- Double-check secret names (case-sensitive)
- Verify the worker was redeployed after setting secrets

### GitHub Models API errors
- Ensure your PAT is fine-grained (not classic)
- Verify the "Models" permission is set to "Read"
- Check token hasn't expired

### Webhook validation failures
- Ensure the webhook secret matches exactly in both GitHub and Cloudflare
- No extra spaces or newlines in the secret

## Security Best Practices

1. **Rotate secrets regularly** - Especially the GitHub token (every 90 days)
2. **Use strong secrets** - Generate webhook secrets with `openssl rand -hex 32`
3. **Limit token scope** - Only grant necessary permissions
4. **Monitor access** - Check GitHub audit logs regularly
5. **Never commit secrets** - Always use wrangler secrets, never hardcode