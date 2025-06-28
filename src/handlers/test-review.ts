import { Context } from 'hono';
import type { Env } from '../types/env';

export async function testReviewHandler(c: Context<{ Bindings: Env }>) {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not available in production' }, 404);
  }

  const testPayload = {
    action: 'synchronize',
    pull_request: {
      number: 23,
      head: { sha: 'test-sha' },
      draft: false
    },
    repository: {
      full_name: 'barde/argusai'
    },
    installation: {
      id: 72940228
    }
  };

  const reviewData = {
    repository: testPayload.repository.full_name,
    prNumber: testPayload.pull_request.number,
    installationId: testPayload.installation?.id || 0,
    action: testPayload.action,
    sha: testPayload.pull_request.head.sha,
    timestamp: Date.now(),
    eventId: 'test-' + Date.now(),
    payload: testPayload as any,
  };

  try {
    console.log('=== TEST REVIEW: Starting ===');
    
    // Import and run the review processor
    const { processReviewAsync } = await import('../services/review-processor');
    await processReviewAsync(reviewData, c.env);
    
    console.log('=== TEST REVIEW: Success ===');
    
    return c.json({
      success: true,
      message: 'Review processed successfully'
    });
  } catch (error) {
    console.error('=== TEST REVIEW ERROR ===', error);
    
    return c.json({
      success: false,
      error: {
        message: (error as Error).message,
        stack: (error as Error).stack,
        details: (error as any).response?.data || (error as any).data
      }
    });
  }
}