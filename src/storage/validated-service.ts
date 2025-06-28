import { Env } from '../types/env';
import {
  ReviewData,
  ReviewStatus,
  ReviewHistory,
  RateLimitData,
  RepositoryConfig,
  DeduplicationData,
  DebugData,
  StorageMetrics,
} from './types';
import { IStorageService } from './interface';
import { StorageService } from './service';
import {
  ReviewDataSchema,
  ReviewStatusSchema,
  ReviewHistorySchema,
  RateLimitDataSchema,
  RepositoryConfigSchema,
  DeduplicationDataSchema,
  DebugDataSchema,
  StorageMetricsSchema,
  StorageKeySchema,
  validateData,
} from './validation';

export class ValidatedStorageService implements IStorageService {
  private readonly baseService: StorageService;

  constructor(env: Env) {
    this.baseService = new StorageService(env);
  }

  // Review operations with validation
  async getReview(repository: string, prNumber: number, sha: string): Promise<ReviewData | null> {
    const data = await this.baseService.getReview(repository, prNumber, sha);
    if (data) {
      return validateData(data, ReviewDataSchema, 'review data');
    }
    return null;
  }

  async saveReview(
    repository: string,
    prNumber: number,
    sha: string,
    data: ReviewData
  ): Promise<void> {
    const validatedData = validateData(data, ReviewDataSchema, 'review data');
    await this.baseService.saveReview(repository, prNumber, sha, validatedData);
  }

  // Review status operations with validation
  async getReviewStatus(repository: string, prNumber: number): Promise<ReviewStatus | null> {
    const data = await this.baseService.getReviewStatus(repository, prNumber);
    if (data) {
      return validateData(data, ReviewStatusSchema, 'review status');
    }
    return null;
  }

  async saveReviewStatus(
    repository: string,
    prNumber: number,
    status: ReviewStatus
  ): Promise<void> {
    const validatedStatus = validateData(status, ReviewStatusSchema, 'review status');
    await this.baseService.saveReviewStatus(repository, prNumber, validatedStatus);
  }

  async updateReviewStatus(
    repository: string,
    prNumber: number,
    updates: Partial<ReviewStatus>
  ): Promise<void> {
    // Get existing status first
    const existing = await this.getReviewStatus(repository, prNumber);
    if (!existing) {
      throw new Error(`Review status not found for ${repository}#${prNumber}`);
    }

    // Merge and validate
    const merged = { ...existing, ...updates };
    const validatedStatus = validateData(merged, ReviewStatusSchema, 'review status');

    await this.baseService.saveReviewStatus(repository, prNumber, validatedStatus);
  }

  // Review history operations with validation
  async getReviewHistory(repository: string, prNumber: number): Promise<ReviewHistory | null> {
    const data = await this.baseService.getReviewHistory(repository, prNumber);
    if (data) {
      return validateData(data, ReviewHistorySchema, 'review history');
    }
    return null;
  }

  async appendReviewHistory(
    repository: string,
    prNumber: number,
    entry: ReviewHistory['reviews'][0]
  ): Promise<void> {
    // Validate the entry
    const entrySchema = ReviewHistorySchema.shape.reviews.element;
    const validatedEntry = validateData(entry, entrySchema, 'review history entry');

    await this.baseService.appendReviewHistory(repository, prNumber, validatedEntry);
  }

  // Rate limit operations with validation
  async getRateLimit(installationId: string): Promise<RateLimitData | null> {
    const data = await this.baseService.getRateLimit(installationId);
    if (data) {
      return validateData(data, RateLimitDataSchema, 'rate limit data');
    }
    return null;
  }

  async incrementRateLimit(
    installationId: string
  ): Promise<{ allowed: boolean; remaining: number }> {
    return await this.baseService.incrementRateLimit(installationId);
  }

  // Config operations with validation
  async getConfig(owner: string, repo: string): Promise<RepositoryConfig | null> {
    const data = await this.baseService.getConfig(owner, repo);
    if (data) {
      return validateData(data, RepositoryConfigSchema, 'repository config');
    }
    return null;
  }

  async saveConfig(owner: string, repo: string, config: RepositoryConfig): Promise<void> {
    const validatedConfig = validateData(config, RepositoryConfigSchema, 'repository config');
    await this.baseService.saveConfig(owner, repo, validatedConfig);
  }

  async deleteConfig(owner: string, repo: string): Promise<void> {
    await this.baseService.deleteConfig(owner, repo);
  }

  // Deduplication operations with validation
  async isDuplicate(repository: string, prNumber: number, eventId: string): Promise<boolean> {
    return await this.baseService.isDuplicate(repository, prNumber, eventId);
  }

  async markProcessed(repository: string, prNumber: number, eventId: string): Promise<void> {
    const data: DeduplicationData = {
      eventId,
      processedAt: Date.now(),
    };
    validateData(data, DeduplicationDataSchema, 'deduplication data');
    await this.baseService.markProcessed(repository, prNumber, eventId);
  }

  // Debug operations with validation
  async saveDebugData(type: 'error' | 'webhook' | 'api-call', data: any): Promise<void> {
    const debugData: DebugData = {
      type,
      timestamp: Date.now(),
      data,
    };
    validateData(debugData, DebugDataSchema, 'debug data');
    await this.baseService.saveDebugData(type, data);
  }

  async getDebugData(type: 'error' | 'webhook' | 'api-call'): Promise<DebugData | null> {
    const data = await this.baseService.getDebugData(type);
    if (data) {
      return validateData(data, DebugDataSchema, 'debug data') as DebugData;
    }
    return null;
  }

  // Metrics operations with validation
  async getMetrics(namespace: string): Promise<StorageMetrics | null> {
    const data = await this.baseService.getMetrics(namespace);
    if (data) {
      return validateData(data, StorageMetricsSchema, 'storage metrics');
    }
    return null;
  }

  async incrementMetric(
    namespace: string,
    metric: keyof Omit<StorageMetrics, 'namespace' | 'lastUpdated'>
  ): Promise<void> {
    await this.baseService.incrementMetric(namespace, metric);
  }

  // Generic operations with key validation
  async get<T>(key: string): Promise<T | null> {
    validateData(key, StorageKeySchema, 'storage key');
    return await this.baseService.get<T>(key);
  }

  async put(key: string, value: any, options?: any): Promise<void> {
    validateData(key, StorageKeySchema, 'storage key');
    await this.baseService.put(key, value, options);
  }

  async delete(key: string): Promise<void> {
    validateData(key, StorageKeySchema, 'storage key');
    await this.baseService.delete(key);
  }

  async list(options: any): Promise<any> {
    return await this.baseService.list(options);
  }

  // Batch operations
  async batchWrite(operations: any[]): Promise<any> {
    // Validate all keys
    for (const op of operations) {
      validateData(op.key, StorageKeySchema, 'storage key');
    }
    return await this.baseService.batchWrite(operations);
  }

  // Cleanup operations
  async cleanupOldData(namespace: string, olderThan: number): Promise<number> {
    return await this.baseService.cleanupOldData(namespace, olderThan);
  }

  // Utility operations
  async exists(key: string): Promise<boolean> {
    validateData(key, StorageKeySchema, 'storage key');
    return await this.baseService.exists(key);
  }

  async getWithMetadata<T>(
    key: string
  ): Promise<{ value: T | null; metadata: Record<string, string> | null }> {
    validateData(key, StorageKeySchema, 'storage key');
    return await this.baseService.getWithMetadata<T>(key);
  }
}
