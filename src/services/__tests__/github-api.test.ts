/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubAPIService } from '../github-api';
import { ReviewFormatter } from '../review-formatter';

// Mock Octokit
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    pulls: {
      listReviews: vi.fn(),
      createReview: vi.fn(),
      dismissReview: vi.fn(),
    },
    issues: {
      createComment: vi.fn(),
    },
  })),
}));

// Mock createAppAuth
vi.mock('@octokit/auth-app', () => ({
  createAppAuth: vi.fn(),
}));

describe('GitHubAPIService', () => {
  let service: GitHubAPIService;
  let mockEnv: any;

  beforeEach(() => {
    mockEnv = {
      GITHUB_APP_ID: '12345',
      GITHUB_APP_PRIVATE_KEY: 'test-key',
    };
    service = new GitHubAPIService(mockEnv, 1);
  });

  describe('findExistingArgusReview', () => {
    it('should find existing ArgusAI review', async () => {
      const mockReview = {
        id: 123,
        body: '# 🤖 ArgusAI Code Review\n\nTest review',
        submitted_at: '2024-01-01T00:00:00Z',
        user: {
          login: 'argusai[bot]',
          type: 'Bot',
        },
      };

      (service as any).octokit.pulls.listReviews.mockResolvedValue({
        data: [{ id: 1, body: 'Other review', user: { type: 'User' } }, mockReview],
      });

      const result = await service.findExistingArgusReview('owner', 'repo', 1);

      expect(result).toEqual(mockReview);
      expect((service as any).octokit.pulls.listReviews).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
        per_page: 100,
      });
    });

    it('should return null when no ArgusAI review exists', async () => {
      (service as any).octokit.pulls.listReviews.mockResolvedValue({
        data: [{ id: 1, body: 'Human review', user: { type: 'User' } }],
      });

      const result = await service.findExistingArgusReview('owner', 'repo', 1);

      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      (service as any).octokit.pulls.listReviews.mockRejectedValue(new Error('API Error'));

      const result = await service.findExistingArgusReview('owner', 'repo', 1);

      expect(result).toBeNull();
    });
  });

  describe('createReviewWithContinuation', () => {
    beforeEach(() => {
      // Mock ReviewFormatter.splitLargeReview
      vi.spyOn(ReviewFormatter, 'splitLargeReview');
    });

    it('should create review without continuation for small comments', async () => {
      const review = {
        body: 'Small review',
        event: 'APPROVE' as const,
        comments: [],
      };

      (ReviewFormatter.splitLargeReview as any).mockReturnValue({
        mainReview: review.body,
        continuationComments: [],
      });

      (service as any).octokit.pulls.createReview.mockResolvedValue({
        data: { id: 123 },
      });

      await service.createReviewWithContinuation('owner', 'repo', 1, review);

      expect((service as any).octokit.pulls.createReview).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
        body: 'Small review',
        event: 'APPROVE',
        comments: [],
      });
      expect((service as any).octokit.issues.createComment).not.toHaveBeenCalled();
    });

    it('should create review with continuation comments for large reviews', async () => {
      const review = {
        body: 'x'.repeat(70000), // Large review
        event: 'COMMENT' as const,
        comments: [],
      };

      (ReviewFormatter.splitLargeReview as any).mockReturnValue({
        mainReview: 'Main review content...',
        continuationComments: ['Continuation 1', 'Continuation 2'],
      });

      (service as any).octokit.pulls.createReview.mockResolvedValue({
        data: { id: 123 },
      });

      (service as any).octokit.issues.createComment.mockResolvedValue({
        data: { id: 456 },
      });

      await service.createReviewWithContinuation('owner', 'repo', 1, review);

      expect((service as any).octokit.pulls.createReview).toHaveBeenCalledTimes(1);
      expect((service as any).octokit.issues.createComment).toHaveBeenCalledTimes(2);
      expect((service as any).octokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        body: 'Continuation 1',
      });
    });

    it('should add delays between continuation comments', async () => {
      const review = {
        body: 'Large review',
        event: 'REQUEST_CHANGES' as const,
        comments: [],
      };

      (ReviewFormatter.splitLargeReview as any).mockReturnValue({
        mainReview: 'Main',
        continuationComments: ['Part 1', 'Part 2', 'Part 3'],
      });

      (service as any).octokit.pulls.createReview.mockResolvedValue({
        data: { id: 123 },
      });

      const startTime = Date.now();
      await service.createReviewWithContinuation('owner', 'repo', 1, review);
      const endTime = Date.now();

      // Should have delays between comments (3 comments = 2 delays of 1000ms)
      expect(endTime - startTime).toBeGreaterThanOrEqual(2000);
    });
  });

  describe('updateExistingReview', () => {
    it('should dismiss old review and create new one', async () => {
      const newReview = {
        body: 'Updated review',
        event: 'APPROVE' as const,
        comments: [],
      };

      (service as any).octokit.pulls.dismissReview.mockResolvedValue({});

      // Mock createReviewWithContinuation
      vi.spyOn(service, 'createReviewWithContinuation').mockResolvedValue({
        id: 789,
        body: 'Updated review',
      } as any);

      await service.updateExistingReview('owner', 'repo', 1, 123, newReview);

      expect((service as any).octokit.pulls.dismissReview).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
        review_id: 123,
        message: 'Superseded by updated ArgusAI review',
      });

      expect(service.createReviewWithContinuation).toHaveBeenCalledWith(
        'owner',
        'repo',
        1,
        expect.objectContaining({
          body: expect.stringContaining('This review has been updated'),
          event: 'APPROVE',
          comments: [],
        })
      );
    });

    it('should handle errors when dismissing review', async () => {
      const newReview = {
        body: 'Updated review',
        event: 'COMMENT' as const,
        comments: [],
      };

      (service as any).octokit.pulls.dismissReview.mockRejectedValue(
        new Error('Cannot dismiss review')
      );

      await expect(
        service.updateExistingReview('owner', 'repo', 1, 123, newReview)
      ).rejects.toThrow('Cannot dismiss review');
    });
  });

  describe('createComment', () => {
    it('should create comment successfully', async () => {
      const mockComment = {
        id: 999,
        body: 'Test comment',
      };

      (service as any).octokit.issues.createComment.mockResolvedValue({
        data: mockComment,
      });

      const result = await service.createComment('owner', 'repo', 1, 'Test comment');

      expect(result).toEqual(mockComment);
      expect((service as any).octokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        body: 'Test comment',
      });
    });

    it('should throw error on failure', async () => {
      (service as any).octokit.issues.createComment.mockRejectedValue(new Error('API Error'));

      await expect(service.createComment('owner', 'repo', 1, 'Test')).rejects.toThrow('API Error');
    });
  });
});
