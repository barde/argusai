import type { Env } from '../types/env';
import type { WebhookPayload } from '../types/github';
import { Logger } from '../utils/logger';
import { ReviewData } from '../types/review';

const logger = new Logger('review-processor');

export async function processReviewWithRetry(
  env: Env,
  payload: WebhookPayload,
  deliveryId: string
): Promise<void> {
  const maxAttempts = 3;
  let lastError: Error | undefined;

  const reviewData: ReviewData = {
    repository: payload.repository.full_name,
    prNumber: payload.pull_request.number,
    installationId: payload.installation?.id || 0,
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
        deliveryId
      });
      
      return; // Success
    } catch (error) {
      lastError = error as Error;
      logger.error(`Processing attempt ${attempt} failed`, error as Error, {
        repository: reviewData.repository,
        pr: reviewData.prNumber,
        attempt,
        deliveryId
      });
      
      if (attempt < maxAttempts) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
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
    timestamp: new Date().toISOString()
  });
}

async function processReviewAsync(reviewData: ReviewData, env: Env): Promise<void> {
  const startTime = Date.now();

  logger.info('Starting review processing', {
    pr: reviewData.prNumber,
    action: reviewData.action,
    sha: reviewData.sha,
  });

  try {
    // Step 1: Check if we already have a cached review
    const cacheKey = `review:${reviewData.repository}:${reviewData.prNumber}:${reviewData.sha}`;
    const cachedReview = await env.CACHE.get(cacheKey);
    
    if (cachedReview) {
      logger.info('Found cached review, skipping processing', {
        pr: reviewData.prNumber,
        cacheKey,
      });
      return;
    }

    // Step 2: Check rate limits
    const rateLimitKey = `rate:${reviewData.installationId}:${Math.floor(Date.now() / 60000)}`;
    const count = await env.RATE_LIMITS.get(rateLimitKey);
    
    if (count && parseInt(count) > 10) { // 10 reviews per minute
      throw new Error('Rate limit exceeded');
    }

    // Step 3: Initialize services
    const [owner, repo] = reviewData.repository.split('/');
    const { GitHubAPIService } = await import('./github-api');
    const { GitHubModelsService } = await import('./github-models');
    const { ReviewFormatter } = await import('./review-formatter');
    
    const githubAPI = new GitHubAPIService(env, reviewData.installationId);
    const modelsService = new GitHubModelsService(env);

    // Step 4: Fetch PR data and diff
    logger.info('Fetching PR data from GitHub');
    const [prData, diff] = await Promise.all([
      githubAPI.getPullRequest(owner, repo, reviewData.prNumber),
      githubAPI.getPullRequestDiff(owner, repo, reviewData.prNumber)
    ]);

    // Step 5: Analyze with GitHub Models
    logger.info('Sending to GitHub Models for analysis');
    const startAnalysis = Date.now();
    const aiResponseText = await modelsService.generateReview(diff, {
      title: prData.title,
      description: prData.description,
      author: prData.author,
      targetBranch: prData.targetBranch
    });
    const analysisTime = Date.now() - startAnalysis;

    // Step 6: Parse and format the response
    const aiResponse = ReviewFormatter.parseAIResponse(aiResponseText);
    const review = ReviewFormatter.formatReview(aiResponse, {
      model: env.GITHUB_MODEL || 'gpt-4o-mini',
      tokensUsed: 0, // This would come from the API response
      processingTime: analysisTime
    });

    // Step 7: Post review to GitHub
    logger.info('Posting review to GitHub');
    const reviewEvent = aiResponse.summary.verdict === 'approve' ? 'APPROVE' :
                       aiResponse.summary.verdict === 'request_changes' ? 'REQUEST_CHANGES' :
                       'COMMENT';
    
    await githubAPI.createReview(owner, repo, reviewData.prNumber, {
      body: review.body,
      event: reviewEvent,
      comments: review.comments.map(comment => ({
        path: comment.path,
        line: comment.line,
        body: comment.body
      }))
    });

    // Step 6: Update rate limit and cache
    await Promise.all([
      // Update rate limit counter
      env.RATE_LIMITS.put(rateLimitKey, String((parseInt(count || '0') + 1)), {
        expirationTtl: 60
      }),
      // Cache the review
      env.CACHE.put(cacheKey, JSON.stringify({
        timestamp: Date.now(),
        sha: reviewData.sha,
        review: review,
        aiResponse: aiResponse
      }), {
        expirationTtl: 86400 * 7, // 7 days
      }).catch(error => {
        logger.warn('Failed to cache review', error as Error);
      })
    ]);

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