import { describe, it, expect } from 'vitest';
import {
  ReviewDataSchema,
  ReviewStatusSchema,
  RepositoryConfigSchema,
  DeduplicationDataSchema,
  StorageMetricsSchema,
  StorageKeySchema,
  validateData,
  ValidationError,
} from '../validation';

describe('Storage Validation', () => {
  describe('ReviewDataSchema', () => {
    it('should validate correct review data', () => {
      const data = {
        repository: 'owner/repo',
        prNumber: 123,
        sha: 'a'.repeat(40),
        result: {
          summary: 'Good PR',
          files: [
            {
              path: 'src/index.ts',
              review: 'Looks good',
              severity: 'info' as const,
            },
          ],
        },
        metadata: {
          model: 'gpt-4o',
          timestamp: Date.now(),
          processingTime: 1500,
        },
      };

      const result = ReviewDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject invalid SHA', () => {
      const data = {
        repository: 'owner/repo',
        prNumber: 123,
        sha: 'invalid-sha',
        result: { summary: 'Test', files: [] },
        metadata: { model: 'gpt-4o', timestamp: Date.now(), processingTime: 100 },
      };

      const result = ReviewDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject invalid severity', () => {
      const data = {
        repository: 'owner/repo',
        prNumber: 123,
        sha: 'a'.repeat(40),
        result: {
          summary: 'Test',
          files: [
            {
              path: 'test.js',
              review: 'Bad',
              severity: 'critical' as any,
            },
          ],
        },
        metadata: { model: 'gpt-4o', timestamp: Date.now(), processingTime: 100 },
      };

      const result = ReviewDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('ReviewStatusSchema', () => {
    it('should validate all status values', () => {
      const statuses = ['pending', 'processing', 'completed', 'failed', 'skipped'];

      for (const status of statuses) {
        const data = {
          repository: 'owner/repo',
          prNumber: 123,
          status,
        };

        const result = ReviewStatusSchema.safeParse(data);
        expect(result.success).toBe(true);
      }
    });

    it('should accept optional fields', () => {
      const data = {
        repository: 'owner/repo',
        prNumber: 123,
        status: 'failed',
        error: 'API error',
        retryCount: 2,
      };

      const result = ReviewStatusSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('RepositoryConfigSchema', () => {
    it('should validate complete config', () => {
      const config = {
        enabled: true,
        model: 'gpt-4o-mini',
        reviewDrafts: false,
        autoApprove: false,
        maxFilesPerReview: 50,
        ignorePaths: ['node_modules', 'dist'],
        focusPaths: ['src'],
        customPrompt: 'Be strict',
        language: 'en',
      };

      const result = RepositoryConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid model', () => {
      const config = {
        enabled: true,
        model: 'gpt-5',
        reviewDrafts: false,
        autoApprove: false,
        maxFilesPerReview: 50,
        ignorePaths: [],
        focusPaths: [],
        language: 'en',
      };

      const result = RepositoryConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should enforce maxFilesPerReview limits', () => {
      const config = {
        enabled: true,
        model: 'gpt-4o',
        reviewDrafts: false,
        autoApprove: false,
        maxFilesPerReview: 150,
        ignorePaths: [],
        focusPaths: [],
        language: 'en',
      };

      const result = RepositoryConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('StorageKeySchema', () => {
    it('should validate all key prefixes', () => {
      const validKeys = [
        'review:test',
        'status:test',
        'history:test',
        'rate:test',
        'config:test',
        'dedup:test',
        'debug:test',
        'metrics:test',
      ];

      for (const key of validKeys) {
        const result = StorageKeySchema.safeParse(key);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid key prefixes', () => {
      const invalidKeys = ['invalid:test', 'test', '', 'review', 'review-test'];

      for (const key of invalidKeys) {
        const result = StorageKeySchema.safeParse(key);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('validateData helper', () => {
    it('should return validated data on success', () => {
      const data = {
        eventId: 'event-123',
        processedAt: Date.now(),
      };

      const result = validateData(data, DeduplicationDataSchema, 'dedup data');
      expect(result).toEqual(data);
    });

    it('should throw ValidationError on failure', () => {
      const data = {
        eventId: '',
        processedAt: 'not-a-number',
      };

      expect(() => {
        validateData(data, DeduplicationDataSchema, 'dedup data');
      }).toThrow(ValidationError);
    });

    it('should include context in error message', () => {
      const data = {};

      try {
        validateData(data, DeduplicationDataSchema, 'test context');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('Invalid test context');
      }
    });
  });

  describe('StorageMetricsSchema', () => {
    it('should validate metrics data', () => {
      const metrics = {
        namespace: 'review',
        reads: 100,
        writes: 50,
        deletes: 10,
        errors: 2,
        lastError: 'Connection timeout',
        lastUpdated: Date.now(),
      };

      const result = StorageMetricsSchema.safeParse(metrics);
      expect(result.success).toBe(true);
    });

    it('should reject negative counters', () => {
      const metrics = {
        namespace: 'review',
        reads: -1,
        writes: 50,
        deletes: 10,
        errors: 2,
        lastUpdated: Date.now(),
      };

      const result = StorageMetricsSchema.safeParse(metrics);
      expect(result.success).toBe(false);
    });
  });
});
