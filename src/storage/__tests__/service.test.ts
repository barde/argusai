import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageService } from '../service';
import { StorageKeys } from '../keys';
import type { Env } from '../../types/env';
import type { ReviewData, ReviewStatus, RepositoryConfig, BatchWriteOperation } from '../types';

// Mock KV namespace
class MockKVNamespace {
  private store = new Map<string, { value: string; metadata?: any }>();

  async get(key: string, type?: string): Promise<any> {
    const item = this.store.get(key);
    if (!item) return null;

    if (type === 'json') {
      return JSON.parse(item.value);
    }
    return item.value;
  }

  async getWithMetadata(key: string, type?: string): Promise<any> {
    const item = this.store.get(key);
    if (!item) return { value: null, metadata: null };

    const value = type === 'json' ? JSON.parse(item.value) : item.value;
    return { value, metadata: item.metadata || null };
  }

  async put(key: string, value: string, options?: any): Promise<void> {
    this.store.set(key, { value, metadata: options?.metadata });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: any): Promise<any> {
    const keys = Array.from(this.store.keys())
      .filter((key) => !options?.prefix || key.startsWith(options.prefix))
      .slice(0, options?.limit || 1000);

    return {
      keys: keys.map((name) => ({ name })),
      list_complete: true,
    };
  }

  clear() {
    this.store.clear();
  }
}

