import type { PullRequestEvent, PullRequest } from '@octokit/webhooks-types';

export interface GitHubWebhookHeaders {
  'x-hub-signature-256'?: string;
  'x-github-event'?: string;
  'x-github-delivery'?: string;
}

export interface ProcessedPullRequest {
  owner: string;
  repo: string;
  number: number;
  title: string;
  description: string | null;
  author: string;
  base: string;
  head: string;
  sha: string;
  isDraft: boolean;
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface Review {
  body: string;
  comments: ReviewComment[];
  summary: ReviewSummary;
  metadata: ReviewMetadata;
}

export interface ReviewComment {
  path: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
  body: string;
  severity: 'info' | 'warning' | 'error';
  category: 'bug' | 'security' | 'performance' | 'style' | 'improvement';
}

export interface ReviewSummary {
  verdict: 'approve' | 'request_changes' | 'comment';
  confidence: number;
  mainIssues: string[];
  positives: string[];
}

export interface ReviewMetadata {
  model: string;
  tokensUsed: number;
  processingTime: number;
  reviewVersion: string;
  reviewIteration?: number; // Track how many times this PR has been reviewed
  previousReviewId?: number; // ID of the previous review if this is an update
  editReason?: string; // Reason for updating the review
  features?: {
    chunked: boolean; // Whether chunked review was used
    filesAnalyzed: number; // Number of files actually analyzed
    filesSkipped: number; // Number of files skipped
    continuationComments?: number; // Number of continuation comments posted
  };
  timestamp?: number; // When the review was created
  diffSize?: number; // Size of the diff analyzed
}

export type { PullRequestEvent, PullRequest };
export type WebhookPayload = PullRequestEvent;
