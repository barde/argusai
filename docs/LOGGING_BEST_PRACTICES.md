# Cloudflare Workers Logging Best Practices (Free Tier)

## Key Issues and Solutions

### 1. **Enable Observability in wrangler.toml**
```toml
[env.development.observability]
enabled = true
```

### 2. **Use `wrangler tail` for Real-Time Logs**
```bash
# Basic usage
wrangler tail --env development

# With pretty formatting
wrangler tail --env development --format pretty

# Filter by error status
wrangler tail --env development --status error

# Search for specific text
wrangler tail --env development --search "ERROR"
```

### 3. **Known Limitations**

- **Object Logging**: `console.log` with objects may not display properly. Always stringify objects:
  ```javascript
  console.log('Data:', JSON.stringify(data));
  ```

- **High Traffic**: Logs may enter sampling mode and drop messages
- **Max 10 Clients**: Only 10 concurrent log viewers allowed
- **No Storage**: Real-time logs don't persist (use Workers Logs for storage - paid feature)

### 4. **Alternative Approaches for Free Tier**

1. **Use Response Headers for Debugging**:
   ```javascript
   c.header('X-Debug-Info', JSON.stringify(debugData));
   ```

2. **Create Debug Endpoint**:
   ```javascript
   app.get('/debug/last-error', (c) => {
     return c.json({ lastError: getLastError() });
   });
   ```

3. **Use KV for Error Logging**:
   ```javascript
   await env.CACHE.put(`error:${Date.now()}`, JSON.stringify(error), {
     expirationTtl: 3600 // 1 hour
   });
   ```

### 5. **Dashboard Logs**
- Go to Cloudflare Dashboard → Workers & Pages → Your Worker → Logs tab
- Enable "Stream logs" for real-time viewing
- Note: Requires paid plan for log persistence

### 6. **Common Issues**
- Logs not appearing after `wrangler dev` → `wrangler publish`
- Empty log messages when passing Maps or complex objects
- Logs work in `wrangler dev` but not in production

### 7. **Debug Environment Variables**
```bash
# View more detailed Wrangler logs
WRANGLER_LOG=debug wrangler tail --env development
```

## For ArgusAI Specifically

The bot is receiving webhooks ("Review processing started") but failing during async processing. Since logs aren't appearing, consider:

1. Adding a debug endpoint to check internal state
2. Using KV to store processing errors
3. Adding response headers with debug info
4. Creating a `/debug/last-webhook` endpoint to see what happened