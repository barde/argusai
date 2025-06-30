import type { Env } from '../types/env';
import type { PullRequestEvent } from '../types/github';
import { Logger } from '../utils/logger';
import { ReviewData } from '../types/review';
import type { GitHubAPIService } from './github-api';
import type { GitHubModelsService } from './github-models';
import { StorageServiceFactory } from '../storage';

const logger = new Logger('review-processor');

// Helper function to add exponential backoff delay
async function exponentialBackoff(attempt: number, baseDelay: number = 1000): Promise<void> {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), 30000); // Max 30 seconds
  await new Promise((resolve) => setTimeout(resolve, delay));
}

// Helper function to perform chunked review
async function performChunkedReview(
  githubAPI: GitHubAPIService,
  modelsService: GitHubModelsService,
  logger: Logger,
  owner: string,
  repo: string,
  prNumber: number,
  prData: any,
  env: Env
): Promise<string> {
  // Get individual files
  const files = await githubAPI.getChangedFiles(owner, repo, prNumber);

  logger.info('Processing files individually', {
    fileCount: files.length,
    pr: prNumber,
  });

  // Configuration for parallel processing
  const CONCURRENT_FILE_REVIEWS = parseInt(env.CONCURRENT_FILE_REVIEWS || '3');
  const MAX_RETRIES = 3;

  // Process files in batches to avoid overwhelming the API
  const fileReviews: Map<string, string> = new Map();
  const skippedFiles: string[] = [];

  // Function to review a single file with retry logic
  async function reviewFileWithRetry(file: any): Promise<void> {
    if (!file.patch) return; // Skip files without changes

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        logger.info('Reviewing file', {
          filename: file.filename,
          additions: file.additions,
          deletions: file.deletions,
          attempt: attempt + 1,
        });

        const fileReview = await modelsService.generateReview(file.patch, {
          title: `Review of ${file.filename}`,
          description: `Part of PR: ${prData.title}\nFile: ${file.filename}\nChanges: +${file.additions} -${file.deletions}`,
          author: prData.author,
          targetBranch: prData.targetBranch,
        });

        fileReviews.set(file.filename, fileReview);
        return;
      } catch (error: any) {
        if (error.message?.includes('429') && attempt < MAX_RETRIES - 1) {
          // Rate limit - exponential backoff
          logger.warn(`Rate limit hit for ${file.filename}, retrying...`, { attempt });
          await exponentialBackoff(attempt);
          continue;
        } else if (error.message?.includes('413') || error.message?.includes('Payload Too Large')) {
          // File still too large
          logger.warn(`File too large to review: ${file.filename}`);
          skippedFiles.push(file.filename);
          return;
        } else if (attempt === MAX_RETRIES - 1) {
          // Final attempt failed
          logger.error(`Failed to review ${file.filename} after ${MAX_RETRIES} attempts`, error);
          skippedFiles.push(file.filename);
          return;
        }
        // Retry on other errors
        await exponentialBackoff(attempt);
      }
    }
  }

  // Process files in batches
  const fileBatches: any[][] = [];
  for (let i = 0; i < files.length; i += CONCURRENT_FILE_REVIEWS) {
    fileBatches.push(files.slice(i, i + CONCURRENT_FILE_REVIEWS));
  }

  for (const batch of fileBatches) {
    await Promise.all(batch.map((file) => reviewFileWithRetry(file)));
  }

  // Create a formatted review from individual file reviews
  const formatter = await import('./review-formatter');
  const ReviewFormatter = formatter.ReviewFormatter;

  // Parse individual reviews and create a combined review
  const parsedReviews = Array.from(fileReviews.entries()).map(([filename, review]) => ({
    filename,
    review: ReviewFormatter.parseMarkdownResponse(review),
  }));

  // Calculate stats for the chunked review
  let approveCount = 0;
  let requestChangesCount = 0;
  let criticalIssues = 0;
  let securityIssues = 0;
  let bugs = 0;

  const fileResults = parsedReviews.map(({ filename, review }) => {
    // Count verdicts
    if (review.summary.verdict === 'approve') approveCount++;
    else if (review.summary.verdict === 'request_changes') requestChangesCount++;

    // Count issues
    review.comments.forEach((comment) => {
      if (comment.severity === 'critical') criticalIssues++;
      if (comment.category === 'security') securityIssues++;
      if (comment.category === 'bug') bugs++;
    });

    return {
      filename,
      verdict: review.summary.verdict,
      issues: review.comments.length,
      review,
    };
  });

  // Determine overall verdict
  const verdict =
    requestChangesCount > 0
      ? 'request_changes'
      : approveCount === parsedReviews.length
        ? 'approve'
        : 'comment';

  // Format the chunked review
  const chunkedReview = ReviewFormatter.formatChunkedReview({
    title: prData.title,
    author: prData.author,
    filesCount: files.length,
    reviewedCount: fileReviews.size,
    skippedCount: skippedFiles.length,
    fileResults,
    verdict,
    criticalIssues,
    securityIssues,
    bugs,
    approveCount,
    requestChangesCount,
  });

  logger.info('File-based review completed', {
    pr: prNumber,
    filesReviewed: fileReviews.size,
    skippedFiles: skippedFiles.length,
  });

  return chunkedReview;
}

