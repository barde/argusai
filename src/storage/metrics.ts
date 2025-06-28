import { Env } from '../types/env';
import { StorageServiceFactory } from './factory';
import { IStorageService } from './interface';
import { StorageMetrics } from './types';

export interface StorageMetricsSummary {
  totalReads: number;
  totalWrites: number;
  totalDeletes: number;
  totalErrors: number;
  byNamespace: Record<string, StorageMetrics>;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  errorRate: number;
  lastUpdated: number;
}

export class StorageMetricsCollector {
  private readonly storage: IStorageService;

  constructor(env: Env) {
    const factory = new StorageServiceFactory();
    this.storage = factory.create(env);
  }

  async getSummary(): Promise<StorageMetricsSummary> {
    const namespaces = [
      'review',
      'status',
      'history',
      'rate',
      'config',
      'dedup',
      'debug',
      'cleanup',
    ];
    const summary: StorageMetricsSummary = {
      totalReads: 0,
      totalWrites: 0,
      totalDeletes: 0,
      totalErrors: 0,
      byNamespace: {},
      healthStatus: 'healthy',
      errorRate: 0,
      lastUpdated: Date.now(),
    };

    // Collect metrics from all namespaces
    for (const namespace of namespaces) {
      const metrics = await this.storage.getMetrics(namespace);
      if (metrics) {
        summary.byNamespace[namespace] = metrics;
        summary.totalReads += metrics.reads;
        summary.totalWrites += metrics.writes;
        summary.totalDeletes += metrics.deletes;
        summary.totalErrors += metrics.errors;
      }
    }

    // Calculate error rate
    const totalOperations = summary.totalReads + summary.totalWrites + summary.totalDeletes;
    if (totalOperations > 0) {
      summary.errorRate = summary.totalErrors / totalOperations;
    }

    // Determine health status
    if (summary.errorRate > 0.1) {
      summary.healthStatus = 'unhealthy';
    } else if (summary.errorRate > 0.05) {
      summary.healthStatus = 'degraded';
    }

    return summary;
  }

  async getNamespaceMetrics(namespace: string): Promise<StorageMetrics | null> {
    return await this.storage.getMetrics(namespace);
  }

  async resetMetrics(namespace?: string): Promise<void> {
    if (namespace) {
      // Reset specific namespace
      const key = `metrics:${namespace}`;
      await this.storage.delete(key);
    } else {
      // Reset all namespaces
      const namespaces = [
        'review',
        'status',
        'history',
        'rate',
        'config',
        'dedup',
        'debug',
        'cleanup',
      ];
      for (const ns of namespaces) {
        const key = `metrics:${ns}`;
        await this.storage.delete(key);
      }
    }
  }

  // Export metrics in Prometheus format for monitoring
  async exportPrometheusMetrics(): Promise<string> {
    const summary = await this.getSummary();
    const lines: string[] = [];

    // Add header
    lines.push('# HELP argusai_storage_operations_total Total number of storage operations');
    lines.push('# TYPE argusai_storage_operations_total counter');

    // Add metrics for each namespace
    for (const [namespace, metrics] of Object.entries(summary.byNamespace)) {
      lines.push(
        `argusai_storage_operations_total{namespace="${namespace}",operation="read"} ${metrics.reads}`
      );
      lines.push(
        `argusai_storage_operations_total{namespace="${namespace}",operation="write"} ${metrics.writes}`
      );
      lines.push(
        `argusai_storage_operations_total{namespace="${namespace}",operation="delete"} ${metrics.deletes}`
      );
      lines.push(
        `argusai_storage_operations_total{namespace="${namespace}",operation="error"} ${metrics.errors}`
      );
    }

    // Add summary metrics
    lines.push('');
    lines.push('# HELP argusai_storage_error_rate Current error rate for storage operations');
    lines.push('# TYPE argusai_storage_error_rate gauge');
    lines.push(`argusai_storage_error_rate ${summary.errorRate.toFixed(4)}`);

    lines.push('');
    lines.push(
      '# HELP argusai_storage_health_status Health status of storage system (1=healthy, 0.5=degraded, 0=unhealthy)'
    );
    lines.push('# TYPE argusai_storage_health_status gauge');
    const healthValue =
      summary.healthStatus === 'healthy' ? 1 : summary.healthStatus === 'degraded' ? 0.5 : 0;
    lines.push(`argusai_storage_health_status ${healthValue}`);

    return lines.join('\n');
  }

  // Helper to track slow operations
  async trackOperation<T>(
    namespace: string,
    operation: 'read' | 'write' | 'delete',
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await fn();

      // Track slow operations (> 100ms)
      const duration = Date.now() - startTime;
      if (duration > 100) {
        await this.storage.saveDebugData('api-call', {
          type: 'slow_storage_operation',
          namespace,
          operation,
          duration,
          timestamp: Date.now(),
        });
      }

      return result;
    } catch (error) {
      // Increment error counter
      await this.storage.incrementMetric(namespace, 'errors');
      throw error;
    }
  }
}

// HTTP endpoint handler for metrics
export async function handleMetricsRequest(request: Request, env: Env): Promise<Response> {
  const collector = new StorageMetricsCollector(env);
  const url = new URL(request.url);

  if (url.pathname === '/metrics/prometheus') {
    const metrics = await collector.exportPrometheusMetrics();
    return new Response(metrics, {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4',
      },
    });
  }

  if (url.pathname === '/metrics/json') {
    const summary = await collector.getSummary();
    return new Response(JSON.stringify(summary, null, 2), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  return new Response('Not Found', { status: 404 });
}
