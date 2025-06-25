# GitHub Models API Token Setup (2025)

## Creating a Fine-Grained Personal Access Token

GitHub Models requires a **fine-grained personal access token** with the **Models** permission set to "Read-only".

### Steps:

1. **Go to GitHub Settings**
   - Click your profile photo → Settings
   - Navigate to Developer settings (bottom left)
   - Click "Personal access tokens" → "Fine-grained tokens"

2. **Create New Token**
   - Click "Generate new token"
   - Set token name: `ArgusAI Models API`
   - Set expiration: Choose your preference (can be "No expiration")
   - Repository access: Keep as "Public Repositories (read)"

3. **Set Permissions** ⚠️ CRITICAL
   - Scroll to "Account permissions" section
   - Find "Models" permission
   - Change it from "No access" to **"Read-only"**
   - This is the key permission needed for GitHub Models API

4. **Generate Token**
   - Click "Generate token"
   - Copy the token immediately (it won't be shown again)

### Update Cloudflare Secret

```bash
# Update the GITHUB_TOKEN secret with your new fine-grained token
wrangler secret put GITHUB_TOKEN --env development
# Paste your new token when prompted
```

### Test the Token

```bash
# Test GitHub Models API access
curl -X POST https://api.github.com/chat/completions \
  -H "Authorization: Bearer YOUR_NEW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Important Notes

- Classic personal access tokens with `models:read` scope do NOT work
- You must use fine-grained tokens with the "Models" permission
- The free tier includes rate limits suitable for development
- For production, transition to Azure with a paid account

## Alternative: GitHub Actions Token

As of April 2025, you can also use the built-in `GITHUB_TOKEN` from GitHub Actions to authenticate requests to GitHub Models, eliminating the need for personal access tokens in CI/CD workflows.