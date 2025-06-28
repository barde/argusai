# Quick Test Guide for ArgusAI

## Production Deployment
- **URL**: https://argus.vogel.yoga
- **Health Check**: https://argus.vogel.yoga/health

## Option 1: Test with Real GitHub PR (Recommended)

1. **Install GitHub App on a Test Repository**
   - Go to your GitHub App settings
   - Install on a test repository
   - Set webhook URL to: `https://argus.vogel.yoga/webhooks/github`

2. **Create a Test PR**
   ```bash
   # In your test repository
   git checkout -b test/argusai
   
   # Create a file with intentional issues
   cat > test-code.js << 'EOF'
   // Security issue: SQL injection
   function getUser(id) {
     return db.query(`SELECT * FROM users WHERE id = ${id}`);
   }
   
   // Bug: off-by-one error
   function processItems(items) {
     for (let i = 0; i <= items.length; i++) {
       console.log(items[i].name); // Will crash on last iteration
     }
   }
   
   // Performance issue
   function findDuplicates(arr) {
     const duplicates = [];
     for (let i = 0; i < arr.length; i++) {
       for (let j = i + 1; j < arr.length; j++) {
         if (arr[i] === arr[j] && !duplicates.includes(arr[i])) {
           duplicates.push(arr[i]);
         }
       }
     }
     return duplicates;
   }
   EOF
   
   git add test-code.js
   git commit -m "Add code for ArgusAI to review"
   git push origin test/argusai
   ```

3. **Create PR via GitHub UI**
   - Go to your repository
   - Click "Compare & pull request"
   - Submit the PR

4. **Monitor the Review**
   ```bash
   # Watch logs in real-time
   wrangler tail
   
   # Or filter for your PR
   wrangler tail --search "test-code.js"
   ```

## Option 2: Manual Webhook Test

1. **Use the Test Script**
   ```bash
   # Set your actual webhook secret
   export GITHUB_WEBHOOK_SECRET="your-actual-secret"
   export REPO_NAME="your-username/your-repo"
   
   # Run test
   node scripts/test-webhook.mjs
   ```

2. **Check Processing**
   ```bash
   # View logs
   wrangler tail --format pretty
   ```

## What to Expect

Within 5-30 seconds, ArgusAI should post a review with:

```markdown
# 🤖 ArgusAI Code Review

## ✅/❌/💬 Review Summary

**Verdict**: APPROVE/REQUEST_CHANGES/COMMENT
**Confidence**: 85%

### ✨ What looks good:
- Clear function names
- Proper error handling in function X

### 🔍 Main concerns:
- SQL injection vulnerability in getUser()
- Array index out of bounds in processItems()
- O(n²) complexity in findDuplicates()

### 💭 Overall Feedback
The code has several critical issues that need to be addressed...

---
🤖 Reviewed by ArgusAI using gpt-4o-mini • ⚡ 1234ms • 🎯 500 tokens
```

## Troubleshooting

### No Review Posted?

1. **Check GitHub Webhook Delivery**
   - Repository Settings → Webhooks
   - Look for recent deliveries
   - Check response code (should be 200)

2. **Check Worker Logs**
   ```bash
   wrangler tail --search "ERROR"
   ```

3. **Verify Secrets**
   ```bash
   wrangler secret list
   ```

4. **Test Health Endpoint**
   ```bash
   curl https://argus.vogel.yoga/health
   ```

### Common Issues

- **401 Invalid signature**: Webhook secret mismatch
- **429 Rate limited**: Too many requests (10/minute limit)
- **500 Internal error**: Check logs for details

## Next Steps

Once working:
1. Test on different types of code (TypeScript, Python, etc.)
2. Adjust prompts in `src/prompts/code-review.ts`
3. Deploy to production when satisfied