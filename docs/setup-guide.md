# ArgusAI Setup Guide

This guide explains how to set up ArgusAI for your repository and trigger code reviews.

## Prerequisites

- ArgusAI must be installed on your GitHub repository
- Your repository must be added to ArgusAI's allowed list (contact your admin)

## Setup Methods

### Method 1: Reviewer Assignment (Recommended)

This method allows you to select ArgusAI from the GitHub reviewer dropdown.

#### Step 1: Add ArgusAI Bot as Collaborator

1. Go to your repository on GitHub
2. Click **Settings** → **Manage access**
3. Click **Add people**
4. Search for `argusai[bot]`
5. Select the bot and click **Add argusai[bot] to this repository**
6. Choose **Write** permission (required for posting reviews)

#### Step 2: Request Review from ArgusAI

1. Open any Pull Request
2. In the right sidebar, click **Reviewers**
3. Search for `argusai[bot]`
4. Select it to request a review

ArgusAI will automatically analyze your PR and post a review within seconds.

### Method 2: @Mention Trigger

If you prefer not to add ArgusAI as a collaborator, you can trigger reviews using comments.

#### How to Use

1. Open any Pull Request
2. Post a comment mentioning ArgusAI:
   ```
   @argusai review
   ```
3. ArgusAI will analyze the PR and post its review

#### Supported Commands

- `@argusai review` - Trigger a full code review
- `@argusai review security` - Focus on security issues
- `@argusai review performance` - Focus on performance issues
- `@argusai skip` - Exclude this PR from automatic reviews (if enabled)

## Repository Allowlist

Before ArgusAI can review your repository, it must be added to the allowed list.

### Check if Your Repository is Allowed

```bash
curl https://argus.vogel.yoga/allowed-repos/OWNER/REPO
```

Example:
```bash
curl https://argus.vogel.yoga/allowed-repos/octocat/hello-world
```

Response:
```json
{
  "repository": "octocat/hello-world",
  "allowed": true
}
```

### Request Repository Access

Contact your ArgusAI administrator to add your repository to the allowed list.

## Troubleshooting

### ArgusAI Not Appearing in Reviewers List

**Problem**: Can't find `argusai[bot]` in the reviewer dropdown

**Solution**: 
1. Ensure ArgusAI is added as a collaborator (see Method 1, Step 1)
2. Refresh the page after adding as collaborator
3. Try typing "argusai" in the search box

### ArgusAI Not Responding to Review Requests

**Problem**: Assigned ArgusAI but no review appears

**Possible Causes**:
1. **Repository not on allowed list** - Contact admin
2. **Webhook delivery failed** - Check Settings → Webhooks for delivery status
3. **ArgusAI is down** - Check https://argus.vogel.yoga/health

### ArgusAI Not Responding to @Mentions

**Problem**: @mention doesn't trigger a review

**Possible Causes**:
1. **Not using exact mention** - Must be `@argusai` (lowercase)
2. **Comment on closed PR** - Only works on open PRs
3. **Repository not allowed** - Check allowlist status

## Best Practices

### For Individual Contributors

1. **Use reviewer assignment** when you want a thorough review before merging
2. **Use @mentions** for quick checks or specific concerns
3. **Be specific** - Use focused commands like `@argusai review security` when appropriate

### For Repository Admins

1. **Add ArgusAI as collaborator** to enable reviewer assignment
2. **Document in README** - Let contributors know ArgusAI is available
3. **Set up branch protection** - Optionally require ArgusAI's review for merges

### Example Branch Protection Rule

1. Go to Settings → Branches
2. Add rule for your default branch
3. Enable "Require pull request reviews"
4. Optionally add `argusai[bot]` as a required reviewer

## Security Considerations

- ArgusAI only has **write** access to post comments and reviews
- It cannot modify code or merge PRs
- All actions are logged and auditable
- Review contents are cached for performance but never stored permanently

## API Integration

For automated workflows, you can trigger ArgusAI programmatically:

### Using GitHub CLI

```bash
# Request review via API
gh api -X POST repos/OWNER/REPO/pulls/PR_NUMBER/requested_reviewers \
  --field 'reviewers[]=argusai[bot]'
```

### Using GitHub Actions

```yaml
name: Request ArgusAI Review
on:
  pull_request:
    types: [opened, reopened]

jobs:
  request-review:
    runs-on: ubuntu-latest
    steps:
      - name: Request ArgusAI Review
        run: |
          gh api -X POST repos/${{ github.repository }}/pulls/${{ github.event.pull_request.number }}/requested_reviewers \
            --field 'reviewers[]=argusai[bot]'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Frequently Asked Questions

### Q: Is ArgusAI free to use?

A: ArgusAI runs on the free tier of GitHub Models API and Cloudflare Workers. Usage within reasonable limits is free.

### Q: What programming languages does ArgusAI support?

A: ArgusAI supports all major programming languages, with enhanced support for:
- TypeScript/JavaScript
- Python
- Java
- Go
- Rust
- C/C++

### Q: Can ArgusAI replace human code reviews?

A: No, ArgusAI is designed to augment human reviews by catching common issues early. Human review is still essential for context, business logic, and architectural decisions.

### Q: How quickly does ArgusAI respond?

A: Typically within 10-30 seconds of being triggered, depending on PR size.

### Q: Can I customize ArgusAI's review criteria?

A: Yes, through repository-specific configuration. Contact your admin for custom rules.

## Need Help?

- **Documentation**: https://github.com/barde/argusai
- **Issues**: https://github.com/barde/argusai/issues
- **Status**: https://argus.vogel.yoga/health