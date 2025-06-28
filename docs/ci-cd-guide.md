# CI/CD Guide for ArgusAI

This document explains the continuous integration and deployment setup for ArgusAI.

## Overview

ArgusAI uses GitHub Actions for automated testing, security scanning, and deployment. The CI/CD pipeline ensures code quality, security, and reliable deployments.

## GitHub Actions Workflows

### 1. CI Workflow (`ci.yml`)
Runs on every push and pull request to main/master branches.

**Jobs:**
- **Code Quality**: TypeScript type checking, ESLint, and Prettier formatting
- **Tests**: Unit tests with coverage reporting to Codecov
- **Build Validation**: Ensures the Worker builds successfully and checks bundle size
- **Security**: npm audit and secret scanning with TruffleHog
- **API Validation**: Validates OpenAPI specification

### 2. CodeQL Analysis (`codeql.yml`)
Runs security analysis on code to find vulnerabilities.

- Runs on push, PR, and weekly schedule
- Analyzes JavaScript/TypeScript code
- Reports findings to GitHub Security tab

### 3. Release Workflow (`release.yml`)
Triggered when pushing version tags (e.g., `v1.0.0`).

**Steps:**
1. Runs all tests
2. Builds the project
3. Deploys to Cloudflare Workers production
4. Creates GitHub release with artifacts

**Required Secret:**
- `CLOUDFLARE_API_TOKEN`: For deploying to Workers

### 4. PR Checks (`pr-checks.yml`)
Automated checks for pull requests.

**Features:**
- Size labeling (XS, S, M, L, XL)
- Conventional commits validation
- Auto-labeling based on changed files

### 5. Stale Issues/PRs (`stale.yml`)
Manages inactive issues and pull requests.

- Issues: Marked stale after 30 days, closed after 37 days
- PRs: Marked stale after 14 days, closed after 21 days
- Exempt labels: pinned, security, bug, enhancement

## Dependabot Configuration

Located at `.github/dependabot.yml`

**Updates:**
- npm dependencies: Weekly on Mondays
- GitHub Actions: Weekly on Mondays
- Groups non-major updates together
- Auto-assigns reviewers and labels

## Pre-commit Hooks

Using Husky for Git hooks (`.husky/pre-commit`).

**Runs before each commit:**
1. TypeScript type checking
2. ESLint
3. Prettier format check

**Setup:**
```bash
npm install
# Husky will be automatically set up via prepare script
```

## Branch Protection Rules

Recommended settings for main/master branch:

1. **Require status checks**:
   - Code Quality
   - Tests
   - Build Validation
   - Security Checks

2. **Require branches to be up to date**

3. **Require code reviews**:
   - At least 1 approval
   - Dismiss stale reviews on new commits

4. **Enforce admins**: Apply rules to administrators too

## Setting Up CI/CD

### 1. GitHub Repository Settings

1. Go to Settings → Secrets and variables → Actions
2. Add required secrets:
   - `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token with Workers permissions

### 2. Cloudflare API Token

Create a token with these permissions:
- Account: Cloudflare Workers Scripts:Edit
- Zone: Zone:Read (if using custom domains)

```bash
# Test your token
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
     -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Enable GitHub Actions

1. Go to Actions tab in your repository
2. Enable workflows if prompted

### 4. Configure Codecov (Optional)

1. Sign up at [codecov.io](https://codecov.io)
2. Add repository
3. Token is optional for public repos

## Monitoring CI/CD

### Workflow Status
- Check Actions tab for workflow runs
- Monitor badges in README.md
- Set up notifications in GitHub settings

### Failed Workflows
Common issues and solutions:

1. **TypeScript errors**: Fix type issues locally with `npm run typecheck`
2. **Lint errors**: Run `npm run lint:fix` to auto-fix
3. **Format errors**: Run `npm run format` to fix formatting
4. **Test failures**: Run `npm test` locally to debug
5. **Security vulnerabilities**: Run `npm audit fix`

### Performance Metrics
Monitor in Actions tab:
- Workflow run duration
- Test execution time
- Bundle size trends

## Local Development

Replicate CI checks locally:

```bash
# Run all checks
npm run typecheck && npm run lint && npm run format:check && npm test

# Fix issues
npm run lint:fix
npm run format

# Check bundle size
npx wrangler deploy --dry-run --outdir dist
ls -lh dist/
```

## Deployment Process

### Manual Deployment
```bash
# Deploy to production
npm run deploy:production

# Or with wrangler directly
wrangler deploy --env production
```

### Automated Deployment
Create and push a version tag:

```bash
# Update version in package.json
npm version patch  # or minor, major

# Push with tags
git push --follow-tags

# This triggers the release workflow
```

## Best Practices

1. **Never commit directly to main**: Always use pull requests
2. **Keep PRs small**: Easier to review and less likely to break
3. **Write meaningful commit messages**: Follow conventional commits
4. **Run checks locally**: Before pushing, run `npm run typecheck && npm run lint`
5. **Keep dependencies updated**: Review and merge Dependabot PRs promptly
6. **Monitor security alerts**: Address CodeQL and npm audit findings quickly

## Troubleshooting

### CI Failing but Works Locally
- Check Node.js version (CI uses v20)
- Ensure all dependencies are in package.json
- Check for environment-specific issues

### Deployment Failures
- Verify `CLOUDFLARE_API_TOKEN` is set correctly
- Check Cloudflare dashboard for errors
- Ensure KV namespaces exist
- Verify wrangler.toml configuration

### Large Bundle Size
- Check for accidentally included dev dependencies
- Review imports for tree-shaking opportunities
- Consider lazy loading large modules

## Future Enhancements

1. **Performance Testing**: Add lighthouse CI for Worker performance
2. **E2E Tests**: Test actual webhook processing
3. **Deployment Previews**: Deploy PRs to preview environments
4. **Monitoring**: Integrate with error tracking (Sentry)
5. **Security Scanning**: Add more security tools (Snyk, etc.)