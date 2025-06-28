/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect } from 'vitest';
import { ReviewFormatter } from '../review-formatter';

describe('ReviewFormatter', () => {
  describe('Comment Size Limit Handling', () => {
    it('should not split comments under the size limit', () => {
      const smallComment = 'This is a small comment';
      const result = ReviewFormatter.splitLargeReview(smallComment);

      expect(result.mainReview).toBe(smallComment);
      expect(result.continuationComments).toHaveLength(0);
    });

    it('should split large comments into main and continuation', () => {
      // Create a large comment that exceeds 65KB
      const largeSection = 'x'.repeat(30000);
      const largeComment = `# Header\n\n${largeSection}\n\n## Section 2\n\n${largeSection}\n\n## Section 3\n\n${largeSection}`;

      const result = ReviewFormatter.splitLargeReview(largeComment);

      expect(result.mainReview).toContain('# Header');
      expect(result.mainReview).toContain("This review exceeds GitHub's comment size limit");
      expect(result.continuationComments.length).toBeGreaterThan(0);
      expect(result.continuationComments[0]).toContain('Review Continuation (Part');
    });

    it('should respect maximum continuation comments limit', () => {
      // Create an extremely large comment
      const hugeComment = 'x'.repeat(65536 * 7); // Would need 7 parts

      const result = ReviewFormatter.splitLargeReview(hugeComment);

      expect(result.continuationComments.length).toBeLessThanOrEqual(
        ReviewFormatter.MAX_CONTINUATION_COMMENTS
      );

      // Check if truncation notice is added
      const lastComment =
        result.continuationComments[result.continuationComments.length - 1] || result.mainReview;
      expect(lastComment).toContain('Review truncated');
    });

    it('should validate comment size correctly', () => {
      const smallComment = 'Small comment';
      const largeComment = 'x'.repeat(70000);

      expect(ReviewFormatter.isCommentTooLarge(smallComment)).toBe(false);
      expect(ReviewFormatter.isCommentTooLarge(largeComment)).toBe(true);
    });

    it('should truncate comments preserving important information', () => {
      const importantHeader = '# Critical Security Issues Found\n\n';
      const details = 'x'.repeat(70000);
      const comment = importantHeader + details;

      const truncated = ReviewFormatter.truncateComment(comment);

      expect(truncated).toContain(importantHeader);
      expect(truncated).toContain('Comment truncated');
      expect(truncated.length).toBeLessThanOrEqual(ReviewFormatter.GITHUB_COMMENT_LIMIT);
    });
  });

  describe('Enhanced Metadata', () => {
    it('should include basic metadata in formatted review', () => {
      const aiResponse = {
        summary: {
          verdict: 'approve' as const,
          confidence: 0.9,
          mainIssues: [],
          positives: ['Good code structure'],
        },
        comments: [],
        overallFeedback: 'Great work!',
      };

      const metadata = {
        model: 'gpt-4o',
        tokensUsed: 1000,
        processingTime: 5000,
      };

      const review = ReviewFormatter.formatReview(aiResponse, metadata);

      expect(review.metadata.model).toBe('gpt-4o');
      expect(review.metadata.tokensUsed).toBe(1000);
      expect(review.metadata.processingTime).toBe(5000);
      expect(review.metadata.timestamp).toBeDefined();
      expect(review.metadata.reviewVersion).toBe('1.0.0');
    });

    it('should include enhanced metadata when provided', () => {
      const aiResponse = {
        summary: {
          verdict: 'comment' as const,
          confidence: 0.8,
          mainIssues: ['Consider error handling'],
          positives: ['Clean code'],
        },
        comments: [],
        overallFeedback: 'Good overall',
      };

      const metadata = {
        model: 'gpt-4o-mini',
        tokensUsed: 500,
        processingTime: 3000,
        reviewIteration: 2,
        previousReviewId: 12345,
        chunked: true,
        filesAnalyzed: 10,
        filesSkipped: 2,
        diffSize: 50000,
      };

      const review = ReviewFormatter.formatReview(aiResponse, metadata);

      expect(review.metadata.reviewIteration).toBe(2);
      expect(review.metadata.previousReviewId).toBe(12345);
      expect(review.metadata.features).toEqual({
        chunked: true,
        filesAnalyzed: 10,
        filesSkipped: 2,
      });
      expect(review.metadata.diffSize).toBe(50000);
    });

    it('should include review iteration in body footer when > 1', () => {
      const aiResponse = {
        summary: {
          verdict: 'approve' as const,
          confidence: 0.9,
          mainIssues: [],
          positives: ['Good'],
        },
        comments: [],
        overallFeedback: 'Great!',
      };

      const metadata = {
        model: 'gpt-4o',
        tokensUsed: 100,
        processingTime: 1000,
        reviewIteration: 3,
      };

      const review = ReviewFormatter.formatReview(aiResponse, metadata);

      expect(review.body).toContain('🔄 Review #3');
    });

    it('should include file statistics in footer for chunked reviews', () => {
      const aiResponse = {
        summary: {
          verdict: 'comment' as const,
          confidence: 0.7,
          mainIssues: [],
          positives: [],
        },
        comments: [],
        overallFeedback: 'Reviewed',
      };

      const metadata = {
        model: 'gpt-4o',
        tokensUsed: 200,
        processingTime: 2000,
        chunked: true,
        filesAnalyzed: 15,
        filesSkipped: 3,
      };

      const review = ReviewFormatter.formatReview(aiResponse, metadata);

      expect(review.body).toContain('📊 15 files analyzed');
      expect(review.body).toContain('3 skipped');
    });
  });

  describe('Review Validation', () => {
    it('should validate complete reviews', () => {
      const validReview = {
        body: 'Review body',
        comments: [
          {
            path: 'test.js',
            line: 10,
            side: 'RIGHT' as const,
            body: 'Comment',
            severity: 'info' as const,
            category: 'style' as const,
          },
        ],
        summary: {
          verdict: 'approve' as const,
          confidence: 0.9,
          mainIssues: [],
          positives: ['Good'],
        },
        metadata: {
          model: 'gpt-4o',
          tokensUsed: 100,
          processingTime: 1000,
          reviewVersion: '1.0.0',
        },
      };

      expect(ReviewFormatter.validateReview(validReview)).toBe(true);
    });

    it('should reject incomplete reviews', () => {
      const incompleteReview = {
        body: 'Review',
        comments: [],
        summary: null as any,
        metadata: {
          model: 'gpt-4o',
          tokensUsed: 100,
          processingTime: 1000,
          reviewVersion: '1.0.0',
        },
      };

      expect(ReviewFormatter.validateReview(incompleteReview)).toBe(false);
    });

    it('should reject reviews with invalid verdicts', () => {
      const invalidReview = {
        body: 'Review',
        comments: [],
        summary: {
          verdict: 'invalid' as any,
          confidence: 0.9,
          mainIssues: [],
          positives: [],
        },
        metadata: {
          model: 'gpt-4o',
          tokensUsed: 100,
          processingTime: 1000,
          reviewVersion: '1.0.0',
        },
      };

      expect(ReviewFormatter.validateReview(invalidReview)).toBe(false);
    });
  });

  describe('Continuation Header Creation', () => {
    it('should create properly formatted continuation headers', () => {
      // Access private method through the class
      const header = (ReviewFormatter as any).createContinuationHeader(2);

      expect(header).toContain('Review Continuation (Part 2)');
      expect(header).toContain('continuation of the code review');
    });
  });
});
