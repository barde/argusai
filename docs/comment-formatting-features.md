# Comment Formatting and Posting Features

This document describes the enhanced comment formatting and posting features implemented in ArgusAI.

## Overview

ArgusAI now includes advanced comment formatting and posting capabilities that handle:
- Large comment size limits
- Updating existing reviews
- Comment threading support
- Enhanced metadata tracking

## Features

### 1. Comment Size Limit Handling

GitHub has a maximum comment size limit of 65,536 characters. ArgusAI automatically handles this by:

- **Automatic Splitting**: Large reviews are split into a main review and continuation comments
- **Natural Boundaries**: Comments are split at paragraph boundaries for better readability
- **Continuation Headers**: Each continuation comment includes a clear header indicating it's part of a larger review
- **Truncation Fallback**: If splitting isn't possible, comments are truncated with important information preserved

#### Configuration
- Maximum comment size: 65,536 characters
- Maximum continuation comments: 5
- Continuation buffer: 200 characters

### 2. Update Existing Reviews

Instead of creating multiple reviews for the same PR, ArgusAI can update existing reviews:

- **Automatic Detection**: Finds existing ArgusAI reviews on the PR
- **Review Dismissal**: Dismisses the old review with a clear message
- **Update Notice**: New review includes a note that it's an update
- **Configurable**: Can be disabled via `UPDATE_EXISTING_REVIEWS=false`

#### How It Works
1. Searches for existing reviews containing "🤖 ArgusAI Code Review"
2. If found and updates are enabled, dismisses the old review
3. Creates a new review with updated content and metadata

### 3. Comment Threading Support

ArgusAI can track comment threads for better conversation management:

- **Thread Storage**: Stores thread information in KV storage
- **Reply Tracking**: Tracks replies to specific comments
- **Resolution Status**: Marks threads as resolved/unresolved
- **Metadata**: Includes file, line, and severity information

#### Thread Structure
```typescript
interface CommentThread {
  id: string;
  repository: string;
  prNumber: number;
  originalCommentId: number;
  originalCommentBody: string;
  replies: Array<{
    id: number;
    body: string;
    createdAt: string;
    isArgusAI: boolean;
  }>;
  resolved: boolean;
  lastActivity: number;
  metadata?: {
    file?: string;
    line?: number;
    severity?: string;
  };
}
```

### 4. Enhanced Metadata

Reviews now include comprehensive metadata for better tracking and debugging:

#### Metadata Fields
- **reviewIteration**: Number of times the PR has been reviewed
- **previousReviewId**: ID of the previous review (for updates)
- **editReason**: Reason for updating the review
- **features**: Information about review features used
  - `chunked`: Whether chunked review was used
  - `filesAnalyzed`: Number of files analyzed
  - `filesSkipped`: Number of files skipped
  - `continuationComments`: Number of continuation comments
- **timestamp**: When the review was created
- **diffSize**: Size of the diff analyzed

#### Metadata Display
The review footer includes relevant metadata:
- Model used (e.g., "gpt-4o-mini")
- Processing time
- Token usage
- Review iteration (if > 1)
- File statistics (for chunked reviews)

## Usage

### Environment Variables

```bash
# Enable/disable updating existing reviews (default: true)
UPDATE_EXISTING_REVIEWS=true

# Other related settings
MAX_DIFF_SIZE=500000         # Maximum diff size before chunking
CONCURRENT_FILE_REVIEWS=3    # Files to review in parallel
```

### Example Review Footer

```
---
🤖 Reviewed by ArgusAI using gpt-4o-mini • ⚡ 2341ms • 🎯 1523 tokens • 🔄 Review #2 • 📊 15 files analyzed, 3 skipped
```

## API Methods

### ReviewFormatter

```typescript
// Check if comment is too large
ReviewFormatter.isCommentTooLarge(body: string): boolean

// Split large review into parts
ReviewFormatter.splitLargeReview(reviewBody: string): SplitReviewResult

// Truncate comment to fit size limit
ReviewFormatter.truncateComment(body: string, preserveLines?: number): string

// Format review with enhanced metadata
ReviewFormatter.formatReview(aiResponse, metadata): Review
```

### GitHubAPIService

```typescript
// Find existing ArgusAI review
findExistingArgusReview(owner, repo, pullNumber): Promise<ExistingReview | null>

// Create review with continuation support
createReviewWithContinuation(owner, repo, pullNumber, review): Promise<Review>

// Update existing review
updateExistingReview(owner, repo, pullNumber, existingReviewId, newReview): Promise<Review>
```

## Testing

The implementation includes comprehensive tests covering:
- Comment size validation and splitting
- Continuation comment creation
- Existing review detection and updates
- Enhanced metadata handling
- Error cases and edge conditions

Run tests with:
```bash
npm test src/services/__tests__/review-formatter.test.ts
npm test src/services/__tests__/github-api.test.ts
```

## Future Enhancements

Potential improvements for future iterations:
1. **Smart Threading**: Automatically create threads for critical issues
2. **Review History**: Track all review iterations with diffs
3. **Inline Suggestions**: Enhanced code suggestion formatting
4. **Custom Templates**: Allow repository-specific comment templates
5. **Review Analytics**: Track review effectiveness metrics