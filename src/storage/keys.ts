export class StorageKeys {
  static review(repository: string, prNumber: number, sha: string): string {
    return `review:${repository}:${prNumber}:${sha}`;
  }

  static reviewStatus(repository: string, prNumber: number): string {
    return `status:${repository}:${prNumber}`;
  }

  static reviewHistory(repository: string, prNumber: number): string {
    return `history:${repository}:${prNumber}`;
  }

  static rateLimit(installationId: string, window: number): string {
    return `rate:${installationId}:${window}`;
  }

  static config(owner: string, repo: string): string {
    return `config:${owner}/${repo}`;
  }

  static deduplication(repository: string, prNumber: number, eventId: string): string {
    return `dedup:${repository}:${prNumber}:${eventId}`;
  }

  static debug(type: 'last-error' | 'last-webhook' | 'last-api-call'): string {
    return `debug:${type}`;
  }

  static metrics(namespace: string): string {
    return `metrics:${namespace}`;
  }

  static parseKey(key: string): {
    namespace: string;
    parts: string[];
  } | null {
    const segments = key.split(':');
    if (segments.length < 2 || !segments[0]) return null;

    return {
      namespace: segments[0],
      parts: segments.slice(1),
    };
  }

  static isValidKey(key: string): boolean {
    const validPrefixes = [
      'review:',
      'status:',
      'history:',
      'rate:',
      'config:',
      'dedup:',
      'debug:',
      'metrics:',
    ];
    return validPrefixes.some((prefix) => key.startsWith(prefix));
  }

  static extractRepository(key: string): { owner: string; repo: string } | null {
    const parsed = this.parseKey(key);
    if (!parsed) return null;

    if (parsed.namespace === 'config' && parsed.parts.length === 1 && parsed.parts[0]) {
      const parts = parsed.parts[0].split('/');
      if (parts.length === 2 && parts[0] && parts[1]) {
        return { owner: parts[0], repo: parts[1] };
      }
    }

    if (
      ['review', 'status', 'history', 'dedup'].includes(parsed.namespace) &&
      parsed.parts.length >= 1 &&
      parsed.parts[0]
    ) {
      const parts = parsed.parts[0].split('/');
      if (parts.length === 2 && parts[0] && parts[1]) {
        return { owner: parts[0], repo: parts[1] };
      }
    }

    return null;
  }
}

export const DEFAULT_TTLS = {
  review: 7 * 24 * 60 * 60, // 7 days
  reviewStatus: 24 * 60 * 60, // 24 hours
  reviewHistory: 30 * 24 * 60 * 60, // 30 days
  rateLimit: 2 * 60, // 2 minutes
  config: undefined, // No TTL (permanent)
  deduplication: 24 * 60 * 60, // 24 hours
  debug: 60 * 60, // 1 hour
  metrics: 24 * 60 * 60, // 24 hours
} as const;