export async function processReviewWithRetry(
  env: Env,
  payload: PullRequestEvent,
  deliveryId: string
): Promise<void> {
  const maxAttempts = 3;
  let lastError: Error | undefined;

  // Ensure we have a valid installation ID
  if (!payload.installation?.id) {
    logger.error('No installation ID in webhook payload', {
      repository: payload.repository.full_name,
      pr: payload.pull_request.number,
    });
    throw new Error('Missing installation ID in webhook payload');
  }

  const reviewData: ReviewData = {
    repository: payload.repository.full_name,
    prNumber: payload.pull_request.number,
    installationId: payload.installation.id,
    action: payload.action,
    sha: payload.pull_request.head.sha,
    timestamp: Date.now(),
    eventId: deliveryId,
    payload,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await processReviewAsync(reviewData, env);

      logger.info('Review processed successfully', {
        repository: reviewData.repository,
        pr: reviewData.prNumber,
        attempt,
        deliveryId,
      });

      return; // Success
    } catch (error) {
      lastError = error as Error;
      logger.error(`Processing attempt ${attempt} failed`, error as Error, {
        repository: reviewData.repository,
        pr: reviewData.prNumber,
        attempt,
        deliveryId,
      });

      if (attempt < maxAttempts) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All attempts failed
  logger.error('All processing attempts failed', lastError!, {
    type: 'review_failure',
    repository: reviewData.repository,
    pr: reviewData.prNumber,
    attempts: maxAttempts,
    deliveryId,
    timestamp: new Date().toISOString(),
  });
}

export async function processReviewAsync(reviewData: ReviewData, env: Env): Promise<void> {
  const startTime = Date.now();

  logger.info('Starting review processing', {
    pr: reviewData.prNumber,
    action: reviewData.action,
    sha: reviewData.sha,
  });

  try {
    // Initialize storage service
    const storageFactory = new StorageServiceFactory();
    const storage = storageFactory.create(env);

    // Step 1: Check if we already have a cached review
    const cachedReview = await storage.getReview(
      reviewData.repository,
      reviewData.prNumber,
      reviewData.sha
    );

    if (cachedReview) {
      logger.info('Found cached review, skipping processing', {
        pr: reviewData.prNumber,
        sha: reviewData.sha,
      });
      return;
    }

    // Step 2: Check rate limits
    const rateLimitResult = await storage.incrementRateLimit(String(reviewData.installationId));

    if (!rateLimitResult.allowed) {
      throw new Error(`Rate limit exceeded. Remaining: ${rateLimitResult.remaining}`);
    }

    // Step 3: Initialize services
    const [owner, repo] = reviewData.repository.split('/');
    logger.info('Initializing services', {
      owner,
      repo,
      installationId: reviewData.installationId,
      hasAppId: !!env.GITHUB_APP_ID,
      hasAppKey: !!env.GITHUB_APP_PRIVATE_KEY,
      hasToken: !!env.GITHUB_TOKEN,
    });

    const { GitHubAPIService } = await import('./github-api');
    const { GitHubModelsService } = await import('./github-models');
    const { ReviewFormatter } = await import('./review-formatter');

    const githubAPI = new GitHubAPIService(env, reviewData.installationId);
    const modelsService = new GitHubModelsService(env);

    // Step 4: Fetch PR data and diff
    logger.info('Fetching PR data from GitHub');
    const [prData, diff] = await Promise.all([
      githubAPI.getPullRequest(owner || '', repo || '', reviewData.prNumber),
      githubAPI.getPullRequestDiff(owner || '', repo || '', reviewData.prNumber),
    ]);

    // Step 5: Analyze with GitHub Models (with chunking support)
    logger.info('Sending to GitHub Models for analysis');
    const startAnalysis = Date.now();

    // Pre-flight check: Estimate payload size to avoid 413 errors
    const MAX_DIFF_SIZE = parseInt(env.MAX_DIFF_SIZE || '500000'); // 500KB default
    const estimatedPayloadSize =
      diff.length +
      JSON.stringify({
        title: prData.title,
        description: prData.description,
        author: prData.author,
        targetBranch: prData.targetBranch,
      }).length;

    let aiResponseText: string;

    if (estimatedPayloadSize > MAX_DIFF_SIZE) {
      logger.info('PR exceeds size limit, using file-based review', {
        pr: reviewData.prNumber,
        diffSize: diff.length,
        maxSize: MAX_DIFF_SIZE,
      });

      // Skip directly to file-based review
      aiResponseText = await performChunkedReview(
        githubAPI,
        modelsService,
        logger,
        owner || '',
        repo || '',
        reviewData.prNumber,
        prData,
        env
      );
    } else {
      try {
        // Try sending the full diff
        aiResponseText = await modelsService.generateReview(diff, {
          title: prData.title,
          description: prData.description || '',
          author: prData.author,
          targetBranch: prData.targetBranch,
        });
      } catch (error: any) {
        if (error.message?.includes('413') || error.message?.includes('Payload Too Large')) {
          logger.info('PR too large, switching to file-based review', {
            pr: reviewData.prNumber,
            diffSize: diff.length,
          });

          aiResponseText = await performChunkedReview(
            githubAPI,
            modelsService,
            logger,
            owner || '',
            repo || '',
            reviewData.prNumber,
            prData,
            env
          );
        } else {
          // Re-throw if it's not a payload size error
          throw error;
        }
      }
    }

    const analysisTime = Date.now() - startAnalysis;

    // Step 6: Parse and format the response
    const aiResponse = ReviewFormatter.parseAIResponse(aiResponseText);
    const review = ReviewFormatter.formatReview(aiResponse, {
      model: env.GITHUB_MODEL || 'gpt-4o-mini',
      tokensUsed: 0, // This would come from the API response
      processingTime: analysisTime,
    });

    // Step 7: Check for existing review and post/update
    logger.info('Checking for existing review');
    const existingReview = await githubAPI.findExistingArgusReview(
      owner || '',
      repo || '',
      reviewData.prNumber
    );

    const reviewEvent =
      aiResponse.summary.verdict === 'approve'
        ? 'APPROVE'
        : aiResponse.summary.verdict === 'request_changes'
          ? 'REQUEST_CHANGES'
          : 'COMMENT';

    const reviewPayload = {
      body: review.body,
      event: reviewEvent as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
      comments: review.comments.map((comment) => ({
        path: comment.path,
        line: comment.line,
        body: comment.body,
      })),
    };

    if (existingReview && env.UPDATE_EXISTING_REVIEWS !== 'false') {
      logger.info('Updating existing review', { reviewId: existingReview.id });
      await githubAPI.updateExistingReview(
        owner || '',
        repo || '',
        reviewData.prNumber,
        existingReview.id,
        reviewPayload
      );
    } else {
      logger.info('Creating new review with continuation support');
      await githubAPI.createReviewWithContinuation(
        owner || '',
        repo || '',
        reviewData.prNumber,
        reviewPayload
      );
    }

    // Step 6: Cache the review
    try {
      await storage.saveReview(reviewData.repository, reviewData.prNumber, reviewData.sha, {
        repository: reviewData.repository,
        prNumber: reviewData.prNumber,
        sha: reviewData.sha,
        result: {
          summary: review.body || 'No summary',
          files:
            review.comments?.map((comment) => ({
              path: comment.path || 'unknown',
              review: comment.body || '',
              severity: 'info' as const,
            })) || [],
        },
        metadata: {
          model: (aiResponse as any).model || 'unknown',
          timestamp: Date.now(),
          processingTime: Date.now() - startTime,
        },
      });
    } catch (error) {
      logger.warn('Failed to cache review', error as Error);
    }

    const processingTime = Date.now() - startTime;
    logger.info('Review processing completed', {
      pr: reviewData.prNumber,
      processingTime,
    });
  } catch (error) {
    logger.error('Failed to process review', error as Error, {
      pr: reviewData.prNumber,
      sha: reviewData.sha,
    });

    throw error;
  }
}
