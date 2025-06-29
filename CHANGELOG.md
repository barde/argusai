# Changelog

All notable changes to ArgusAI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Reviewer Assignment Mode**: ArgusAI now only reviews PRs when explicitly assigned as a reviewer on GitHub
- **Repository Allowlist**: Added admin-controlled allowlist to restrict which repositories can use ArgusAI
- **Admin API Endpoints**: New endpoints for managing allowed repositories
  - `GET /admin/allowed-repos` - List all allowed repositories
  - `POST /admin/allowed-repos` - Add repository to allowed list
  - `DELETE /admin/allowed-repos/:owner/:repo` - Remove repository from allowed list
- **Public API Endpoint**: `GET /allowed-repos/:owner/:repo` - Check if a repository is allowed
- **Enhanced Security**: Two-factor requirement (reviewer assignment + allowlist) prevents unauthorized usage
- **Comprehensive Documentation**: Added reviewer assignment mode guide

### Changed
- Webhook handler now checks for `review_requested` action instead of processing all PR events
- Webhook handler validates that ArgusAI is the requested reviewer
- Webhook handler checks repository allowlist before processing
- Updated OpenAPI specification with new endpoints

### Security
- Added bearer token authentication for admin endpoints
- Repository allowlist prevents unauthorized access to ArgusAI services
- Case-insensitive repository matching for consistent security

## [0.1.0] - 2025-01-01

### Added
- Initial release of ArgusAI
- GitHub webhook processing for pull request reviews
- GitHub Models API integration (free tier)
- Cloudflare Workers deployment
- KV storage for caching and rate limiting
- Configurable review settings per repository
- Status page and health monitoring
- OpenAPI documentation