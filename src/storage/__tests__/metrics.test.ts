import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageMetricsCollector } from '../metrics';
import type { Env } from '../../types/env';
import type { StorageMetrics } from '../types';

// Mock the storage service
vi.mock('../factory', () => ({
  StorageServiceFactory: class {
    create() {
      const metricsData: Record<string, StorageMetrics> = {
        review: {
          namespace: 'review',
          reads: 100,
          writes: 50,
          deletes: 10,
          errors: 2,
          lastUpdated: Date.now(),
        },
        status: {
          namespace: 'status',
          reads: 200,
          writes: 100,
          deletes: 20,
          errors: 5,
          lastError: 'Connection timeout',
          lastUpdated: Date.now(),
        },
      };

      return {
        getMetrics: vi.fn().mockImplementation((namespace) => {
          return Promise.resolve(metricsData[namespace] || null);
        }),
        delete: vi.fn().mockResolvedValue(undefined),
        saveDebugData: vi.fn().mockResolvedValue(undefined),
        incrementMetric: vi.fn().mockResolvedValue(undefined),
      };
    }
  },
}));

describe('StorageMetricsCollector', () => {
  let collector: StorageMetricsCollector;
  let env: Env;

  beforeEach(() => {
    env = {
      CACHE: {} as any,
      RATE_LIMITS: {} as any,
      CONFIG: {} as any,
    } as Env;

    collector = new StorageMetricsCollector(env);
  });

  describe('getSummary', () => {
    it('should aggregate metrics from all namespaces', async () => {
      const summary = await collector.getSummary();

      expect(summary.totalReads).toBe(300); // 100 + 200
      expect(summary.totalWrites).toBe(150); // 50 + 100
      expect(summary.totalDeletes).toBe(30); // 10 + 20
      expect(summary.totalErrors).toBe(7); // 2 + 5
      expect(summary.healthStatus).toBe('healthy');
      expect(summary.errorRate).toBeCloseTo(0.0146, 3); // 7 / (300 + 150 + 30)
    });

    it('should calculate health status based on error rate', async () => {
      // Mock high error rate
      const errorCollector = new StorageMetricsCollector(env);
      // @ts-ignore - accessing private property for testing
      errorCollector.storage.getMetrics = vi.fn().mockResolvedValue({
        namespace: 'test',
        reads: 100,
        writes: 10,
        deletes: 0,
        errors: 20, // High error count
        lastUpdated: Date.now(),
      });

      const summary = await errorCollector.getSummary();
      expect(summary.errorRate).toBeCloseTo(0.1818, 3); // 20 / 110
      expect(summary.healthStatus).toBe('unhealthy');
    });

    it('should handle missing namespace metrics', async () => {
      const summary = await collector.getSummary();

      // Should only have metrics for namespaces that returned data
      expect(Object.keys(summary.byNamespace)).toHaveLength(2);
      expect(summary.byNamespace.review).toBeDefined();
      expect(summary.byNamespace.status).toBeDefined();
    });
  });

  describe('getNamespaceMetrics', () => {
    it('should return metrics for specific namespace', async () => {
      const metrics = await collector.getNamespaceMetrics('review');

      expect(metrics).toEqual({
        namespace: 'review',
        reads: 100,
        writes: 50,
        deletes: 10,
        errors: 2,
        lastUpdated: expect.any(Number),
      });
    });

    it('should return null for non-existent namespace', async () => {
      const metrics = await collector.getNamespaceMetrics('unknown');
      expect(metrics).toBeNull();
    });
  });

  describe('resetMetrics', () => {
    it('should reset specific namespace metrics', async () => {
      await collector.resetMetrics('review');

      // @ts-ignore - accessing private property for testing
      expect((collector as any).storage.delete).toHaveBeenCalledWith('metrics:review');
      // @ts-ignore - accessing private property for testing
      expect((collector as any).storage.delete).toHaveBeenCalledTimes(1);
    });

    it('should reset all namespace metrics when no namespace specified', async () => {
      await collector.resetMetrics();

      // @ts-ignore - accessing private property for testing
      const deleteCalls = collector.storage.delete.mock.calls;
      expect(deleteCalls.length).toBeGreaterThan(5);
      expect(deleteCalls.some((call: any[]) => call[0] === 'metrics:review')).toBe(true);
      expect(deleteCalls.some((call: any[]) => call[0] === 'metrics:status')).toBe(true);
    });
  });

  describe('exportPrometheusMetrics', () => {
    it('should export metrics in Prometheus format', async () => {
      const metrics = await collector.exportPrometheusMetrics();

      // Check for required metric lines
      expect(metrics).toContain('# HELP argusai_storage_operations_total');
      expect(metrics).toContain('# TYPE argusai_storage_operations_total counter');
      expect(metrics).toContain(
        'argusai_storage_operations_total{namespace="review",operation="read"} 100'
      );
      expect(metrics).toContain(
        'argusai_storage_operations_total{namespace="status",operation="write"} 100'
      );

      // Check for error rate metric
      expect(metrics).toContain('# HELP argusai_storage_error_rate');
      expect(metrics).toContain('# TYPE argusai_storage_error_rate gauge');
      expect(metrics).toMatch(/argusai_storage_error_rate 0\.0\d+/);

      // Check for health status metric
      expect(metrics).toContain('# HELP argusai_storage_health_status');
      expect(metrics).toContain('# TYPE argusai_storage_health_status gauge');
      expect(metrics).toContain('argusai_storage_health_status 1');
    });
  });

  describe('trackOperation', () => {
    it('should track successful operations', async () => {
      const result = await collector.trackOperation('review', 'read', async () => {
        return 'test-result';
      });

      expect(result).toBe('test-result');
    });

    it('should track slow operations', async () => {
      const slowOperation = async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return 'slow-result';
      };

      const result = await collector.trackOperation('review', 'read', slowOperation);

      expect(result).toBe('slow-result');
      // @ts-ignore - accessing private property for testing
      expect(collector.storage.saveDebugData).toHaveBeenCalledWith(
        'api-call',
        expect.objectContaining({
          type: 'slow_storage_operation',
          namespace: 'review',
          operation: 'read',
          duration: expect.any(Number),
        })
      );
    });

    it('should track operation errors', async () => {
      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      await expect(collector.trackOperation('review', 'write', failingOperation)).rejects.toThrow(
        'Operation failed'
      );

      // @ts-ignore - accessing private property for testing
      expect(collector.storage.incrementMetric).toHaveBeenCalledWith('review', 'errors');
    });
  });
});
