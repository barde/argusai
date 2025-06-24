import { Context } from 'hono';
import { validateWebhookSignature } from '../utils/crypto';
import { isDuplicateEvent } from '../utils/deduplication';
import { checkRateLimit } from '../utils/rateLimit';
import type { Env, ReviewMessage } from '../types/env';
import type { GitHubWebhookHeaders, PullRequestEvent } from '../types/github';

export async function webhookHandler(c: Context<{ Bindings: Env }>) {
  const startTime = Date.now();
  
  try {
    // Extract headers
    const headers: GitHubWebhookHeaders = {
      'x-hub-signature-256': c.req.header('x-hub-signature-256'),
      'x-github-event': c.req.header('x-github-event'),
      'x-github-delivery': c.req.header('x-github-delivery'),
    };

    // Validate webhook signature
    const body = await c.req.text();
    const isValid = await validateWebhookSignature(
      body,
      headers['x-hub-signature-256'] || '',
      c.env.GITHUB_WEBHOOK_SECRET
    );

    if (!isValid) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    // Parse payload
    const payload = JSON.parse(body) as PullRequestEvent;
    const eventType = headers['x-github-event'];
    const deliveryId = headers['x-github-delivery'] || crypto.randomUUID();

    // Only process pull request events
    if (eventType !== 'pull_request') {
      return c.json({ message: 'Event ignored' }, 200);
    }

    // Only process specific actions
    const supportedActions = ['opened', 'synchronize', 'edited', 'ready_for_review'];
    if (!supportedActions.includes(payload.action)) {
      return c.json({ message: 'Action ignored' }, 200);
    }

    // Skip draft PRs unless they're marked ready
    if (payload.pull_request.draft && payload.action !== 'ready_for_review') {
      return c.json({ message: 'Draft PR ignored' }, 200);
    }

    // Check for duplicate events
    const isDupe = await isDuplicateEvent(
      c.env.CACHE,
      payload.repository.full_name,
      payload.pull_request.number,
      deliveryId
    );

    if (isDupe) {
      return c.json({ message: 'Duplicate event' }, 200);
    }

    // Check rate limits
    const rateLimitOk = await checkRateLimit(
      c.env.RATE_LIMITS,
      payload.installation?.id || 0
    );

    if (!rateLimitOk) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }

    // Queue the review
    const message: ReviewMessage = {
      repository: payload.repository.full_name,
      prNumber: payload.pull_request.number,
      installationId: payload.installation?.id || 0,
      action: payload.action as ReviewMessage['action'],
      sha: payload.pull_request.head.sha,
      timestamp: Date.now(),
      eventId: deliveryId,
      retryCount: 0,
    };

    await c.env.REVIEW_QUEUE.send(message);

    // Log processing time
    const processingTime = Date.now() - startTime;
    console.log(`Webhook processed in ${processingTime}ms`, {
      repository: message.repository,
      pr: message.prNumber,
      action: message.action,
      deliveryId,
    });

    return c.json({ 
      message: 'Review queued',
      deliveryId,
      processingTime 
    }, 200);

  } catch (error) {
    console.error('Webhook handler error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}