# Issue #9 Implementation Plan: Comment Formatting and Posting

## Overview
This document outlines the implementation plan for completing the comment formatting and posting system for ArgusAI.

## Current State Analysis

### ✅ Already Implemented
1. **Comment Template Structure** - Sophisticated formatting in `ReviewFormatter`
2. **Markdown Formatting** - Code suggestions, inline comments, summaries, severity indicators
3. **Comment Posting Logic** - Basic GitHub API integration
4. **Comment Batching** - File-by-file chunking for large PRs

### ❌ Missing Features
1. **Comment Size Limit Handling** - No validation for GitHub's 65,536 character limit
2. **Update Existing Comments** - No logic to update previous reviews
3. **Comment Threading** - No conversation tracking
4. **Enhanced Metadata** - Limited versioning and tracking

## Implementation Priority

### Phase 1: Critical Features (High Priority)
1. **Comment Size Limit Handling**
   - Implement validation for 65,536 character limit
   - Add truncation logic with continuation comments
   - Ensure critical information is preserved

### Phase 2: User Experience (Medium Priority)
2. **Update Existing Comments**
   - Find existing ArgusAI reviews
   - Implement update/replace logic
   - Maintain comment history

### Phase 3: Enhanced Features (Low Priority)
3. **Comment Threading**
   - Track conversation threads
   - Reply to specific comments
   - Resolve/unresolve threads

4. **Enhanced Metadata**
   - Version tracking
   - Edit history
   - Processing statistics

## Technical Implementation Details

### 1. Comment Size Limit Handling

```typescript
// src/services/review-formatter.ts
interface SplitReviewResult {
  mainReview: string;
  continuationComments: string[];
}

class ReviewFormatter {
  static readonly GITHUB_COMMENT_LIMIT = 65536;
  static readonly CONTINUATION_HEADER = '\n\n---\n\n📋 **Continuation of review (part {part}/{total})**\n\n';
  
  static validateAndSplitReview(reviewBody: string): SplitReviewResult {
    if (reviewBody.length <= this.GITHUB_COMMENT_LIMIT) {
      return { mainReview: reviewBody, continuationComments: [] };
    }
    
    // Split logic implementation
  }
}
```

### 2. Update Existing Comments

```typescript
// src/services/github-api.ts
interface ExistingReview {
  id: number;
  body: string;
  submitted_at: string;
}

class GitHubAPIService {
  async findExistingArgusReview(
    owner: string, 
    repo: string, 
    pullNumber: number
  ): Promise<ExistingReview | null> {
    // Implementation
  }
  
  async dismissAndRecreateReview(
    owner: string,
    repo: string,
    pullNumber: number,
    existingReviewId: number,
    newReview: Review
  ): Promise<void> {
    // Implementation
  }
}
```

### 3. Comment Threading (KV Storage)

```typescript
// src/storage/types.ts
interface CommentThread {
  id: string;
  prNumber: number;
  originalCommentId: number;
  replies: number[];
  resolved: boolean;
  lastActivity: number;
}

// src/storage/service.ts
class StorageService {
  async saveCommentThread(
    repository: string,
    thread: CommentThread
  ): Promise<void> {
    // Implementation
  }
}
```

### 4. Enhanced Metadata

```typescript
// src/types/review.ts
interface EnhancedReviewMetadata {
  version: string;
  model: string;
  tokensUsed: number;
  processingTimeMs: number;
  reviewIteration: number;
  previousReviewId?: number;
  editReason?: string;
  features: {
    chunked: boolean;
    filesAnalyzed: number;
    filesSkipped: number;
  };
}
```

## Testing Strategy

### Unit Tests
1. **Size Limit Tests**
   - Test comment splitting logic
   - Verify truncation preserves critical info
   - Test edge cases (exactly at limit, etc.)

2. **Update Logic Tests**
   - Mock finding existing reviews
   - Test update decision logic
   - Verify history preservation

### Integration Tests
1. **Full Review Flow**
   - Test with various PR sizes
   - Verify comment posting
   - Test update scenarios

## Rollout Plan

### Week 1: Comment Size Handling
- Implement size validation and splitting
- Add tests
- Deploy to development

### Week 2: Update Existing Comments
- Implement find and update logic
- Add storage for review history
- Test in staging

### Week 3: Enhanced Features
- Add comment threading
- Implement enhanced metadata
- Full testing and documentation

## Success Metrics
1. No failed reviews due to size limits
2. Reduced comment clutter (updates vs new)
3. Better conversation tracking
4. Improved debugging with metadata

## Risk Mitigation
1. **API Rate Limits** - Implement caching and batching
2. **Data Loss** - Maintain review history in KV
3. **Breaking Changes** - Feature flags for gradual rollout