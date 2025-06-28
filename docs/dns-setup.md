# DNS Setup for argus.vogel.yoga

## Required DNS Configuration

To make ArgusAI available at `https://argus.vogel.yoga`, you need to configure the following DNS record:

### CNAME Record
```
Type: CNAME
Name: argus
Value: argusai.barde.workers.dev
TTL: Auto (or 300 seconds)
Proxy: Yes (Orange cloud ON in Cloudflare)
```

### Alternative: A Record (if using Cloudflare)
If you prefer using an A record with Cloudflare's proxy:
```
Type: A
Name: argus
Value: 192.0.2.1 (dummy IP, will be proxied)
TTL: Auto
Proxy: Yes (Orange cloud must be ON)
```

## Verification

After setting up the DNS record, you can verify the deployment:

1. **Check DNS propagation**: 
   ```bash
   dig argus.vogel.yoga
   ```

2. **Test the endpoints**:
   - Status Page: https://argus.vogel.yoga
   - Health Check: https://argus.vogel.yoga/health
   - API Status: https://argus.vogel.yoga/status

## Worker Information

- **Worker Name**: argusai
- **Worker URL**: https://argusai.barde.workers.dev
- **Custom Domain**: argus.vogel.yoga
- **Deployment ID**: 542997e2-4567-4c40-9550-0f197622e180

## Troubleshooting

If the domain doesn't work immediately:
1. DNS propagation can take up to 48 hours (usually much faster)
2. Ensure the Cloudflare proxy (orange cloud) is enabled
3. Check that the zone_name in wrangler.toml matches your Cloudflare zone
4. Verify the worker is deployed: `wrangler deployments list`