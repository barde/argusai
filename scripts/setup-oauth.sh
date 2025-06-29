#!/bin/bash
# Set up OAuth KV namespaces and configuration for ArgusAI

set -e

echo "ArgusAI OAuth Setup"
echo "==================="
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "Error: wrangler CLI not found. Please install it first:"
    echo "  npm install -g wrangler"
    exit 1
fi

echo "Creating KV namespaces for OAuth..."
echo ""

# Create OAUTH_SESSIONS namespace
echo "Creating OAUTH_SESSIONS namespace..."
SESSIONS_OUTPUT=$(wrangler kv:namespace create "OAUTH_SESSIONS" 2>&1)
SESSIONS_ID=$(echo "$SESSIONS_OUTPUT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)

if [ -z "$SESSIONS_ID" ]; then
    echo "Error: Failed to create OAUTH_SESSIONS namespace"
    exit 1
fi

echo "✓ Created OAUTH_SESSIONS with ID: $SESSIONS_ID"

# Create OAUTH_TOKENS namespace
echo "Creating OAUTH_TOKENS namespace..."
TOKENS_OUTPUT=$(wrangler kv:namespace create "OAUTH_TOKENS" 2>&1)
TOKENS_ID=$(echo "$TOKENS_OUTPUT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)

if [ -z "$TOKENS_ID" ]; then
    echo "Error: Failed to create OAUTH_TOKENS namespace"
    exit 1
fi

echo "✓ Created OAUTH_TOKENS with ID: $TOKENS_ID"

# Update wrangler.toml with actual IDs
echo ""
echo "Updating wrangler.toml with namespace IDs..."

# Update main namespace IDs
sed -i.bak "s/placeholder-sessions-namespace-id/$SESSIONS_ID/g" wrangler.toml
sed -i.bak "s/placeholder-tokens-namespace-id/$TOKENS_ID/g" wrangler.toml

echo "✓ Updated wrangler.toml"

# Clean up backup files
rm -f wrangler.toml.bak

echo ""
echo "Next steps:"
echo "1. Create a GitHub OAuth App:"
echo "   - Go to https://github.com/settings/applications/new"
echo "   - Application name: ArgusAI Dashboard"
echo "   - Homepage URL: https://argus.vogel.yoga"
echo "   - Authorization callback URL: https://argus.vogel.yoga/auth/callback"
echo ""
echo "2. Set the OAuth secrets:"
echo "   wrangler secret put GITHUB_OAUTH_CLIENT_ID --env production"
echo "   wrangler secret put GITHUB_OAUTH_CLIENT_SECRET --env production"
echo "   wrangler secret put JWT_SECRET --env production"
echo ""
echo "3. Generate a JWT secret:"
echo "   openssl rand -hex 32"
echo ""
echo "4. Deploy the application:"
echo "   wrangler deploy --env production"