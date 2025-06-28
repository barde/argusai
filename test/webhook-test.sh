#!/bin/bash

# Test webhook endpoint directly
echo "Testing ArgusAI webhook endpoint..."

# Test payload (simplified)
PAYLOAD='{
  "action": "opened",
  "pull_request": {
    "number": 22,
    "title": "Test PR",
    "user": {
      "login": "test-user"
    }
  },
  "repository": {
    "name": "argusai",
    "full_name": "barde/argusai",
    "owner": {
      "login": "barde"
    }
  }
}'

# Make request
echo "Sending test webhook to: https://argus.vogel.yoga/webhooks/github"
curl -X POST https://argus.vogel.yoga/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: test-$(date +%s)" \
  -d "$PAYLOAD" \
  -v

echo -e "\n\nNote: This request will likely fail signature validation, but should show if the endpoint is reachable."