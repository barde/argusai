# OAuth Authentication Setup Guide

This guide walks you through setting up GitHub OAuth authentication for the ArgusAI dashboard.

## Overview

The OAuth authentication system allows users to:
- Log in with their GitHub account
- View all their repositories in a dashboard
- Enable/disable ArgusAI on specific repositories
- Manage repository-specific configurations

## Prerequisites

- Cloudflare Workers account with wrangler CLI configured
- ArgusAI deployed to production
- Admin access to create GitHub OAuth Apps

## Setup Steps

### 1. Create KV Namespaces

Run the setup script to create the required KV namespaces:

```bash
./scripts/setup-oauth.sh
```

This will:
- Create `OAUTH_SESSIONS` namespace for session management
- Create `OAUTH_TOKENS` namespace for storing access tokens
- Update `wrangler.toml` with the namespace IDs

### 2. Create GitHub OAuth App

1. Go to [GitHub OAuth Apps](https://github.com/settings/applications/new)
2. Fill in the application details:
   - **Application name**: ArgusAI Dashboard
   - **Homepage URL**: `https://argus.vogel.yoga` (or your domain)
   - **Authorization callback URL**: `https://argus.vogel.yoga/auth/callback`
   - **Application description**: Optional description
3. Click "Register application"
4. Save the **Client ID** and generate a **Client Secret**

### 3. Set Environment Secrets

Set the required secrets for production:

```bash
# Set OAuth client credentials
wrangler secret put GITHUB_OAUTH_CLIENT_ID --env production
# Enter your Client ID when prompted

wrangler secret put GITHUB_OAUTH_CLIENT_SECRET --env production
# Enter your Client Secret when prompted

# Generate and set JWT secret
openssl rand -hex 32 | wrangler secret put JWT_SECRET --env production
```

### 4. Deploy the Updated Application

Deploy ArgusAI with OAuth support:

```bash
wrangler deploy --env production
```

### 5. Test the Integration

1. Visit your ArgusAI dashboard: `https://argus.vogel.yoga`
2. Click "Login with GitHub"
3. Authorize the application
4. You should see your repositories listed

## Configuration Options

### JWT Token Settings

The JWT tokens are configured with:
- **Expiration**: 7 days (configurable in `src/utils/jwt.ts`)
- **Algorithm**: HS256
- **Cookie settings**: HttpOnly, Secure, SameSite=Lax

### OAuth Scopes

The application requests the following GitHub scopes:
- `repo` - Access to public and private repositories
- `user` - Access to user profile information

## Security Considerations

1. **CSRF Protection**: State parameter validation on OAuth callback
2. **Token Storage**: Access tokens are stored in KV (consider encryption for production)
3. **JWT Security**: Tokens are signed with a secret and validated on each request
4. **Cookie Security**: HttpOnly cookies prevent XSS attacks

## Troubleshooting

### Common Issues

**OAuth callback fails with "Invalid state"**
- The state parameter has expired (10-minute TTL)
- Try logging in again

**"Repository not found" when enabling ArgusAI**
- Ensure the OAuth token has `repo` scope
- Check if the repository still exists

**JWT validation fails**
- The JWT secret might have changed
- Clear cookies and log in again

### Debug Mode

To enable debug logging:

1. Set `LOG_LEVEL=debug` in wrangler.toml
2. Use `wrangler tail` to view logs in real-time

## API Endpoints

### Public Endpoints
- `GET /` - Dashboard (shows login or repositories)
- `GET /auth/login` - Initiate OAuth flow
- `GET /auth/callback` - OAuth callback handler
- `GET /auth/user` - Get current user info

### Protected Endpoints (require authentication)
- `GET /api/user/repos` - List user's repositories
- `POST /api/user/repos/:owner/:repo/enable` - Enable ArgusAI
- `DELETE /api/user/repos/:owner/:repo/enable` - Disable ArgusAI
- `POST /auth/logout` - Logout and clear session

## Data Storage

### OAUTH_SESSIONS Namespace
- `state:{state}` - CSRF state validation (10-minute TTL)

### OAUTH_TOKENS Namespace
- `token:{user_id}` - GitHub access token

### CONFIG Namespace (existing)
- `user:{user_id}:repos` - User's repository configurations
- `allowed:{owner}/{repo}` - Allowed repositories list

## Next Steps

After setting up OAuth:

1. **Customize the UI**: Modify `src/handlers/dashboard.ts` for custom branding
2. **Add features**: Implement bulk operations, search, filters
3. **Monitor usage**: Track login metrics and repository enablement
4. **Security audit**: Review token storage and consider encryption