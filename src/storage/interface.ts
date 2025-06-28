import { Env } from '../types/env';
import {
  ReviewData,
  ReviewStatus,
  ReviewHistory,
  RateLimitData,
  RepositoryConfig,
  DebugData,
  StorageMetrics,
  StorageOptions,
  ListOptions,
  ListResult,
  BatchWriteOperation,
  BatchResult,
} from './types';

export interface IStorageService {
  // Review operations
  getReview(repository: string, prNumber: number, sha: string): Promise<ReviewData | null>;
  saveReview(repository: string, prNumber: number, sha: string, data: ReviewData): Promise<void>;

  // Review status operations
  getReviewStatus(repository: string, prNumber: number): Promise<ReviewStatus | null>;
  saveReviewStatus(repository: string, prNumber: number, status: ReviewStatus): Promise<void>;
  updateReviewStatus(
    repository: string,
    prNumber: number,
    updates: Partial<ReviewStatus>
  ): Promise<void>;

  // Review history operations
  getReviewHistory(repository: string, prNumber: number): Promise<ReviewHistory | null>;
  appendReviewHistory(
    repository: string,
    prNumber: number,
    entry: ReviewHistory['reviews'][0]
  ): Promise<void>;

  // Rate limit operations
  getRateLimit(installationId: string): Promise<RateLimitData | null>;
  incrementRateLimit(installationId: string): Promise<{ allowed: boolean; remaining: number }>;

  // Config operations
  getConfig(owner: string, repo: string): Promise<RepositoryConfig | null>;
  saveConfig(owner: string, repo: string, config: RepositoryConfig): Promise<void>;
  deleteConfig(owner: string, repo: string): Promise<void>;

  // Deduplication operations
  isDuplicate(repository: string, prNumber: number, eventId: string): Promise<boolean>;
  markProcessed(repository: string, prNumber: number, eventId: string): Promise<void>;

  // Debug operations
  saveDebugData(type: 'error' | 'webhook' | 'api-call', data: any): Promise<void>;
  getDebugData(type: 'error' | 'webhook' | 'api-call'): Promise<DebugData | null>;

  // Metrics operations
  getMetrics(namespace: string): Promise<StorageMetrics | null>;
  incrementMetric(
    namespace: string,
    metric: keyof Omit<StorageMetrics, 'namespace' | 'lastUpdated'>
  ): Promise<void>;

  // Generic operations
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: any, options?: StorageOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: ListOptions): Promise<ListResult>;

  // Batch operations
  batchWrite(operations: BatchWriteOperation[]): Promise<BatchResult>;

  // Cleanup operations
  cleanupOldData(namespace: string, olderThan: number): Promise<number>;

  // Utility operations
  exists(key: string): Promise<boolean>;
  getWithMetadata<T>(
    key: string
  ): Promise<{ value: T | null; metadata: Record<string, string> | null }>;
}

export interface IStorageServiceFactory {
  create(env: Env): IStorageService;
}
