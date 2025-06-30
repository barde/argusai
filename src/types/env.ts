export interface Env {
  // Environment variables
  ENVIRONMENT: 'development' | 'production';
  GITHUB_APP_ID: string;
  GITHUB_MODEL: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  PUBLIC_URL?: string; // Optional, will use request URL if not set

  // Secrets
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_TOKEN: string; // PAT with models:read permission
  SENTRY_DSN?: string;
  SLACK_WEBHOOK_URL?: string;

  // OAuth Configuration
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  JWT_SECRET?: string;
  ENCRYPTION_KEY?: string;

  // Chunking configuration
  MAX_DIFF_SIZE?: string; // Maximum diff size before switching to chunked review (default: 500KB)
  CONCURRENT_FILE_REVIEWS?: string; // Number of files to review in parallel (default: 3)

  // Comment configuration
  UPDATE_EXISTING_REVIEWS?: string; // Whether to update existing reviews or create new ones (default: true)

  // KV Namespaces
  CACHE: KVNamespace;
  RATE_LIMITS: KVNamespace;
  CONFIG: KVNamespace;
  OAUTH_SESSIONS?: KVNamespace;
  OAUTH_TOKENS?: KVNamespace;

  // Optional bindings
  LOG_STORAGE?: R2Bucket; // For batch log storage if needed
}
