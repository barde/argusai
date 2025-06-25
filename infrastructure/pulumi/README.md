# ArgusAI Pulumi Infrastructure

This directory contains Pulumi configuration for deploying ArgusAI to Cloudflare Workers.

## Prerequisites

1. **Pulumi CLI** installed
2. **Node.js** 18+ and npm
3. **Cloudflare API Token** with appropriate permissions
4. **Workers Paid Plan** for Queue functionality

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Initialize Pulumi stack:**
   ```bash
   pulumi stack init dev
   ```

3. **Configure your stack:**
   ```bash
   # Basic configuration
   pulumi config set githubAppId your-github-app-id
   pulumi config set environment development
   
   # Optional: for custom domain
   pulumi config set zoneId your-zone-id
   
   # Secrets
   pulumi config set --secret githubAppPrivateKey "$(cat path/to/private-key.pem)"
   pulumi config set --secret githubWebhookSecret "your-webhook-secret"
   pulumi config set --secret githubToken "ghp_your_token_with_models_read"
   ```

4. **Set Cloudflare API token:**
   ```bash
   export CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"
   ```

## Deployment

1. **Preview changes:**
   ```bash
   pulumi preview
   ```

2. **Deploy:**
   ```bash
   pulumi up
   ```

3. **View outputs:**
   ```bash
   pulumi stack output
   ```

## Managing Multiple Environments

### Development
```bash
pulumi stack init dev
pulumi config set environment development
pulumi up
```

### Production
```bash
pulumi stack init prod
pulumi config set environment production
pulumi up
```

## Updating Configuration

```bash
# Update a configuration value
pulumi config set githubAppId new-app-id

# Update a secret
pulumi config set --secret githubToken new-token

# Apply changes
pulumi up
```

## Outputs

- `workerUrl`: The Worker's URL
- `kvNamespaceIds`: Created KV namespace IDs
- `queueNames`: Created queue names
- `webhookUrl`: GitHub webhook URL

## Destroying Resources

```bash
pulumi destroy
```

## Stack Management

```bash
# List stacks
pulumi stack ls

# Switch stacks
pulumi stack select dev

# Export stack configuration
pulumi stack export > stack-backup.json

# Import stack configuration
pulumi stack import < stack-backup.json
```

## Troubleshooting

1. **Build the worker first:**
   ```bash
   cd ../..
   npm run build
   ```

2. **Check Cloudflare API token permissions**

3. **Ensure Workers Paid plan for queues**