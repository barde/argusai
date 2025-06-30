# Debug Mode Documentation

## Overview

ArgusAI includes a debug mode that provides additional endpoints and detailed logging for troubleshooting OAuth authentication and other issues. Debug endpoints are protected by the `DEBUG_MODE` environment variable to prevent accidental exposure of sensitive information in production.

## Configuration

### Environment Variable

- **Variable**: `DEBUG_MODE`
- **Values**: `"true"` (enabled) or `"false"` (disabled)
- **Default**: `"false"` in production, `"true"` in development

### Setting Debug Mode

In `wrangler.toml`:

```toml
[env.production.vars]
DEBUG_MODE = "false"  # Disabled in production by default

[env.development.vars]
DEBUG_MODE = "true"   # Enabled in development
```

To temporarily enable debug mode in production:
1. Update `wrangler.toml` to set `DEBUG_MODE = "true"`
2. Deploy: `wrangler deploy --env production`
3. **Important**: Remember to disable it after debugging

## Debug Endpoints

All debug endpoints return `404 Not Found` when `DEBUG_MODE` is disabled.

### 1. OAuth Debug Callback
**Endpoint**: `GET /auth/callback-debug`

Returns detailed information about the OAuth callback process:
- State validation details
- Token exchange results
- Environment configuration
- Request headers and parameters

**Example Response**:
```json
{
  "debug": true,
  "environment": "production",
  "callback_url": "https://argus.vogel.yoga/auth/callback",
  "state_validation": {
    "provided": true,
    "stored": true,
    "valid": true
  },
  "token_exchange": {
    "status": 200,
    "ok": true,
    "data": {
      "access_token": "ghu_...",
      "token_type": "bearer"
    }
  }
}
```

### 2. Enhanced OAuth Debug Callback
**Endpoint**: `GET /auth/callback-debug-v2`

Provides even more detailed debugging information including:
- KV namespace operations
- OAuth session management
- Detailed error tracking
- State storage verification

### 3. KV Debug Endpoint
**Endpoint**: `GET /auth/debug-kv`

Tests KV namespace functionality:
- Write/read operations
- TTL verification
- Namespace availability
- Performance metrics

### 4. OAuth Test Endpoint
**Endpoint**: `GET /auth/oauth-test`

Comprehensive OAuth configuration test:
- Environment variable validation
- KV namespace connectivity
- GitHub API connectivity
- JWT generation test

### 5. General Debug Endpoint
**Endpoint**: `GET /debug`

Available when `ENVIRONMENT=development` OR `DEBUG_MODE=true`:
- Worker configuration
- Environment variables (redacted secrets)
- KV namespace status
- Request context information

## Usage Examples

### Testing OAuth Flow with Debug Mode

1. Enable debug mode (if in production):
   ```bash
   # Update wrangler.toml: DEBUG_MODE = "true"
   wrangler deploy --env production
   ```

2. Use the debug callback URL for testing:
   - Update GitHub App callback URL to: `https://argus.vogel.yoga/auth/callback-debug`
   - Or manually construct OAuth URL with debug callback

3. Monitor the flow:
   ```bash
   # View real-time logs
   wrangler tail --env production --format pretty
   ```

4. Check debug endpoint responses:
   ```bash
   curl https://argus.vogel.yoga/auth/oauth-test
   curl https://argus.vogel.yoga/auth/debug-kv
   ```

### Troubleshooting Common Issues

#### OAuth State Validation Failures
```bash
# Check if state is being stored properly
curl https://argus.vogel.yoga/auth/debug-kv

# View detailed callback info
# Navigate to: https://argus.vogel.yoga/auth/callback-debug?code=...&state=...
```

#### Token Exchange Errors
The debug callback will show:
- Exact error from GitHub
- Request parameters sent
- Response status and body

#### KV Storage Issues
```bash
# Test KV operations
curl https://argus.vogel.yoga/auth/debug-kv
```

## Security Considerations

1. **Never leave DEBUG_MODE enabled in production**
   - Debug endpoints expose sensitive information
   - Can reveal internal implementation details
   - May include partial tokens or user data

2. **Rotate secrets after debugging**
   - If sensitive data was exposed during debugging
   - Especially if logs were shared or stored

3. **Use short-lived debug sessions**
   - Enable debug mode only when actively troubleshooting
   - Disable immediately after resolving issues

4. **Monitor access to debug endpoints**
   - Check logs for unexpected debug endpoint access
   - Set up alerts for debug mode being enabled in production

## Best Practices

1. **Development Testing**
   - Always test OAuth flows in development first
   - Use debug endpoints to understand the flow
   - Verify state management and token exchange

2. **Production Debugging**
   - Enable debug mode only when necessary
   - Use specific debug endpoints rather than general ones
   - Document what was debugged and when

3. **Log Management**
   - Use `wrangler tail` for real-time monitoring
   - Filter logs by debug endpoints: `wrangler tail --search "debug"`
   - Save debug logs for analysis: `wrangler tail > debug.log`

## Implementation Details

### How Debug Mode Works

1. **Environment Check**:
   ```typescript
   if (c.env.DEBUG_MODE !== 'true') {
     return c.json({ error: 'Debug mode not enabled' }, 404);
   }
   ```

2. **Protected Endpoints**:
   - All `/auth/*-debug` endpoints
   - OAuth test endpoints
   - KV test endpoints

3. **Dynamic Redirect URI**:
   - Debug callbacks use modified redirect_uri
   - Allows testing without changing main flow

### Adding New Debug Endpoints

To add a new debug endpoint:

1. Create the handler:
   ```typescript
   export async function myDebugHandler(c: Context<{ Bindings: Env }>) {
     // Debug logic here
     return c.json({ debug: true, /* ... */ });
   }
   ```

2. Add route with debug check:
   ```typescript
   app.get('/debug/my-endpoint', (c) => {
     if (c.env.DEBUG_MODE !== 'true') {
       return c.json({ error: 'Debug mode not enabled' }, 404);
     }
     return myDebugHandler(c);
   });
   ```

## Related Documentation

- [OAuth Setup Guide](./oauth-setup.md)
- [GitHub App Setup](./github-app-setup.md)
- [Logging Best Practices](./LOGGING_BEST_PRACTICES.md)