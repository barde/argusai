import { Env } from '../types/env';
import { Logger } from '../utils/logger';
import { StorageServiceFactory } from './factory';
import { IStorageService } from './interface';
import type { ScheduledEvent } from '@cloudflare/workers-types';

export interface CleanupConfig {
  reviewRetentionDays: number;
  statusRetentionDays: number;
  historyRetentionDays: number;
  debugRetentionHours: number;
  metricsRetentionDays: number;
}

export const DEFAULT_CLEANUP_CONFIG: CleanupConfig = {
  reviewRetentionDays: 7,
  statusRetentionDays: 1,
  historyRetentionDays: 30,
  debugRetentionHours: 1,
  metricsRetentionDays: 1,
};

export class StorageCleanup {
  private readonly storage: IStorageService;
  private readonly logger: Logger;

  constructor(env: Env) {
    const factory = new StorageServiceFactory();
    this.storage = factory.create(env);
    this.logger = new Logger('StorageCleanup');
  }

  async cleanup(config: CleanupConfig = DEFAULT_CLEANUP_CONFIG): Promise<{
    totalDeleted: number;
    byNamespace: Record<string, number>;
    errors: string[];
  }> {
    const results = {
      totalDeleted: 0,
      byNamespace: {} as Record<string, number>,
      errors: [] as string[],
    };

    try {
      // Cleanup reviews older than retention period
      const reviewCutoff = Date.now() - config.reviewRetentionDays * 24 * 60 * 60 * 1000;
      const reviewsDeleted = await this.cleanupNamespace('review', reviewCutoff);
      results.byNamespace.review = reviewsDeleted;
      results.totalDeleted += reviewsDeleted;

      // Cleanup status older than retention period
      const statusCutoff = Date.now() - config.statusRetentionDays * 24 * 60 * 60 * 1000;
      const statusDeleted = await this.cleanupNamespace('status', statusCutoff);
      results.byNamespace.status = statusDeleted;
      results.totalDeleted += statusDeleted;

      // Cleanup history older than retention period
      const historyCutoff = Date.now() - config.historyRetentionDays * 24 * 60 * 60 * 1000;
      const historyDeleted = await this.cleanupNamespace('history', historyCutoff);
      results.byNamespace.history = historyDeleted;
      results.totalDeleted += historyDeleted;

      // Cleanup debug data older than retention period
      const debugCutoff = Date.now() - config.debugRetentionHours * 60 * 60 * 1000;
      const debugDeleted = await this.cleanupNamespace('debug', debugCutoff);
      results.byNamespace.debug = debugDeleted;
      results.totalDeleted += debugDeleted;

      // Cleanup old metrics
      const metricsCutoff = Date.now() - config.metricsRetentionDays * 24 * 60 * 60 * 1000;
      const metricsDeleted = await this.cleanupNamespace('metrics', metricsCutoff);
      results.byNamespace.metrics = metricsDeleted;
      results.totalDeleted += metricsDeleted;

      // Note: We don't cleanup dedup keys as they have proper TTL
      // Note: We don't cleanup config keys as they should persist

      this.logger.info('Storage cleanup completed', results);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.errors.push(`Cleanup failed: ${errorMessage}`);
      this.logger.error('Storage cleanup failed', error);
    }

    return results;
  }

  private async cleanupNamespace(namespace: string, olderThan: number): Promise<number> {
    try {
      const deleted = await this.storage.cleanupOldData(namespace, olderThan);
      this.logger.info(`Cleaned up ${deleted} keys from ${namespace} namespace`);
      return deleted;
    } catch (error) {
      this.logger.error(`Failed to cleanup ${namespace} namespace`, error);
      return 0;
    }
  }

  // Method to be called from a scheduled worker or cron trigger
  async handleScheduledCleanup(_event: ScheduledEvent): Promise<void> {
    this.logger.info('Starting scheduled storage cleanup');

    const results = await this.cleanup();

    // Save cleanup results as metrics
    await this.storage.incrementMetric('cleanup', 'writes');

    // Save cleanup summary for debugging
    await this.storage.saveDebugData('api-call', {
      type: 'scheduled_cleanup',
      results,
      timestamp: Date.now(),
    });
  }
}

// Scheduled event handler for Cloudflare Workers
export async function handleScheduledCleanup(event: ScheduledEvent, env: Env): Promise<void> {
  const cleanup = new StorageCleanup(env);
  await cleanup.handleScheduledCleanup(event);
}
