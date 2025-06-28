# GitHub Token Setup for ArgusAI

The GitHub API authentication is failing because you need a valid GitHub Personal Access Token with the "Models" permission.

## Steps to Create a GitHub Token:

1. **Go to GitHub Settings**
   - Visit: https://github.com/settings/tokens?type=beta
   - Or navigate: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens

2. **Create New Token**
   - Click "Generate new token"
   - Give it a name: "ArgusAI Models API"
   - Set expiration (recommend 90 days)
   
3. **Configure Permissions**
   - Repository access: "Public Repositories (read)"
   - Under "Account permissions", find and enable:
     - **Models**: Read access ✅
   
4. **Generate Token**
   - Click "Generate token"
   - **IMPORTANT**: Copy the token immediately (it won't be shown again!)

5. **Add to .dev.vars**
   - Replace the placeholder in `.dev.vars`:
   ```
   GITHUB_TOKEN="github_pat_YOUR_TOKEN_HERE"
   ```

## Quick Test

After adding the token, restart wrangler and check the status page:
```bash
# Restart wrangler
pkill -f wrangler
wrangler dev --env development --port 8787

# Check status
curl http://localhost:8787/status
```

## Note on Token Types

- **Fine-grained tokens** (recommended): More secure, specific permissions
- **Classic tokens**: The old `models:read` scope does NOT work anymore (as of 2025)

The token is used for:
- Authenticating with GitHub Models API
- Checking model quotas
- Making AI-powered code reviews