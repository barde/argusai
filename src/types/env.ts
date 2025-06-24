export interface Env {
  // Environment variables
  ENVIRONMENT: 'development' | 'production';
  GITHUB_APP_ID: string;
  GITHUB_MODEL: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';

  // Secrets
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_TOKEN: string; // PAT with models:read permission
  SENTRY_DSN?: string;
  SLACK_WEBHOOK_URL?: string;

  // KV Namespaces
  CACHE: KVNamespace;
  RATE_LIMITS: KVNamespace;
  CONFIG: KVNamespace;

  // Queue
  REVIEW_QUEUE: Queue<ReviewMessage>;

  // Optional bindings
  DIFF_STORAGE?: R2Bucket;
}

export interface ReviewMessage {
  repository: string;
  prNumber: number;
  installationId: number;
  action: 'opened' | 'synchronize' | 'edited' | 'ready_for_review';
  sha: string;
  timestamp: number;
  eventId: string;
  retryCount?: number;
}