describe('StorageService', () => {
  let service: StorageService;
  let mockCache: MockKVNamespace;
  let mockRateLimits: MockKVNamespace;
  let mockConfig: MockKVNamespace;
  let env: Env;

  beforeEach(() => {
    mockCache = new MockKVNamespace();
    mockRateLimits = new MockKVNamespace();
    mockConfig = new MockKVNamespace();

    env = {
      CACHE: mockCache as any,
      RATE_LIMITS: mockRateLimits as any,
      CONFIG: mockConfig as any,
    } as Env;

    service = new StorageService(env);
  });

  afterEach(() => {
    mockCache.clear();
    mockRateLimits.clear();
    mockConfig.clear();
  });

  describe('Review operations', () => {
    const testReview: ReviewData = {
      repository: 'owner/repo',
      prNumber: 123,
      sha: 'a'.repeat(40),
      result: {
        summary: 'Test review',
        files: [
          {
            path: 'test.js',
            review: 'Good',
            severity: 'info',
          },
        ],
      },
      metadata: {
        model: 'gpt-4o',
        timestamp: Date.now(),
        processingTime: 1000,
      },
    };

    it('should save and retrieve review data', async () => {
      await service.saveReview('owner/repo', 123, 'a'.repeat(40), testReview);

      const retrieved = await service.getReview('owner/repo', 123, 'a'.repeat(40));
      expect(retrieved).toEqual(testReview);
    });

    it('should return null for non-existent review', async () => {
      const result = await service.getReview('owner/repo', 999, 'b'.repeat(40));
      expect(result).toBeNull();
    });

    it('should use correct key format', async () => {
      const spy = vi.spyOn(mockCache, 'put');
      await service.saveReview('owner/repo', 123, 'abc123', testReview);

      expect(spy).toHaveBeenCalledWith(
        'review:owner/repo:123:abc123',
        JSON.stringify(testReview),
        expect.any(Object)
      );
    });
  });

  describe('Review status operations', () => {
    const testStatus: ReviewStatus = {
      repository: 'owner/repo',
      prNumber: 123,
      status: 'processing',
      startedAt: Date.now(),
    };

    it('should save and retrieve review status', async () => {
      await service.saveReviewStatus('owner/repo', 123, testStatus);

      const retrieved = await service.getReviewStatus('owner/repo', 123);
      expect(retrieved).toEqual(testStatus);
    });

    it('should update existing status', async () => {
      await service.saveReviewStatus('owner/repo', 123, testStatus);

      await service.updateReviewStatus('owner/repo', 123, {
        status: 'completed',
        completedAt: Date.now(),
      });

      const updated = await service.getReviewStatus('owner/repo', 123);
      expect(updated?.status).toBe('completed');
      expect(updated?.completedAt).toBeDefined();
      expect(updated?.startedAt).toBe(testStatus.startedAt);
    });

    it('should throw error when updating non-existent status', async () => {
      await expect(
        service.updateReviewStatus('owner/repo', 999, { status: 'completed' })
      ).rejects.toThrow('Review status not found');
    });
  });

  describe('Rate limit operations', () => {
    it('should allow requests within limit', async () => {
      const result = await service.incrementRateLimit('12345');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59); // 60 - 1
    });

    it('should track rate limit count', async () => {
      // Increment 5 times
      for (let i = 0; i < 5; i++) {
        await service.incrementRateLimit('12345');
      }

      const result = await service.incrementRateLimit('12345');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(54); // 60 - 6
    });

    it('should block requests over limit', async () => {
      // Mock reaching the limit
      const window = Math.floor(Date.now() / 60000);
      const key = StorageKeys.rateLimit('12345', window);
      await mockRateLimits.put(
        key,
        JSON.stringify({
          installationId: '12345',
          window,
          count: 60,
          resetAt: (window + 1) * 60000,
        })
      );

      const result = await service.incrementRateLimit('12345');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should use rate limits namespace', async () => {
      const spy = vi.spyOn(mockRateLimits, 'get');
      await service.incrementRateLimit('12345');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Config operations', () => {
    const testConfig: RepositoryConfig = {
      enabled: true,
      model: 'gpt-4o',
      reviewDrafts: false,
      autoApprove: false,
      maxFilesPerReview: 50,
      ignorePaths: ['node_modules'],
      focusPaths: ['src'],
      language: 'en',
    };

    it('should save and retrieve config', async () => {
      await service.saveConfig('owner', 'repo', testConfig);

      const retrieved = await service.getConfig('owner', 'repo');
      expect(retrieved).toMatchObject(testConfig);
      expect(retrieved?.updatedAt).toBeDefined();
    });

    it('should delete config', async () => {
      await service.saveConfig('owner', 'repo', testConfig);
      await service.deleteConfig('owner', 'repo');

      const result = await service.getConfig('owner', 'repo');
      expect(result).toBeNull();
    });

    it('should use config namespace', async () => {
      const spy = vi.spyOn(mockConfig, 'put');
      await service.saveConfig('owner', 'repo', testConfig);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Deduplication operations', () => {
    it('should detect duplicate events', async () => {
      await service.markProcessed('owner/repo', 123, 'event-123');

      const isDuplicate = await service.isDuplicate('owner/repo', 123, 'event-123');
      expect(isDuplicate).toBe(true);
    });

    it('should return false for new events', async () => {
      const isDuplicate = await service.isDuplicate('owner/repo', 123, 'new-event');
      expect(isDuplicate).toBe(false);
    });
  });

  describe('Generic operations', () => {
    it('should handle exists check', async () => {
      await service.put('test:key', { data: 'value' });

      expect(await service.exists('test:key')).toBe(true);
      expect(await service.exists('test:missing')).toBe(false);
    });

    it('should list keys with prefix', async () => {
      await service.put('test:1', { data: '1' });
      await service.put('test:2', { data: '2' });
      await service.put('other:1', { data: '3' });

      const result = await service.list({ prefix: 'test:' });
      expect(result.keys).toHaveLength(2);
      expect(result.keys.map((k: any) => k.name)).toContain('test:1');
      expect(result.keys.map((k: any) => k.name)).toContain('test:2');
    });
  });

  describe('Batch operations', () => {
    it('should process batch writes with rate limiting', async () => {
      const operations: BatchWriteOperation[] = [
        { key: 'test:1', value: { data: 1 } as any },
        { key: 'test:2', value: { data: 2 } as any },
        { key: 'test:3', value: { data: 3 } as any },
      ];

      const start = Date.now();
      const result = await service.batchWrite(operations);
      const duration = Date.now() - start;

      expect(result.successful).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
      // Should take at least 2 seconds due to rate limiting
      expect(duration).toBeGreaterThanOrEqual(2000);
    });
  });

  describe('Namespace routing', () => {
    it('should route rate limit keys to rate limits namespace', async () => {
      const spy = vi.spyOn(mockRateLimits, 'put');
      await service.put('rate:test:123', { count: 1 });
      expect(spy).toHaveBeenCalled();
    });

    it('should route config keys to config namespace', async () => {
      const spy = vi.spyOn(mockConfig, 'put');
      await service.put('config:owner/repo', { enabled: true });
      expect(spy).toHaveBeenCalled();
    });

    it('should route other keys to cache namespace', async () => {
      const spy = vi.spyOn(mockCache, 'put');
      await service.put('review:test', { data: 'review' });
      expect(spy).toHaveBeenCalled();
    });
  });
});
