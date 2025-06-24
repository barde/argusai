# ArgusAI Terraform Infrastructure

This directory contains Terraform configuration for deploying ArgusAI to Cloudflare Workers.

## Prerequisites

1. **Terraform** installed (v1.0+)
2. **Cloudflare API Token** with the following permissions:
   - Account: Workers KV Storage:Edit
   - Account: Workers Scripts:Edit
   - Account: Workers Routes:Edit
   - Account: Queues:Edit
   - Zone: Workers Routes:Edit (if using custom domain)

3. **Workers Paid Plan** for Queue functionality

## Setup

1. **Initialize Terraform:**
   ```bash
   terraform init
   ```

2. **Create a `terraform.tfvars` file:**
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   ```

3. **Edit `terraform.tfvars`** with your values:
   - `github_app_id`: Your GitHub App ID
   - `environment`: Either "development" or "production"
   - `zone_id`: (Optional) Your Cloudflare zone ID if using custom domain

4. **Set sensitive variables via environment:**
   ```bash
   export TF_VAR_github_app_private_key="$(cat path/to/private-key.pem)"
   export TF_VAR_github_webhook_secret="your-webhook-secret"
   export TF_VAR_github_token="ghp_your_token_with_models_read"
   export CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"
   ```

## Deployment

1. **Plan the deployment:**
   ```bash
   terraform plan
   ```

2. **Apply the configuration:**
   ```bash
   terraform apply
   ```

3. **Note the outputs:**
   - `worker_url`: Your Worker's URL
   - `kv_namespace_ids`: Created KV namespace IDs
   - `queue_names`: Created queue names

## Managing Multiple Environments

### Development
```bash
terraform workspace new development
terraform workspace select development
terraform apply -var="environment=development"
```

### Production
```bash
terraform workspace new production
terraform workspace select production
terraform apply -var="environment=production"
```

## Resources Created

- **KV Namespaces:**
  - CACHE: For caching PR reviews
  - RATE_LIMITS: For rate limiting
  - CONFIG: For per-repository configuration

- **Queues:** (Requires paid plan)
  - argusai-reviews: Main review queue
  - argusai-reviews-dlq: Dead letter queue (production only)

- **Worker Script:** The main ArgusAI worker

- **Worker Route:** Custom domain routing (production only)

## Updating the Worker

After building the TypeScript project:
```bash
npm run build
terraform apply
```

## Destroying Resources

To remove all created resources:
```bash
terraform destroy
```

## State Management

For production use, consider using remote state storage:
```hcl
terraform {
  backend "s3" {
    bucket = "your-terraform-state-bucket"
    key    = "argusai/terraform.tfstate"
    region = "us-east-1"
  }
}
```

## Troubleshooting

1. **Queue creation fails:** Ensure you have a Workers Paid plan
2. **Authentication errors:** Verify your Cloudflare API token permissions
3. **Worker deployment fails:** Check that `dist/index.js` exists (run `npm run build` first)