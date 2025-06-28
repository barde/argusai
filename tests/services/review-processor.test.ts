import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReviewProcessor } from '../../src/services/review-processor';
import type { Env } from '../../src/types/env';
import type { GitHubModelsService } from '../../src/services/github-models';
import type { GitHubService } from '../../src/services/github';
import type { StorageService } from '../../src/services/storage';
import type { ConfigService } from '../../src/services/config';

describe('ReviewProcessor - Chunking Support', () => {
  let env: Env;
  let reviewProcessor: ReviewProcessor;
  let modelsService: GitHubModelsService;
  let githubService: GitHubService;
  let storageService: StorageService;
  let configService: ConfigService;

  beforeEach(() => {
    env = {
      ENVIRONMENT: 'test',
      GITHUB_APP_ID: 'test-app-id',
      GITHUB_MODEL: 'gpt-4o-mini',
      LOG_LEVEL: 'debug',
      GITHUB_APP_PRIVATE_KEY: 'test-private-key',
      GITHUB_WEBHOOK_SECRET: 'test-secret',
      GITHUB_TOKEN: 'test-token',
      CACHE: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      } as any,
      RATE_LIMITS: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      } as any,
      CONFIG: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      } as any,
    };

    modelsService = {
      generateReview: vi.fn(),
    } as any;

    githubService = {
      getChangedFiles: vi.fn(),
      postReview: vi.fn(),
    } as any;

    storageService = {
      cacheReview: vi.fn(),
      checkAndUpdateRateLimit: vi.fn().mockResolvedValue(true),
    } as any;

    configService = {
      getConfig: vi.fn().mockResolvedValue({
        enabled: true,
        model: 'gpt-4o-mini',
        reviewLevel: 'detailed',
      }),
    } as any;

    reviewProcessor = new ReviewProcessor(
      modelsService,
      githubService,
      storageService,
      configService,
      env
    );
  });

  describe('Large PR Chunking', () => {
    it('should fall back to file-by-file review when API returns 413', async () => {
      const context = {
        repository: 'test/repo',
        prNumber: 123,
        installationId: 456,
        sha: 'test-sha',
      };

      // Mock initial 413 error
      const error413 = new Error('Payload too large') as any;
      error413.status = 413;
      (modelsService.generateReview as any).mockRejectedValueOnce(error413);

      // Mock changed files
      const mockFiles = [
        {
          filename: 'src/file1.ts',
          patch: '// Small patch 1',
          status: 'modified',
        },
        {
          filename: 'src/file2.ts',
          patch: '// Small patch 2',
          status: 'modified',
        },
      ];
      (githubService.getChangedFiles as any).mockResolvedValue(mockFiles);

      // Mock successful individual file reviews
      (modelsService.generateReview as any)
        .mockResolvedValueOnce({
          content: '### Summary\n- Approved: 1\n\n#### src/file1.ts\n✅ **Approved**\nNo issues found.',
        })
        .mockResolvedValueOnce({
          content: '### Summary\n- Warnings: 1\n\n#### src/file2.ts\n⚠️ **Warning**\nMinor issue found.',
        });

      await reviewProcessor.processReview(context);

      // Verify fallback to file-by-file review
      expect(modelsService.generateReview).toHaveBeenCalledTimes(3); // 1 failed + 2 successful
      expect(githubService.getChangedFiles).toHaveBeenCalledWith(context);
      expect(githubService.postReview).toHaveBeenCalled();
      
      // Verify review was posted with chunked format
      const postedReview = (githubService.postReview as any).mock.calls[0][1];
      expect(postedReview).toContain('# 📊 Review Summary');
      expect(postedReview).toContain('Files reviewed: **2**');
    });

    it('should handle individual files that are still too large', async () => {
      const context = {
        repository: 'test/repo',
        prNumber: 123,
        installationId: 456,
        sha: 'test-sha',
      };

      // Mock initial 413 error
      const error413 = new Error('Payload too large') as any;
      error413.status = 413;
      (modelsService.generateReview as any).mockRejectedValueOnce(error413);

      // Mock changed files with one very large file
      const mockFiles = [
        {
          filename: 'src/small.ts',
          patch: '// Small patch',
          status: 'modified',
        },
        {
          filename: 'src/huge.ts',
          patch: '// Imagine this is a massive patch',
          status: 'modified',
        },
      ];
      (githubService.getChangedFiles as any).mockResolvedValue(mockFiles);

      // Mock: first file succeeds, second file still too large
      (modelsService.generateReview as any)
        .mockResolvedValueOnce({
          content: '### Summary\n- Approved: 1\n\n#### src/small.ts\n✅ **Approved**',
        })
        .mockRejectedValueOnce(error413); // Still too large

      await reviewProcessor.processReview(context);

      // Verify review was posted with skipped file
      const postedReview = (githubService.postReview as any).mock.calls[0][1];
      expect(postedReview).toContain('Files skipped: **1**');
      expect(postedReview).toContain('src/huge.ts'); // Should mention the skipped file
    });

    it('should handle empty file list gracefully', async () => {
      const context = {
        repository: 'test/repo',
        prNumber: 123,
        installationId: 456,
        sha: 'test-sha',
      };

      // Mock initial 413 error
      const error413 = new Error('Payload too large') as any;
      error413.status = 413;
      (modelsService.generateReview as any).mockRejectedValueOnce(error413);

      // Mock empty file list
      (githubService.getChangedFiles as any).mockResolvedValue([]);

      await reviewProcessor.processReview(context);

      // Verify appropriate message for no files
      const postedReview = (githubService.postReview as any).mock.calls[0][1];
      expect(postedReview).toContain('No files to review');
    });

    it('should aggregate verdicts correctly across multiple files', async () => {
      const context = {
        repository: 'test/repo',
        prNumber: 123,
        installationId: 456,
        sha: 'test-sha',
      };

      // Mock initial 413 error
      const error413 = new Error('Payload too large') as any;
      error413.status = 413;
      (modelsService.generateReview as any).mockRejectedValueOnce(error413);

      // Mock multiple files
      const mockFiles = [
        { filename: 'file1.ts', patch: '// patch 1', status: 'modified' },
        { filename: 'file2.ts', patch: '// patch 2', status: 'modified' },
        { filename: 'file3.ts', patch: '// patch 3', status: 'modified' },
      ];
      (githubService.getChangedFiles as any).mockResolvedValue(mockFiles);

      // Mock reviews: 1 critical, 1 warning, 1 approved
      (modelsService.generateReview as any)
        .mockResolvedValueOnce({
          content: '### Summary\n- Critical: 1\n\n#### file1.ts\n🚨 **Critical**\nSecurity issue!',
        })
        .mockResolvedValueOnce({
          content: '### Summary\n- Warnings: 1\n\n#### file2.ts\n⚠️ **Warning**\nMinor issue.',
        })
        .mockResolvedValueOnce({
          content: '### Summary\n- Approved: 1\n\n#### file3.ts\n✅ **Approved**',
        });

      await reviewProcessor.processReview(context);

      // Verify overall verdict is CRITICAL (highest severity)
      const postedReview = (githubService.postReview as any).mock.calls[0][1];
      expect(postedReview).toContain('🚨 CRITICAL ISSUES FOUND');
      expect(postedReview).toContain('Critical Issues: **1**');
      expect(postedReview).toContain('Warnings: **1**');
    });
  });

  describe('Performance and Memory', () => {
    it('should handle PRs with many files without memory issues', async () => {
      const context = {
        repository: 'test/repo',
        prNumber: 123,
        installationId: 456,
        sha: 'test-sha',
      };

      // Mock initial 413 error
      const error413 = new Error('Payload too large') as any;
      error413.status = 413;
      (modelsService.generateReview as any).mockRejectedValueOnce(error413);

      // Mock 100 files
      const mockFiles = Array.from({ length: 100 }, (_, i) => ({
        filename: `src/file${i}.ts`,
        patch: `// Small patch ${i}`,
        status: 'modified',
      }));
      (githubService.getChangedFiles as any).mockResolvedValue(mockFiles);

      // Mock all reviews as approved
      (modelsService.generateReview as any).mockResolvedValue({
        content: '### Summary\n- Approved: 1\n\n#### file.ts\n✅ **Approved**',
      });

      await reviewProcessor.processReview(context);

      // Verify all files were processed
      expect(modelsService.generateReview).toHaveBeenCalledTimes(101); // 1 failed + 100 successful
      expect(githubService.postReview).toHaveBeenCalled();
      
      const postedReview = (githubService.postReview as any).mock.calls[0][1];
      expect(postedReview).toContain('Files reviewed: **100**');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-413 errors appropriately', async () => {
      const context = {
        repository: 'test/repo',
        prNumber: 123,
        installationId: 456,
        sha: 'test-sha',
      };

      // Mock a different error (not 413)
      const error500 = new Error('Internal server error') as any;
      error500.status = 500;
      (modelsService.generateReview as any).mockRejectedValueOnce(error500);

      await expect(reviewProcessor.processReview(context)).rejects.toThrow('Internal server error');
      
      // Verify no fallback to chunking
      expect(githubService.getChangedFiles).not.toHaveBeenCalled();
    });

    it('should handle rate limit errors during chunked review', async () => {
      const context = {
        repository: 'test/repo',
        prNumber: 123,
        installationId: 456,
        sha: 'test-sha',
      };

      // Mock initial 413 error
      const error413 = new Error('Payload too large') as any;
      error413.status = 413;
      (modelsService.generateReview as any).mockRejectedValueOnce(error413);

      // Mock files
      const mockFiles = [
        { filename: 'file1.ts', patch: '// patch 1', status: 'modified' },
        { filename: 'file2.ts', patch: '// patch 2', status: 'modified' },
      ];
      (githubService.getChangedFiles as any).mockResolvedValue(mockFiles);

      // Mock rate limit error on second file
      const rateLimitError = new Error('Rate limit exceeded') as any;
      rateLimitError.status = 429;
      (modelsService.generateReview as any)
        .mockResolvedValueOnce({
          content: '### Summary\n- Approved: 1\n\n#### file1.ts\n✅ **Approved**',
        })
        .mockRejectedValueOnce(rateLimitError);

      await reviewProcessor.processReview(context);

      // Verify partial review was posted
      const postedReview = (githubService.postReview as any).mock.calls[0][1];
      expect(postedReview).toContain('Files reviewed: **1**');
      expect(postedReview).toContain('Files skipped: **1**');
    });
  });
});