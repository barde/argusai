import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageCleanup, DEFAULT_CLEANUP_CONFIG } from '../cleanup';
import type { Env } from '../../types/env';
import type { ScheduledEvent } from '@cloudflare/workers-types';

// Mock the storage service
vi.mock('../factory', () => ({
  StorageServiceFactory: class {
    create() {
      return {
        cleanupOldData: vi.fn().mockImplementation((namespace) => {
          // Return different counts for different namespaces
          const counts: Record<string, number> = {
            review: 10,
            status: 5,
            history: 3,
            debug: 8,
            metrics: 2,
          };
          return Promise.resolve(counts[namespace] || 0);
        }),
        incrementMetric: vi.fn().mockResolvedValue(undefined),
        saveDebugData: vi.fn().mockResolvedValue(undefined),
      };
    }
  },
}));

describe('StorageCleanup', () => {
  let cleanup: StorageCleanup;
  let env: Env;

  beforeEach(() => {
    env = {
      CACHE: {} as any,
      RATE_LIMITS: {} as any,
      CONFIG: {} as any,
    } as Env;

    cleanup = new StorageCleanup(env);
  });

  describe('cleanup method', () => {
    it('should cleanup all namespaces with default config', async () => {
      const result = await cleanup.cleanup();

      expect(result.totalDeleted).toBe(28); // 10 + 5 + 3 + 8 + 2
      expect(result.byNamespace).toEqual({
        review: 10,
        status: 5,
        history: 3,
        debug: 8,
        metrics: 2,
      });
      expect(result.errors).toHaveLength(0);
    });

    it('should use custom retention config', async () => {
      const customConfig = {
        reviewRetentionDays: 14,
        statusRetentionDays: 2,
        historyRetentionDays: 60,
        debugRetentionHours: 2,
        metricsRetentionDays: 7,
      };

      const result = await cleanup.cleanup(customConfig);

      expect(result.totalDeleted).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle cleanup errors gracefully', async () => {
      // Mock storage service to throw error
      const errorCleanup = new StorageCleanup(env);
      // @ts-ignore - accessing private property for testing
      errorCleanup.storage.cleanupOldData = vi.fn().mockRejectedValue(new Error('Cleanup failed'));

      const result = await errorCleanup.cleanup();

      // The cleanupNamespace method catches errors and returns 0
      // So the total should be 0 and no errors should propagate to the top level
      expect(result.totalDeleted).toBe(0);
      expect(result.errors).toHaveLength(0);
      // All namespaces should have 0 deleted due to errors
      expect(result.byNamespace.review).toBe(0);
      expect(result.byNamespace.status).toBe(0);
    });
  });

  describe('handleScheduledCleanup', () => {
    it('should handle scheduled event', async () => {
      const event = {
        scheduledTime: new Date().toISOString(),
        cron: '0 0 * * *',
      } as unknown as ScheduledEvent;

      await cleanup.handleScheduledCleanup(event);

      // Verify metrics and debug data were saved
      // @ts-ignore - accessing private property for testing
      expect(cleanup.storage.incrementMetric).toHaveBeenCalledWith('cleanup', 'writes');
      // @ts-ignore - accessing private property for testing
      expect(cleanup.storage.saveDebugData).toHaveBeenCalledWith(
        'api-call',
        expect.objectContaining({
          type: 'scheduled_cleanup',
          results: expect.any(Object),
          timestamp: expect.any(Number),
        })
      );
    });
  });

  describe('default cleanup config', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_CLEANUP_CONFIG).toEqual({
        reviewRetentionDays: 7,
        statusRetentionDays: 1,
        historyRetentionDays: 30,
        debugRetentionHours: 1,
        metricsRetentionDays: 1,
      });
    });
  });
});
