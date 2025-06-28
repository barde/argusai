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

### Create KV namespaces:
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

## Step 7: Create Queue (Skip if Using Free Tier)

**Note**: Queues require a Workers Paid plan. If you're using the free tier architecture, skip this step and refer to the [free tier architecture guide](../ARCHITECTURE-FREE-TIER.md).

```bash
# Only if you have Workers Paid plan:
wrangler queues create argusai-reviews
```
- [ ] Queue created successfully (or skipped for free tier)

## Step 8: Update wrangler.toml

Edit `wrangler.toml` and replace the placeholder values:

```toml
[vars]
GITHUB_APP_ID = "[Your App ID from Step 3]"
ENVIRONMENT = "production"

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

## Step 9: Build and Deploy (Required Before Setting Secrets)

**Important**: You must build and deploy the Worker first before you can add secrets to it.

### Build the project:
```bash
npm run build
```

### Deploy to production:
```bash
wrangler deploy
```

**Note**: If you encounter TypeScript errors during build, ensure all dependencies are installed with `npm install`.

## Step 10: Set Secrets

Now that the Workers exist, you can add secrets to them:

### Set secrets:
```bash
# Set the GitHub App private key (paste the entire .pem file contents)
wrangler secret put GITHUB_APP_PRIVATE_KEY

# Set the webhook secret (from Step 4)
wrangler secret put GITHUB_WEBHOOK_SECRET

# Set the GitHub token (from Step 5)
wrangler secret put GITHUB_TOKEN
```

## Step 11: Update GitHub App Webhook URL

1. Go to your GitHub App settings
2. Update the Webhook URL to your production URL:
   - `https://argus.vogel.yoga/webhooks/github`

## Step 12: Install GitHub App

1. Visit your GitHub App's public page
2. Click "Install"
3. Select the repositories you want to monitor

## Optional Setup

### Error Tracking (Sentry)
```bash
wrangler secret put SENTRY_DSN
```

### Slack Notifications
```bash
wrangler secret put SLACK_WEBHOOK_URL
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