export interface StorageKey {
  namespace: 'review' | 'rate' | 'config' | 'dedup' | 'debug' | 'history' | 'status' | 'thread';
  key: string;
  ttl?: number;
}

export interface ReviewData {
  repository: string;
  prNumber: number;
  sha: string;
  result: {
    summary: string;
    files: Array<{
      path: string;
      review: string;
      severity: 'info' | 'warning' | 'error';
    }>;
  };
  metadata: {
    model: string;
    timestamp: number;
    processingTime: number;
  };
}

export interface ReviewStatus {
  repository: string;
  prNumber: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
  error?: string;
  retryCount?: number;
}

export interface ReviewHistory {
  repository: string;
  prNumber: number;
  reviews: Array<{
    sha: string;
    timestamp: number;
    model: string;
    status: 'completed' | 'failed';
  }>;
}

export interface RateLimitData {
  installationId: string;
  window: number;
  count: number;
  resetAt: number;
}

export interface RepositoryConfig {
  enabled: boolean;
  model: 'gpt-4o' | 'gpt-4o-mini' | 'o1-preview' | 'o1-mini';
  reviewDrafts: boolean;
  autoApprove: boolean;
  maxFilesPerReview: number;
  ignorePaths: string[];
  focusPaths: string[];
  customPrompt?: string;
  language: 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh';
  updatedAt?: number;
}

export interface DeduplicationData {
  eventId: string;
  processedAt: number;
}

export interface DebugData {
  type: 'error' | 'webhook' | 'api-call';
  timestamp: number;
  data: any;
}

export interface StorageMetrics {
  namespace: string;
  reads: number;
  writes: number;
  deletes: number;
  errors: number;
  lastError?: string;
  lastUpdated: number;
}

// Comment threading support
export interface CommentThread {
  id: string;
  repository: string;
  prNumber: number;
  originalCommentId: number;
  originalCommentBody: string;
  replies: Array<{
    id: number;
    body: string;
    createdAt: string;
    isArgusAI: boolean;
  }>;
  resolved: boolean;
  lastActivity: number;
  metadata?: {
    file?: string;
    line?: number;
    severity?: string;
  };
}

export type StorageValue =
  | ReviewData
  | ReviewStatus
  | ReviewHistory
  | RateLimitData
  | RepositoryConfig
  | DeduplicationData
  | DebugData
  | StorageMetrics
  | CommentThread;

export interface StorageOptions {
  ttl?: number;
  metadata?: Record<string, string>;
}

export interface ListOptions {
  prefix: string;
  limit?: number;
  cursor?: string;
}

export interface ListResult {
  keys: Array<{
    name: string;
    metadata?: Record<string, string>;
  }>;
  list_complete: boolean;
  cursor?: string;
}

export interface BatchWriteOperation {
  key: string;
  value: StorageValue;
  options?: StorageOptions;
}

export interface BatchResult {
  successful: string[];
  failed: Array<{
    key: string;
    error: string;
  }>;
}
