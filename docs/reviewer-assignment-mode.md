# ArgusAI Reviewer Assignment Mode

ArgusAI now operates in a more controlled manner, only reviewing PRs when explicitly requested.

## How It Works

ArgusAI will only review a PR when **both** of these conditions are met:

1. **ArgusAI is assigned as a reviewer** on the GitHub PR
2. **The repository is on the allowed list**

This ensures that:
- ArgusAI doesn't automatically comment on every PR
- Repository owners have full control over when reviews happen
- Only approved repositories can use ArgusAI

## Setting Up

### 1. Add Your Repository to the Allowed List

First, your repository must be added to ArgusAI's allowed list. Contact your ArgusAI administrator or use the admin API:

```bash
# Add a repository (requires admin token)
curl -X POST https://argus.vogel.yoga/admin/allowed-repos \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "your-org",
    "repo": "your-repo",
    "reason": "Approved for AI code reviews"
  }'
```

### 2. Assign ArgusAI as a Reviewer

When you want ArgusAI to review a PR:

1. Go to your Pull Request on GitHub
2. Click on "Reviewers" in the right sidebar
3. Search for and select the ArgusAI bot (usually `argusai[bot]`)
4. ArgusAI will automatically start reviewing within a few seconds

## Managing Allowed Repositories

### Admin Endpoints

All admin endpoints require authentication with the admin token.

#### List All Allowed Repositories
```bash
curl https://argus.vogel.yoga/admin/allowed-repos \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

#### Add a Repository
```bash
curl -X POST https://argus.vogel.yoga/admin/allowed-repos \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "octocat",
    "repo": "hello-world",
    "reason": "Testing ArgusAI"
  }'
```

#### Remove a Repository
```bash
curl -X DELETE https://argus.vogel.yoga/admin/allowed-repos/octocat/hello-world \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Public Endpoints

#### Check if a Repository is Allowed
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

## Workflow Example

1. **Repository Setup** (one time):
   - Admin adds `myorg/myrepo` to allowed list
   - Repository is now eligible for ArgusAI reviews

2. **For Each PR**:
   - Developer creates a pull request
   - When ready for review, assign ArgusAI as a reviewer
   - ArgusAI receives the `review_requested` webhook
   - ArgusAI checks if repository is allowed
   - If allowed, ArgusAI performs the review and posts comments

## Benefits

- **Control**: Only review when explicitly requested
- **Security**: Only allowed repositories can trigger reviews
- **Resource Management**: Reduces unnecessary API calls and processing
- **Flexibility**: Can be assigned/unassigned at any time during PR lifecycle

## Troubleshooting

### ArgusAI Not Responding to Review Request

1. **Check Repository is Allowed**:
   ```bash
   curl https://argus.vogel.yoga/allowed-repos/owner/repo
   ```

2. **Verify ArgusAI is Properly Assigned**:
   - Must be assigned through GitHub's reviewer interface
   - Check that the webhook was delivered in GitHub's webhook settings

3. **Check ArgusAI Status**:
   ```bash
   curl https://argus.vogel.yoga/health
   ```

### Common Issues

- **"Repository not on allowed list"**: Contact admin to add repository
- **No response after assignment**: Check webhook delivery in GitHub settings
- **Delayed response**: Check rate limits or system status

## Security Considerations

- Admin token should be kept secure and rotated regularly
- Allowed list is cached for 5 minutes for performance
- All admin actions are logged
- Repository names are case-insensitive for matching

## Future Enhancements

- Team-based permissions
- Per-repository configuration overrides
- Automatic removal of inactive repositories
- Webhook for allowed list changes