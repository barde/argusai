# GitHub App Setup Guide

This guide walks you through setting up the ArgusAI GitHub App for your organization or personal account.

## Prerequisites

- GitHub account with permissions to create GitHub Apps
- Access to your organization's settings (if creating for an org)
- The deployed ArgusAI webhook URL

## Step 1: Create GitHub App

1. Navigate to GitHub Settings:
   - Personal: `https://github.com/settings/apps/new`
   - Organization: `https://github.com/organizations/{org}/settings/apps/new`

2. Fill in the basic information:
   - **GitHub App name**: `ArgusAI` (or `ArgusAI-{org}` if taken)
   - **Description**: "Intelligent code review bot powered by LLMs"
   - **Homepage URL**: `https://argusai.dev` (or your custom domain)

## Step 2: Configure Webhook

1. **Webhook URL**: 
   - Production: `https://api.argusai.dev/webhooks/github`
   - Development: `https://your-worker.workers.dev/webhooks/github`

2. **Webhook secret**: Generate a secure random string:
   ```bash
   openssl rand -hex 32
   ```
   Save this secret - you'll need it for the `GITHUB_WEBHOOK_SECRET` environment variable.

3. **SSL verification**: Leave enabled (default)

## Step 3: Set Permissions

Configure the following repository permissions:

### Repository permissions:
- **Pull requests**: Read & Write
  - Required to read PR details and post review comments
- **Issues**: Write
  - Required to create review comments on PRs
- **Contents**: Read
  - Required to read repository files and diffs
- **Metadata**: Read
  - Automatically required

### Organization permissions:
- None required

### Account permissions:
- None required

## Step 4: Subscribe to Events

Select the following webhook events:

- [x] Pull request
- [x] Pull request review
- [x] Pull request review comment

## Step 5: Installation Settings

1. **Where can this GitHub App be installed?**
   - Choose based on your needs:
     - "Only on this account" for private use
     - "Any account" for public availability

2. Click "Create GitHub App"

## Step 6: Generate Private Key

1. After creation, scroll to "Private keys" section
2. Click "Generate a private key"
3. Save the downloaded `.pem` file securely
4. This will be your `GITHUB_APP_PRIVATE_KEY`

## Step 7: Note App Credentials

From the app settings page, note down:
- **App ID**: Displayed at the top (e.g., `123456`)
- **Client ID**: Under "About" section
- **Installation ID**: After installing, found in the URL

## Step 8: Create GitHub Token for Models API

1. Go to: `https://github.com/settings/personal-access-tokens/new`
2. Create a fine-grained personal access token:
   - **Token name**: `ArgusAI Models Access`
   - **Expiration**: 90 days (or custom)
   - **Repository access**: Public repositories (read-only)
   - **Permissions**: 
     - Account permissions → Models: Read

3. Copy the token (starts with `github_pat_`)
4. This will be your `GITHUB_TOKEN`

## Step 9: Install the App

1. Go to the app's public page:
   `https://github.com/apps/{your-app-name}`

2. Click "Install" or "Configure"

3. Select repositories:
   - "All repositories" for organization-wide access
   - "Selected repositories" for specific repos

4. Click "Install"

## Step 10: Configure ArgusAI

Set the following environment variables in your Cloudflare Workers:

```bash
# Set secrets
wrangler secret put GITHUB_APP_PRIVATE_KEY
# Paste the entire private key including BEGIN/END lines

wrangler secret put GITHUB_WEBHOOK_SECRET
# Paste the webhook secret from Step 2

wrangler secret put GITHUB_TOKEN
# Paste the PAT from Step 8
```

Update `wrangler.toml` with your App ID:
```toml
[vars]
GITHUB_APP_ID = "123456"  # Your App ID from Step 7
```

## Verification

1. Create a test PR in one of your installed repositories
2. Check the Cloudflare Workers logs for webhook receipt
3. Verify the bot posts a review comment

## Troubleshooting

### Bot not responding to PRs
- Check webhook delivery in GitHub App settings → Advanced → Recent deliveries
- Verify all secrets are correctly set
- Check Cloudflare Workers logs for errors

### Authentication errors
- Ensure the private key is properly formatted (including newlines)
- Verify the GitHub token has `models:read` permission
- Check the App ID matches your GitHub App

### Rate limiting
- GitHub Models API has rate limits
- Consider using `gpt-4o-mini` for higher limits
- Implement caching to reduce API calls

## Security Best Practices

1. **Rotate secrets regularly**:
   - Webhook secret every 90 days
   - GitHub PAT before expiration
   - App private key annually

2. **Limit repository access**:
   - Only install on repositories that need reviews
   - Use repository-specific configurations

3. **Monitor usage**:
   - Check GitHub App insights
   - Monitor Cloudflare Workers analytics
   - Set up alerts for errors

## Next Steps

- Configure repository-specific settings via the API
- Set up monitoring and alerts
- Customize review prompts for your team's needs