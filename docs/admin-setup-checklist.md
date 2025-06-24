# ArgusAI Admin Setup Checklist

This checklist contains all the steps required for an administrator to set up ArgusAI for deployment.

## Prerequisites
- [ ] Cloudflare account with Workers enabled
- [ ] GitHub account with permissions to create GitHub Apps
- [ ] Node.js 18+ and npm installed locally
- [ ] Wrangler CLI installed (`npm install -g wrangler`)

## Step 1: Clone and Install
```bash
git clone https://github.com/[your-org]/argusai.git
cd argusai
npm install
```

## Step 2: Authenticate with Cloudflare
```bash
wrangler login
```

## Step 3: Create GitHub App

### Option A: Using the manifest (Recommended)
1. Visit: `https://github.com/settings/apps/new`
2. Import the manifest from `/scripts/github-app-manifest.json`
3. Customize the app name and webhook URL
4. Create the app

### Option B: Manual creation
Follow the guide at `/docs/github-app-setup.md`

### After creation, note down:
- [ ] **App ID**: _________________
- [ ] **Client ID**: _________________
- [ ] **Download private key** (.pem file)

## Step 4: Generate Webhook Secret
```bash
openssl rand -hex 32
```
- [ ] **Webhook Secret**: _________________

## Step 5: Create GitHub Personal Access Token
1. Go to: https://github.com/settings/personal-access-tokens/new
2. Select "Fine-grained personal access token"
3. Set expiration as needed
4. Select permissions:
   - [ ] **Models: Read** (required)
5. Generate token
- [ ] **GitHub Token**: _________________

## Step 6: Create KV Namespaces

### Development namespaces:
```bash
wrangler kv:namespace create "CACHE"
# Output: Created namespace with ID: xxxxxxxxxx
```
- [ ] **CACHE namespace ID**: _________________

```bash
wrangler kv:namespace create "RATE_LIMITS"
# Output: Created namespace with ID: xxxxxxxxxx
```
- [ ] **RATE_LIMITS namespace ID**: _________________

```bash
wrangler kv:namespace create "CONFIG"
# Output: Created namespace with ID: xxxxxxxxxx
```
- [ ] **CONFIG namespace ID**: _________________

### Production namespaces:
```bash
wrangler kv:namespace create "CACHE" --env production
```
- [ ] **Production CACHE namespace ID**: _________________

```bash
wrangler kv:namespace create "RATE_LIMITS" --env production
```
- [ ] **Production RATE_LIMITS namespace ID**: _________________

```bash
wrangler kv:namespace create "CONFIG" --env production
```
- [ ] **Production CONFIG namespace ID**: _________________

## Step 7: Create Queue
```bash
wrangler queues create argusai-reviews
```
- [ ] Queue created successfully

## Step 8: Update wrangler.toml

Edit `wrangler.toml` and replace the placeholder values:

### Development environment:
```toml
[vars]
GITHUB_APP_ID = "[Your App ID from Step 3]"

[[kv_namespaces]]
binding = "CACHE"
id = "[Your CACHE namespace ID from Step 6]"

[[kv_namespaces]]
binding = "RATE_LIMITS" 
id = "[Your RATE_LIMITS namespace ID from Step 6]"

[[kv_namespaces]]
binding = "CONFIG"
id = "[Your CONFIG namespace ID from Step 6]"
```

### Production environment:
```toml
[env.production.vars]
GITHUB_APP_ID = "[Your App ID from Step 3]"

[[env.production.kv_namespaces]]
binding = "CACHE"
id = "[Your Production CACHE namespace ID from Step 6]"

[[env.production.kv_namespaces]]
binding = "RATE_LIMITS"
id = "[Your Production RATE_LIMITS namespace ID from Step 6]"

[[env.production.kv_namespaces]]
binding = "CONFIG"
id = "[Your Production CONFIG namespace ID from Step 6]"
```

## Step 9: Set Secrets

```bash
# Set the GitHub App private key (paste the entire .pem file contents)
wrangler secret put GITHUB_APP_PRIVATE_KEY

# Set the webhook secret (from Step 4)
wrangler secret put GITHUB_WEBHOOK_SECRET

# Set the GitHub token (from Step 5)
wrangler secret put GITHUB_TOKEN
```

For production:
```bash
wrangler secret put GITHUB_APP_PRIVATE_KEY --env production
wrangler secret put GITHUB_WEBHOOK_SECRET --env production
wrangler secret put GITHUB_TOKEN --env production
```

## Step 10: Deploy

### Development deployment:
```bash
wrangler deploy
```

### Production deployment:
```bash
wrangler deploy --env production
```

## Step 11: Update GitHub App Webhook URL

1. Go to your GitHub App settings
2. Update the Webhook URL to your Cloudflare Workers URL:
   - Development: `https://argusai-dev.[your-subdomain].workers.dev/webhooks/github`
   - Production: `https://argusai.[your-domain].com/webhooks/github`

## Step 12: Install GitHub App

1. Visit your GitHub App's public page
2. Click "Install"
3. Select the repositories you want to monitor

## Optional Setup

### Error Tracking (Sentry)
```bash
wrangler secret put SENTRY_DSN
wrangler secret put SENTRY_DSN --env production
```

### Slack Notifications
```bash
wrangler secret put SLACK_WEBHOOK_URL
wrangler secret put SLACK_WEBHOOK_URL --env production
```

## Verification

### Test the deployment:
```bash
curl https://[your-worker-url]/health
```

### Check logs:
```bash
wrangler tail
```

### Test webhook:
Create a test PR in a repository where the app is installed.

## Troubleshooting

- **Webhook signature validation fails**: Ensure GITHUB_WEBHOOK_SECRET matches exactly
- **Authentication errors**: Verify GITHUB_APP_PRIVATE_KEY is the complete .pem file
- **Models API errors**: Check GITHUB_TOKEN has `models:read` permission
- **Queue errors**: Ensure queue name matches in wrangler.toml and actual queue

## Complete! 🎉

Your ArgusAI instance is now ready to review pull requests!