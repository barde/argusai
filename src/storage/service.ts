import { Env } from '../types/env';
import { Logger } from '../utils/logger';
import { StorageKeys, DEFAULT_TTLS } from './keys';
import {
  ReviewData,
  ReviewStatus,
  ReviewHistory,
  RateLimitData,
  RepositoryConfig,
  DeduplicationData,
  DebugData,
  StorageMetrics,
  StorageOptions,
  ListOptions,
  ListResult,
  BatchWriteOperation,
  BatchResult,
} from './types';
import { IStorageService } from './interface';

export class StorageService implements IStorageService {
  private readonly cache: KVNamespace;
  private readonly rateLimits: KVNamespace;
  private readonly config: KVNamespace;
  private readonly logger: Logger;

  constructor(env: Env) {
    this.cache = env.CACHE;
    this.rateLimits = env.RATE_LIMITS;
    this.config = env.CONFIG;
    this.logger = new Logger('StorageService');
  }

  // Review operations
  async getReview(repository: string, prNumber: number, sha: string): Promise<ReviewData | null> {
    const key = StorageKeys.review(repository, prNumber, sha);
    await this.incrementMetric('review', 'reads');
    return this.get<ReviewData>(key);
  }

  async saveReview(
    repository: string,
    prNumber: number,
    sha: string,
    data: ReviewData
  ): Promise<void> {
    const key = StorageKeys.review(repository, prNumber, sha);
    await this.incrementMetric('review', 'writes');
    await this.put(key, data, { ttl: DEFAULT_TTLS.review });
  }

  // Review status operations
  async getReviewStatus(repository: string, prNumber: number): Promise<ReviewStatus | null> {
    const key = StorageKeys.reviewStatus(repository, prNumber);
    await this.incrementMetric('status', 'reads');
    return this.get<ReviewStatus>(key);
  }

  async saveReviewStatus(
    repository: string,
    prNumber: number,
    status: ReviewStatus
  ): Promise<void> {
    const key = StorageKeys.reviewStatus(repository, prNumber);
    await this.incrementMetric('status', 'writes');
    await this.put(key, status, { ttl: DEFAULT_TTLS.reviewStatus });
  }

  async updateReviewStatus(
    repository: string,
    prNumber: number,
    updates: Partial<ReviewStatus>
  ): Promise<void> {
    const existing = await this.getReviewStatus(repository, prNumber);
    if (!existing) {
      throw new Error(`Review status not found for ${repository}#${prNumber}`);
    }

    const updated = { ...existing, ...updates };
    await this.saveReviewStatus(repository, prNumber, updated);
  }

  // Review history operations
  async getReviewHistory(repository: string, prNumber: number): Promise<ReviewHistory | null> {
    const key = StorageKeys.reviewHistory(repository, prNumber);
    await this.incrementMetric('history', 'reads');
    return this.get<ReviewHistory>(key);
  }

  async appendReviewHistory(
    repository: string,
    prNumber: number,
    entry: ReviewHistory['reviews'][0]
  ): Promise<void> {
    const key = StorageKeys.reviewHistory(repository, prNumber);
    const existing = await this.getReviewHistory(repository, prNumber);

    const history: ReviewHistory = existing || {
      repository,
      prNumber,
      reviews: [],
    };

    history.reviews.push(entry);

    // Keep only last 50 reviews
    if (history.reviews.length > 50) {
      history.reviews = history.reviews.slice(-50);
    }

    await this.incrementMetric('history', 'writes');
    await this.put(key, history, { ttl: DEFAULT_TTLS.reviewHistory });
  }

  // Rate limit operations
  async getRateLimit(installationId: string): Promise<RateLimitData | null> {
    const window = Math.floor(Date.now() / 60000); // 1-minute window
    const key = StorageKeys.rateLimit(installationId, window);
    return this.rateLimits.get<RateLimitData>(key, 'json');
  }

