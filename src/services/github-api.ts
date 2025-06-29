import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { Logger } from '../utils/logger';
import type { Env } from '../types/env';
import { ReviewFormatter } from './review-formatter';

const logger = new Logger('github-api');

interface ExistingReview {
  id: number;
  body: string | null;
  submitted_at: string | null;
  user: {
    login: string;
    type: string;
  } | null;
}

export class GitHubAPIService {
  private octokit: Octokit;

  constructor(env: Env, installationId: number) {
    logger.info('=== GITHUB API INIT ===', {
      appId: env.GITHUB_APP_ID,
      installationId,
      hasPrivateKey: !!env.GITHUB_APP_PRIVATE_KEY,
      privateKeyLength: env.GITHUB_APP_PRIVATE_KEY?.length || 0,
      privateKeyStart: env.GITHUB_APP_PRIVATE_KEY?.substring(0, 50) || 'NO KEY',
    });

    this.octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: parseInt(env.GITHUB_APP_ID),
        privateKey: env.GITHUB_APP_PRIVATE_KEY,
        installationId,
      },
    });
  }

  async getPullRequest(owner: string, repo: string, pullNumber: number) {
    try {
      logger.info('Fetching pull request', { owner, repo, pullNumber });

      const { data: pr } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });

      return {
        title: pr.title,
        description: pr.body || '',
        author: pr.user?.login || 'unknown',
        targetBranch: pr.base.ref,
        sourceBranch: pr.head.ref,
        sha: pr.head.sha,
        draft: pr.draft,
        state: pr.state,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changed_files,
      };
    } catch (error) {
      logger.error('=== GITHUB API ERROR (getPullRequest) ===', error as Error, {
        owner,
        repo,
        pullNumber,
        statusCode: (error as any).status,
        message: (error as any).message,
        response: (error as any).response?.data,
      });
      throw error;
    }
  }

  async getPullRequestDiff(owner: string, repo: string, pullNumber: number): Promise<string> {
    try {
      logger.info('Fetching pull request diff', { owner, repo, pullNumber });

      const { data } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
        mediaType: {
          format: 'diff',
        },
      });

      // The diff is returned as a string when using the diff media type
      const diff = data as unknown as string;

      logger.info('Fetched diff', {
        owner,
        repo,
        pullNumber,
        diffSize: diff.length,
      });

      return diff;
    } catch (error) {
      logger.error('Failed to fetch pull request diff', error as Error, {
        owner,
        repo,
        pullNumber,
      });
      throw error;
    }
  }

  async getChangedFiles(owner: string, repo: string, pullNumber: number) {
    try {
      logger.info('Fetching changed files', { owner, repo, pullNumber });

      const files = [];
      let page = 1;

      while (true) {
        const { data } = await this.octokit.pulls.listFiles({
          owner,
          repo,
          pull_number: pullNumber,
          per_page: 100,
          page,
        });

        files.push(...data);

        if (data.length < 100) break;
        page++;
      }

      logger.info('Fetched changed files', {
        owner,
        repo,
        pullNumber,
        fileCount: files.length,
      });

      return files.map((file) => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
      }));
    } catch (error) {
      logger.error('Failed to fetch changed files', error as Error, {
        owner,
        repo,
        pullNumber,
      });
      throw error;
    }
  }

  async createReview(
    owner: string,
    repo: string,
    pullNumber: number,
    review: {
      body: string;
      event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
      comments?: Array<{
        path: string;
        line: number;
        body: string;
      }>;
    }
  ) {
    try {
      logger.info('Creating review', {
        owner,
        repo,
        pullNumber,
        event: review.event,
        commentCount: review.comments?.length || 0,
      });

      const { data } = await this.octokit.pulls.createReview({
        owner,
        repo,
        pull_number: pullNumber,
        body: review.body,
        event: review.event,
        comments: review.comments?.map((comment) => ({
          path: comment.path,
          line: comment.line,
          body: comment.body,
        })),
      });

      logger.info('Review created successfully', {
        owner,
        repo,
        pullNumber,
        reviewId: data.id,
      });

      return data;
    } catch (error) {
      logger.error('Failed to create review', error as Error, {
        owner,
        repo,
        pullNumber,
      });
      throw error;
    }
  }

  async createComment(owner: string, repo: string, pullNumber: number, body: string) {
    try {
      logger.info('Creating PR comment', { owner, repo, pullNumber });

      const { data } = await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body,
      });

      logger.info('Comment created successfully', {
        owner,
        repo,
        pullNumber,
        commentId: data.id,
      });

      return data;
    } catch (error) {
      logger.error('Failed to create comment', error as Error, {
        owner,
        repo,
        pullNumber,
      });
      throw error;
    }
  }

  /**
   * Find existing ArgusAI review for a PR
   */
  async findExistingArgusReview(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<ExistingReview | null> {
    try {
      logger.info('Finding existing ArgusAI review', { owner, repo, pullNumber });

      const reviews = await this.octokit.pulls.listReviews({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });

      // Look for reviews from our bot that contain our signature
      const argusReview = reviews.data.find(
        (review) => review.user?.type === 'Bot' && review.body?.includes('🤖 ArgusAI Code Review')
      );

      if (argusReview) {
        logger.info('Found existing ArgusAI review', {
          reviewId: argusReview.id,
          submittedAt: argusReview.submitted_at,
        });
        return argusReview as ExistingReview;
      }

      logger.info('No existing ArgusAI review found');
      return null;
    } catch (error) {
      logger.error('Failed to find existing review', error as Error, {
        owner,
        repo,
        pullNumber,
      });
      return null;
    }
  }

  /**
   * Create a review with support for continuation comments
   */
  async createReviewWithContinuation(
    owner: string,
    repo: string,
    pullNumber: number,
    review: {
      body: string;
      event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
      comments?: Array<{
        path: string;
        line: number;
        body: string;
      }>;
    }
  ) {
    try {
      // Check if the review body is too large
      const splitResult = ReviewFormatter.splitLargeReview(review.body);

      // Create the main review with possibly truncated body
      const mainReview = await this.createReview(owner, repo, pullNumber, {
        ...review,
        body: splitResult.mainReview,
      });

      // Post continuation comments if needed
      if (splitResult.continuationComments.length > 0) {
        logger.info('Posting continuation comments', {
          count: splitResult.continuationComments.length,
        });

        for (const continuationBody of splitResult.continuationComments) {
          await this.createComment(owner, repo, pullNumber, continuationBody);

          // Small delay to avoid rate limiting
          await new Promise((resolve) => globalThis.setTimeout(resolve, 1000));
        }
      }

      return mainReview;
    } catch (error) {
      logger.error('Failed to create review with continuation', error as Error, {
        owner,
        repo,
        pullNumber,
      });
      throw error;
    }
  }

  /**
   * Update an existing review by dismissing it and creating a new one
   * Note: GitHub API doesn't support direct review body updates
   */
  async updateExistingReview(
    owner: string,
    repo: string,
    pullNumber: number,
    existingReviewId: number,
    newReview: {
      body: string;
      event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
      comments?: Array<{
        path: string;
        line: number;
        body: string;
      }>;
    }
  ) {
    try {
      logger.info('Updating existing review', {
        owner,
        repo,
        pullNumber,
        existingReviewId,
      });

      // First, dismiss the old review
      await this.octokit.pulls.dismissReview({
        owner,
        repo,
        pull_number: pullNumber,
        review_id: existingReviewId,
        message: 'Superseded by updated ArgusAI review',
      });

      // Create a new review with updated content
      const updatedBody = `${newReview.body}\n\n---\n<sub>📝 This review has been updated. Previous review was dismissed.</sub>`;

      return await this.createReviewWithContinuation(owner, repo, pullNumber, {
        ...newReview,
        body: updatedBody,
      });
    } catch (error) {
      logger.error('Failed to update review', error as Error, {
        owner,
        repo,
        pullNumber,
        existingReviewId,
      });
      throw error;
    }
  }
}
