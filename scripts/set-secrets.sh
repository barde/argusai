#!/bin/bash

# Script to set required secrets for ArgusAI production deployment

echo "🔐 ArgusAI Secret Configuration"
echo "================================"
echo ""
echo "This script will help you set the required secrets for ArgusAI."
echo "You'll need the following information ready:"
echo ""
echo "1. GitHub App Private Key (from https://github.com/settings/apps/argusai-code-review)"
echo "2. GitHub Webhook Secret (from the same GitHub App settings)"
echo "3. GitHub Personal Access Token with Models API access"
echo ""
echo "Press Enter to continue..."
read

# Function to set a secret
set_secret() {
    local secret_name=$1
    local description=$2
    
    echo ""
    echo "📝 Setting $secret_name"
    echo "   $description"
    echo ""
    
    wrangler secret put $secret_name --env production
    
    if [ $? -eq 0 ]; then
        echo "✅ $secret_name set successfully!"
    else
        echo "❌ Failed to set $secret_name"
        exit 1
    fi
}

# Set each secret
set_secret "GITHUB_APP_PRIVATE_KEY" "Paste your GitHub App private key (including BEGIN/END lines)"
set_secret "GITHUB_WEBHOOK_SECRET" "Enter the webhook secret from your GitHub App settings"
set_secret "GITHUB_TOKEN" "Paste your GitHub Personal Access Token with Models API access"

echo ""
echo "🎉 All secrets have been set!"
echo ""
echo "You can verify the deployment status at: https://argus.vogel.yoga/status"
echo ""

# Optional: Set additional secrets
echo "Would you like to set optional secrets? (y/n)"
read -n 1 optional
echo ""

if [ "$optional" = "y" ]; then
    echo "Optional: Sentry DSN for error tracking (press Enter to skip):"
    read sentry_dsn
    if [ ! -z "$sentry_dsn" ]; then
        echo "$sentry_dsn" | wrangler secret put SENTRY_DSN --env production
    fi
    
    echo "Optional: Slack Webhook URL for notifications (press Enter to skip):"
    read slack_url
    if [ ! -z "$slack_url" ]; then
        echo "$slack_url" | wrangler secret put SLACK_WEBHOOK_URL --env production
    fi
fi

echo ""
echo "✨ Configuration complete!"
echo "Check your deployment status: https://argus.vogel.yoga/status"