  async incrementRateLimit(
    installationId: string
  ): Promise<{ allowed: boolean; remaining: number }> {
    const window = Math.floor(Date.now() / 60000);
    const key = StorageKeys.rateLimit(installationId, window);

    try {
      const existing = await this.rateLimits.get<RateLimitData>(key, 'json');
      const limit = 60; // 60 requests per minute

      if (existing && existing.count >= limit) {
        return { allowed: false, remaining: 0 };
      }

      const data: RateLimitData = existing || {
        installationId,
        window,
        count: 0,
        resetAt: (window + 1) * 60000,
      };

      data.count++;

      await this.rateLimits.put(key, JSON.stringify(data), {
        expirationTtl: DEFAULT_TTLS.rateLimit,
      });

      return { allowed: true, remaining: limit - data.count };
    } catch (error) {
      this.logger.error('Rate limit increment failed', error);
      // On error, allow the request
      return { allowed: true, remaining: 1 };
    }
  }

  // Config operations
  async getConfig(owner: string, repo: string): Promise<RepositoryConfig | null> {
    const key = StorageKeys.config(owner, repo);
    await this.incrementMetric('config', 'reads');
    return this.config.get<RepositoryConfig>(key, 'json');
  }

  async saveConfig(owner: string, repo: string, config: RepositoryConfig): Promise<void> {
    const key = StorageKeys.config(owner, repo);
    const configWithTimestamp = { ...config, updatedAt: Date.now() };
    await this.incrementMetric('config', 'writes');
    await this.config.put(key, JSON.stringify(configWithTimestamp));
  }

  async deleteConfig(owner: string, repo: string): Promise<void> {
    const key = StorageKeys.config(owner, repo);
    await this.incrementMetric('config', 'deletes');
    await this.config.delete(key);
  }

  // Deduplication operations
  async isDuplicate(repository: string, prNumber: number, eventId: string): Promise<boolean> {
    const key = StorageKeys.deduplication(repository, prNumber, eventId);
    const existing = await this.get<DeduplicationData>(key);
    return existing !== null;
  }

  async markProcessed(repository: string, prNumber: number, eventId: string): Promise<void> {
    const key = StorageKeys.deduplication(repository, prNumber, eventId);
    const data: DeduplicationData = {
      eventId,
      processedAt: Date.now(),
    };
    await this.put(key, data, { ttl: DEFAULT_TTLS.deduplication });
  }

  // Debug operations
  async saveDebugData(type: 'error' | 'webhook' | 'api-call', data: any): Promise<void> {
    const key = StorageKeys.debug(`last-${type}` as any);
    const debugData: DebugData = {
      type,
      timestamp: Date.now(),
      data,
    };
    await this.put(key, debugData, { ttl: DEFAULT_TTLS.debug });
  }

  async getDebugData(type: 'error' | 'webhook' | 'api-call'): Promise<DebugData | null> {
    const key = StorageKeys.debug(`last-${type}` as any);
    return this.get<DebugData>(key);
  }

  // Metrics operations
  async getMetrics(namespace: string): Promise<StorageMetrics | null> {
    const key = StorageKeys.metrics(namespace);
    return this.get<StorageMetrics>(key);
  }

  async incrementMetric(
    namespace: string,
    metric: keyof Omit<StorageMetrics, 'namespace' | 'lastUpdated'>
  ): Promise<void> {
    const key = StorageKeys.metrics(namespace);

    try {
      const existing = await this.get<StorageMetrics>(key);
      const metrics: StorageMetrics = existing || {
        namespace,
        reads: 0,
        writes: 0,
        deletes: 0,
        errors: 0,
        lastUpdated: Date.now(),
      };

      // Increment the specific metric
      if (typeof metrics[metric] === 'number') {
        (metrics[metric] as number)++;
      }

      metrics.lastUpdated = Date.now();

      // Use cache namespace for metrics to avoid rate limits
      await this.cache.put(key, JSON.stringify(metrics), {
        expirationTtl: DEFAULT_TTLS.metrics,
      });
    } catch (error) {
      // Don't fail operations due to metrics errors
      this.logger.warn(`Failed to increment metric ${namespace}.${metric}`, error);
    }
  }

  // Generic operations
  async get<T>(key: string): Promise<T | null> {
    try {
      // Determine which namespace to use based on key prefix
      const namespace = this.getNamespaceForKey(key);
      return await namespace.get<T>(key, 'json');
    } catch (error) {
      this.logger.error(`Failed to get key: ${key}`, error);
      await this.incrementMetric(this.getNamespaceNameForKey(key), 'errors');
      return null;
    }
  }

