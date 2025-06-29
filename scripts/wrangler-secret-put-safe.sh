#!/bin/bash
# Safe wrapper for wrangler secret put that validates GITHUB_APP_PRIVATE_KEY format
# Prevents uploading PKCS#1 keys which will cause authentication failures

set -e

# Check if this is for GITHUB_APP_PRIVATE_KEY
if [[ "$*" == *"GITHUB_APP_PRIVATE_KEY"* ]]; then
    echo "🔍 Detected GITHUB_APP_PRIVATE_KEY upload..."
    
    # Read from stdin
    KEY_CONTENT=$(cat)
    
    # Check key format
    if echo "$KEY_CONTENT" | grep -q "BEGIN RSA PRIVATE KEY"; then
        echo "❌ ERROR: Key is in PKCS#1 format!"
        echo ""
        echo "GitHub provides keys in PKCS#1 format, but ArgusAI requires PKCS#8."
        echo ""
        echo "To fix this:"
        echo "1. Use the conversion script:"
        echo "   ./scripts/convert-github-private-key.sh your-key.pem"
        echo ""
        echo "2. Or convert manually:"
        echo "   openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in key.pem -out key-pkcs8.pem"
        echo "   cat key-pkcs8.pem | wrangler secret put GITHUB_APP_PRIVATE_KEY --env production"
        echo ""
        echo "Upload cancelled to prevent authentication failures."
        exit 1
    elif echo "$KEY_CONTENT" | grep -q "BEGIN PRIVATE KEY"; then
        echo "✅ Key is in correct PKCS#8 format"
        # Pass through to wrangler
        echo "$KEY_CONTENT" | wrangler "$@"
    else
        echo "⚠️  WARNING: Key format could not be determined"
        echo "   Make sure this is a valid PKCS#8 private key"
        # Pass through to wrangler
        echo "$KEY_CONTENT" | wrangler "$@"
    fi
else
    # Not a GitHub App private key, pass through normally
    wrangler "$@"
fi