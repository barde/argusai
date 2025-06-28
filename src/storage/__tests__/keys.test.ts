import { describe, it, expect } from 'vitest';
import { StorageKeys, DEFAULT_TTLS } from '../keys';

describe('StorageKeys', () => {
  describe('key generation', () => {
    it('should generate correct review key', () => {
      const key = StorageKeys.review('owner/repo', 123, 'abc123');
      expect(key).toBe('review:owner/repo:123:abc123');
    });

    it('should generate correct review status key', () => {
      const key = StorageKeys.reviewStatus('owner/repo', 123);
      expect(key).toBe('status:owner/repo:123');
    });

    it('should generate correct review history key', () => {
      const key = StorageKeys.reviewHistory('owner/repo', 123);
      expect(key).toBe('history:owner/repo:123');
    });

    it('should generate correct rate limit key', () => {
      const key = StorageKeys.rateLimit('12345', 28456789);
      expect(key).toBe('rate:12345:28456789');
    });

    it('should generate correct config key', () => {
      const key = StorageKeys.config('owner', 'repo');
      expect(key).toBe('config:owner/repo');
    });

    it('should generate correct deduplication key', () => {
      const key = StorageKeys.deduplication('owner/repo', 123, 'event-123');
      expect(key).toBe('dedup:owner/repo:123:event-123');
    });

    it('should generate correct debug key', () => {
      expect(StorageKeys.debug('last-error')).toBe('debug:last-error');
      expect(StorageKeys.debug('last-webhook')).toBe('debug:last-webhook');
      expect(StorageKeys.debug('last-api-call')).toBe('debug:last-api-call');
    });

    it('should generate correct metrics key', () => {
      const key = StorageKeys.metrics('review');
      expect(key).toBe('metrics:review');
    });
  });

  describe('key parsing', () => {
    it('should parse valid keys correctly', () => {
      const parsed = StorageKeys.parseKey('review:owner/repo:123:abc123');
      expect(parsed).toEqual({
        namespace: 'review',
        parts: ['owner/repo', '123', 'abc123'],
      });
    });

    it('should return null for invalid keys', () => {
      expect(StorageKeys.parseKey('invalid')).toBeNull();
      expect(StorageKeys.parseKey('')).toBeNull();
    });
  });

  describe('key validation', () => {
    it('should validate correct keys', () => {
      expect(StorageKeys.isValidKey('review:owner/repo:123:abc')).toBe(true);
      expect(StorageKeys.isValidKey('status:owner/repo:123')).toBe(true);
      expect(StorageKeys.isValidKey('history:owner/repo:123')).toBe(true);
      expect(StorageKeys.isValidKey('rate:12345:28456789')).toBe(true);
      expect(StorageKeys.isValidKey('config:owner/repo')).toBe(true);
      expect(StorageKeys.isValidKey('dedup:owner/repo:123:event')).toBe(true);
      expect(StorageKeys.isValidKey('debug:last-error')).toBe(true);
      expect(StorageKeys.isValidKey('metrics:review')).toBe(true);
    });

    it('should reject invalid keys', () => {
      expect(StorageKeys.isValidKey('invalid:key')).toBe(false);
      expect(StorageKeys.isValidKey('review')).toBe(false);
      expect(StorageKeys.isValidKey('')).toBe(false);
    });
  });

  describe('repository extraction', () => {
    it('should extract repository from config keys', () => {
      const repo = StorageKeys.extractRepository('config:owner/repo');
      expect(repo).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should extract repository from review keys', () => {
      const repo = StorageKeys.extractRepository('review:owner/repo:123:abc');
      expect(repo).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should extract repository from status keys', () => {
      const repo = StorageKeys.extractRepository('status:owner/repo:123');
      expect(repo).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should return null for non-repository keys', () => {
      expect(StorageKeys.extractRepository('rate:12345:28456789')).toBeNull();
      expect(StorageKeys.extractRepository('debug:last-error')).toBeNull();
      expect(StorageKeys.extractRepository('invalid:key')).toBeNull();
    });
  });

  describe('default TTLs', () => {
    it('should have correct TTL values', () => {
      expect(DEFAULT_TTLS.review).toBe(7 * 24 * 60 * 60);
      expect(DEFAULT_TTLS.reviewStatus).toBe(24 * 60 * 60);
      expect(DEFAULT_TTLS.reviewHistory).toBe(30 * 24 * 60 * 60);
      expect(DEFAULT_TTLS.rateLimit).toBe(2 * 60);
      expect(DEFAULT_TTLS.config).toBeUndefined();
      expect(DEFAULT_TTLS.deduplication).toBe(24 * 60 * 60);
      expect(DEFAULT_TTLS.debug).toBe(60 * 60);
      expect(DEFAULT_TTLS.metrics).toBe(24 * 60 * 60);
    });
  });
});