  async put(key: string, value: any, options?: StorageOptions): Promise<void> {
    try {
      const namespace = this.getNamespaceForKey(key);
      const putOptions: KVNamespacePutOptions = {};

      if (options?.ttl) {
        putOptions.expirationTtl = options.ttl;
      }

      if (options?.metadata) {
        putOptions.metadata = options.metadata;
      }

      await namespace.put(key, JSON.stringify(value), putOptions);
    } catch (error) {
      this.logger.error(`Failed to put key: ${key}`, error);
      await this.incrementMetric(this.getNamespaceNameForKey(key), 'errors');
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const namespace = this.getNamespaceForKey(key);
      await namespace.delete(key);
    } catch (error) {
      this.logger.error(`Failed to delete key: ${key}`, error);
      await this.incrementMetric(this.getNamespaceNameForKey(key), 'errors');
      throw error;
    }
  }

  async list(options: ListOptions): Promise<ListResult> {
    try {
      const namespace = this.getNamespaceForKey(options.prefix);
      const listOptions: KVNamespaceListOptions = {
        prefix: options.prefix,
      };

      if (options.limit) {
        listOptions.limit = options.limit;
      }

      if (options.cursor) {
        listOptions.cursor = options.cursor;
      }

      const result = await namespace.list(listOptions);

      return {
        keys: result.keys.map((key) => ({
          name: key.name,
          metadata: key.metadata as Record<string, string> | undefined,
        })),
        list_complete: result.list_complete,
        cursor: (result as any).cursor,
      };
    } catch (error) {
      this.logger.error(`Failed to list keys with prefix: ${options.prefix}`, error);
      throw error;
    }
  }

  // Batch operations
  async batchWrite(operations: BatchWriteOperation[]): Promise<BatchResult> {
    const result: BatchResult = {
      successful: [],
      failed: [],
    };

    // Process operations with rate limiting (1 write per second for free tier)
    for (const operation of operations) {
      try {
        await this.put(operation.key, operation.value, operation.options);
        result.successful.push(operation.key);

        // Rate limit: wait 1 second between writes
        if (operations.indexOf(operation) < operations.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        result.failed.push({
          key: operation.key,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  // Cleanup operations
  async cleanupOldData(namespace: string, olderThan: number): Promise<number> {
    let deleted = 0;
    let cursor: string | undefined;

    do {
      const result = await this.list({
        prefix: namespace + ':',
        limit: 100,
        cursor,
      });

      for (const key of result.keys) {
        try {
          const data = await this.getWithMetadata(key.name);
          if (data.metadata?.timestamp) {
            const timestamp = parseInt(data.metadata.timestamp);
            if (timestamp < olderThan) {
              await this.delete(key.name);
              deleted++;

              // Rate limit cleanup
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to cleanup key: ${key.name}`, error);
        }
      }

      cursor = result.cursor;
    } while (cursor);

    return deleted;
  }

  // Utility operations
  async exists(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  async getWithMetadata<T>(
    key: string
  ): Promise<{ value: T | null; metadata: Record<string, string> | null }> {
    try {
      const namespace = this.getNamespaceForKey(key);
      const result = await namespace.getWithMetadata<T>(key, 'json');

      return {
        value: result.value,
        metadata: (result.metadata as Record<string, string>) || null,
      };
    } catch (error) {
      this.logger.error(`Failed to get key with metadata: ${key}`, error);
      return { value: null, metadata: null };
    }
  }

  // Helper methods
  private getNamespaceForKey(key: string): KVNamespace {
    if (key.startsWith('rate:')) {
      return this.rateLimits;
    } else if (key.startsWith('config:')) {
      return this.config;
    } else {
      return this.cache;
    }
  }

  private getNamespaceNameForKey(key: string): string {
    if (key.startsWith('rate:')) {
      return 'rate';
    } else if (key.startsWith('config:')) {
      return 'config';
    } else {
      const parsed = StorageKeys.parseKey(key);
      return parsed?.namespace || 'unknown';
    }
  }
}
