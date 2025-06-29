# ArgusAI API Documentation

## Interactive API Documentation

View the interactive API documentation using one of these methods:

### Option 1: Swagger Editor (Recommended)
[**View API Documentation →**](https://editor.swagger.io/?url=https://raw.githubusercontent.com/barde/argusai/master/argusai-openapi.yaml)

### Option 2: ReDoc Viewer
[**View in ReDoc →**](https://redocly.github.io/redoc/?url=https://raw.githubusercontent.com/barde/argusai/master/argusai-openapi.yaml)

### Option 3: Local Preview
```bash
# Using Swagger UI Docker
docker run -p 8080:8080 -e SWAGGER_JSON_URL=https://raw.githubusercontent.com/barde/argusai/master/argusai-openapi.yaml swaggerapi/swagger-ui

# Using ReDoc CLI
npx @redocly/cli preview-docs argusai-openapi.yaml
```

## API Overview

The ArgusAI API provides endpoints for:
- **Webhook Processing**: GitHub webhook events for pull request analysis
- **Health Monitoring**: Service health and dependency status
- **Configuration Management**: Repository-specific review settings
- **Allowed Repository Management**: Control which repositories can use ArgusAI

For the complete API specification, see [argusai-openapi.yaml](./argusai-openapi.yaml).

## Quick Reference

### Public Endpoints
- `GET /` - Status page (HTML)
- `GET /health` - Health check
- `GET /status` - Detailed status (JSON)
- `GET /allowed-repos/:owner/:repo` - Check if repository is allowed

### Admin Endpoints (Requires Bearer Token)
- `GET /admin/allowed-repos` - List all allowed repositories
- `POST /admin/allowed-repos` - Add repository to allowed list
- `DELETE /admin/allowed-repos/:owner/:repo` - Remove repository from allowed list

### Configuration Endpoints (Requires Bearer Token)
- `GET /config/:owner/:repo` - Get repository configuration
- `PUT /config/:owner/:repo` - Update repository configuration

### Webhook Endpoint
- `POST /webhooks/github` - GitHub webhook receiver (signature validated)