# Testing ArgusAI on Your Repository

This guide walks you through testing ArgusAI on your own GitHub repository.

## Prerequisites

- ArgusAI deployed to Cloudflare Workers
- GitHub App created and configured
- Repository access for the GitHub App

## Testing Methods

### Method 1: Direct Webhook Testing (Recommended for Development)

#### 1. Check Worker Health

```bash
curl https://argusai-dev.meise.workers.dev/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "environment": "development",
  "timestamp": "2024-12-01T00:00:00.000Z"
}
```

#### 2. Create a Test Webhook Payload

Create `test-webhook.json`:
```json
{
  "action": "opened",
  "pull_request": {
    "number": 1,
    "title": "Test PR for ArgusAI",
    "body": "This is a test pull request to verify ArgusAI functionality",
    "draft": false,
    "state": "open",
    "user": {
      "login": "testuser",
      "type": "User"
    },
    "head": {
      "ref": "feature/test",
      "sha": "abc123def456"
    },
    "base": {
      "ref": "main"
    },
    "additions": 50,
    "deletions": 10,
    "changed_files": 3
  },
  "repository": {
    "full_name": "your-username/your-repo",
    "owner": {
      "login": "your-username"
    },
    "name": "your-repo"
  },
  "installation": {
    "id": 12345
  }
}
```

#### 3. Generate Webhook Signature

Create a script `generate-signature.js`:
```javascript
const crypto = require('crypto');
const fs = require('fs');

const webhook_secret = process.env.GITHUB_WEBHOOK_SECRET;
const payload = fs.readFileSync('test-webhook.json', 'utf8');

const signature = 'sha256=' + crypto
  .createHmac('sha256', webhook_secret)
  .update(payload)
  .digest('hex');

console.log('X-Hub-Signature-256:', signature);
```

Run it:
```bash
GITHUB_WEBHOOK_SECRET=your-webhook-secret node generate-signature.js
```

#### 4. Send Test Webhook

```bash
curl -X POST https://argusai-dev.meise.workers.dev/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: test-delivery-$(date +%s)" \
  -H "X-Hub-Signature-256: YOUR_GENERATED_SIGNATURE" \
  -d @test-webhook.json
```

### Method 2: GitHub App Installation (Production Testing)

#### 1. Install GitHub App on Your Repository

1. Go to GitHub Settings → Developer settings → GitHub Apps
2. Click on your ArgusAI app
3. Click "Install App"
4. Select the repository you want to test on
5. Grant necessary permissions

#### 2. Configure Webhook URL

In your GitHub App settings:
- **Webhook URL**: `https://argusai-dev.meise.workers.dev/webhooks/github`
- **Webhook secret**: Your configured secret

#### 3. Create a Test Pull Request

1. Create a new branch in your test repository:
```bash
git checkout -b test/argusai-review
```

2. Make some code changes. For example, create `test.js`:
```javascript
// This function has intentional issues for testing
function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i <= items.length; i++) {  // Bug: should be i < items.length
    total += items[i].price;  // Potential error: no null check
  }
  return total;
}

// Security issue: eval usage
function executeCode(code) {
  return eval(code);  // Security vulnerability
}

// Performance issue
function findItem(items, id) {
  return items.find(item => item.id == id);  // Should use === for type safety
}
```

3. Commit and push:
```bash
git add test.js
git commit -m "Add test functions for ArgusAI review"
git push origin test/argusai-review
```

4. Create a pull request through GitHub UI

### Method 3: Using ngrok for Local Testing

If you want to test locally before deploying:

#### 1. Install ngrok
```bash
npm install -g ngrok
# or
brew install ngrok
```

#### 2. Run Worker Locally
```bash
wrangler dev --local --persist
```

#### 3. Expose Local Worker
```bash
ngrok http 8787
```

#### 4. Update GitHub App Webhook URL
Use the ngrok URL (e.g., `https://abc123.ngrok.io/webhooks/github`)

## Monitoring and Debugging

### View Worker Logs

```bash
# Real-time logs
wrangler tail --env development

# Filter for errors
wrangler tail --env development --search "ERROR"

# Filter for specific PR
wrangler tail --env development --search "PR-123"
```

### Check KV Storage

```bash
# List all cache entries
wrangler kv:key list --binding=CACHE --env=development

# Get specific review from cache
wrangler kv:key get --binding=CACHE "review:owner/repo:1:abc123" --env=development

# Check rate limits
wrangler kv:key list --binding=RATE_LIMITS --env=development
```

## Expected Behavior

When a PR is opened or updated, ArgusAI should:

1. **Acknowledge quickly** (<50ms response to GitHub)
2. **Process in background** (may take 5-30 seconds)
3. **Post a review** with:
   - Summary with verdict (Approve/Comment/Request Changes)
   - Inline comments on specific lines
   - Severity indicators (🔴 Critical, 🟡 Important, 🟢 Minor)
   - Category labels (🐛 Bug, 🔒 Security, ⚡ Performance)

## Troubleshooting

### Bot Doesn't Respond

1. Check webhook delivery in GitHub:
   - Go to Settings → Webhooks → Recent Deliveries
   - Look for failed deliveries (red X)
   - Click to see request/response details

2. Verify worker is running:
```bash
curl https://argusai-dev.meise.workers.dev/health
```

3. Check logs for errors:
```bash
wrangler tail --env development --search "ERROR"
```

### Invalid Signature Errors

1. Verify webhook secret matches:
```bash
# List secrets
wrangler secret list --env development

# Re-set if needed
wrangler secret put GITHUB_WEBHOOK_SECRET --env development
```

### Rate Limit Errors

Check current rate limit usage:
```bash
wrangler kv:key list --binding=RATE_LIMITS --env=development --prefix="rate:"
```

### No Review Posted

1. Check if PR is from a bot (bot PRs are ignored)
2. Verify GitHub token has correct permissions:
   - `pull_requests: write`
   - `contents: read`
   - `issues: write`

3. Check for API errors in logs:
```bash
wrangler tail --env development --search "github-api"
```

## Testing Different Scenarios

### Test Security Issues

Create a file with security vulnerabilities:
```javascript
// SQL injection vulnerability
function getUser(id) {
  return db.query(`SELECT * FROM users WHERE id = ${id}`);
}

// XSS vulnerability
function displayMessage(message) {
  document.innerHTML = message;
}
```

### Test Performance Issues

```javascript
// Inefficient array operations
function processLargeArray(arr) {
  let result = [];
  for (let i = 0; i < arr.length; i++) {
    if (result.indexOf(arr[i]) === -1) {  // O(n²) complexity
      result.push(arr[i]);
    }
  }
  return result;
}
```

### Test TypeScript Issues

```typescript
// Type safety issues
function processData(data: any) {  // Avoid 'any' type
  return data.value * 2;  // No null check
}

// Missing return type
function calculate(a: number, b: number) {  // Should specify return type
  return a + b;
}
```

## Configuration

### Adjust Review Sensitivity

Create or update repository config:
```bash
curl -X PUT https://argusai-dev.meise.workers.dev/config/your-username/your-repo \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "model": "gpt-4o-mini",
    "reviewLevel": "detailed",
    "includeSuggestions": true
  }'
```

### Disable for Specific Repository

```bash
curl -X PUT https://argusai-dev.meise.workers.dev/config/your-username/your-repo \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

## Next Steps

After successful testing:

1. **Deploy to Production**:
```bash
wrangler deploy --env production
```

2. **Update GitHub App**:
   - Change webhook URL to production
   - Install on additional repositories

3. **Monitor Performance**:
   - Set up alerts for errors
   - Track review quality
   - Gather user feedback