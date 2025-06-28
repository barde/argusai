terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
  required_version = ">= 1.0"
}

# Configure the Cloudflare Provider
provider "cloudflare" {
  # api_token = var.cloudflare_api_token
  # Or use environment variable CLOUDFLARE_API_TOKEN
}

# Variables
variable "account_id" {
  description = "Cloudflare Account ID"
  type        = string
  default     = "1fe86871c437398bd78c9f5b73c6ecdb"
}

variable "zone_id" {
  description = "Cloudflare Zone ID for argus.vogel.yoga (if applicable)"
  type        = string
  default     = ""
}

variable "environment" {
  description = "Environment name (development or production)"
  type        = string
  default     = "production"
}

# KV Namespaces for Development
resource "cloudflare_workers_kv_namespace" "cache_dev" {
  account_id = var.account_id
  title      = "CACHE"
}

resource "cloudflare_workers_kv_namespace" "rate_limits_dev" {
  account_id = var.account_id
  title      = "RATE_LIMITS"
}

resource "cloudflare_workers_kv_namespace" "config_dev" {
  account_id = var.account_id
  title      = "CONFIG"
}

# KV Namespaces for Production
resource "cloudflare_workers_kv_namespace" "cache_prod" {
  account_id = var.account_id
  title      = "production-CACHE"
}

resource "cloudflare_workers_kv_namespace" "rate_limits_prod" {
  account_id = var.account_id
  title      = "production-RATE_LIMITS"
}

resource "cloudflare_workers_kv_namespace" "config_prod" {
  account_id = var.account_id
  title      = "production-CONFIG"
}

# Queues (requires Workers Paid plan)
resource "cloudflare_queue" "reviews_dev" {
  account_id = var.account_id
  name       = "argusai-reviews-dev"
}

resource "cloudflare_queue" "reviews_prod" {
  account_id = var.account_id
  name       = "argusai-reviews"
}

resource "cloudflare_queue" "reviews_dlq" {
  account_id = var.account_id
  name       = "argusai-reviews-dlq"
}

# R2 Bucket (optional, for large diffs)
# resource "cloudflare_r2_bucket" "diff_storage" {
#   account_id = var.account_id
#   name       = "argusai-diffs"
#   location   = "ENAM"
# }

# Worker Script
resource "cloudflare_worker_script" "argusai" {
  account_id = var.account_id
  name       = var.environment == "production" ? "argusai" : "argusai-dev"
  content    = file("${path.module}/../../dist/index.js")
  
  # KV Namespace bindings
  kv_namespace_binding {
    name         = "CACHE"
    namespace_id = var.environment == "production" ? cloudflare_workers_kv_namespace.cache_prod.id : cloudflare_workers_kv_namespace.cache_dev.id
  }
  
  kv_namespace_binding {
    name         = "RATE_LIMITS"
    namespace_id = var.environment == "production" ? cloudflare_workers_kv_namespace.rate_limits_prod.id : cloudflare_workers_kv_namespace.rate_limits_dev.id
  }
  
  kv_namespace_binding {
    name         = "CONFIG"
    namespace_id = var.environment == "production" ? cloudflare_workers_kv_namespace.config_prod.id : cloudflare_workers_kv_namespace.config_dev.id
  }
  
  # Queue bindings
  queue_binding {
    binding = "REVIEW_QUEUE"
    queue   = var.environment == "production" ? cloudflare_queue.reviews_prod.name : cloudflare_queue.reviews_dev.name
  }
  
  # Environment variables
  plain_text_binding {
    name = "ENVIRONMENT"
    text = var.environment
  }
  
  plain_text_binding {
    name = "GITHUB_APP_ID"
    text = var.github_app_id
  }
  
  plain_text_binding {
    name = "GITHUB_MODEL"
    text = var.environment == "production" ? "gpt-4o" : "gpt-4o-mini"
  }
  
  plain_text_binding {
    name = "LOG_LEVEL"
    text = var.environment == "production" ? "info" : "debug"
  }
  
  # Secrets (must be added manually or via environment variables)
  # secret_text_binding {
  #   name = "GITHUB_APP_PRIVATE_KEY"
  #   text = var.github_app_private_key
  # }
  
  # secret_text_binding {
  #   name = "GITHUB_WEBHOOK_SECRET"
  #   text = var.github_webhook_secret
  # }
  
  # secret_text_binding {
  #   name = "GITHUB_TOKEN"
  #   text = var.github_token
  # }
}

# Worker Route (for production with custom domain)
resource "cloudflare_worker_route" "argusai" {
  count       = var.environment == "production" && var.zone_id != "" ? 1 : 0
  zone_id     = var.zone_id
  pattern     = "argus.vogel.yoga/*"
  script_name = cloudflare_worker_script.argusai.name
}

# Queue Consumer Configuration
resource "cloudflare_worker_cron_trigger" "queue_consumer" {
  account_id  = var.account_id
  script_name = cloudflare_worker_script.argusai.name
  schedules   = ["*/1 * * * *"] # Every minute for queue processing
}

# Variables for secrets and configuration
variable "github_app_id" {
  description = "GitHub App ID"
  type        = string
  sensitive   = false
}

variable "github_app_private_key" {
  description = "GitHub App Private Key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_webhook_secret" {
  description = "GitHub Webhook Secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_token" {
  description = "GitHub Personal Access Token with models:read permission"
  type        = string
  sensitive   = true
  default     = ""
}

# Outputs
output "worker_url" {
  description = "Worker URL"
  value       = var.environment == "production" && var.zone_id != "" ? "https://argus.vogel.yoga" : "https://${cloudflare_worker_script.argusai.name}.${var.account_id}.workers.dev"
}

output "kv_namespace_ids" {
  description = "KV Namespace IDs"
  value = {
    cache       = var.environment == "production" ? cloudflare_workers_kv_namespace.cache_prod.id : cloudflare_workers_kv_namespace.cache_dev.id
    rate_limits = var.environment == "production" ? cloudflare_workers_kv_namespace.rate_limits_prod.id : cloudflare_workers_kv_namespace.rate_limits_dev.id
    config      = var.environment == "production" ? cloudflare_workers_kv_namespace.config_prod.id : cloudflare_workers_kv_namespace.config_dev.id
  }
}

output "queue_names" {
  description = "Queue Names"
  value = {
    reviews = var.environment == "production" ? cloudflare_queue.reviews_prod.name : cloudflare_queue.reviews_dev.name
    dlq     = var.environment == "production" ? cloudflare_queue.reviews_dlq.name : "N/A"
  }
}