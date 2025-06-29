import { Logger } from '../utils/logger';
import type { KVNamespace } from '@cloudflare/workers-types';

const logger = new Logger('allowed-repos');

export interface AllowedRepository {
  owner: string;
  repo: string;
  addedAt: number;
  addedBy?: string;
  reason?: string;
}

export class AllowedReposService {
  private readonly ALLOWED_REPOS_KEY = 'allowed-repos:list';
  private cache: Set<string> | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(private readonly configKV: KVNamespace) {}

  /**
   * Check if a repository is on the allowed list
   */
  async isAllowed(owner: string, repo: string): Promise<boolean> {
    const repoKey = `${owner}/${repo}`.toLowerCase();

    // Check cache first
    if (this.cache && Date.now() < this.cacheExpiry) {
      return this.cache.has(repoKey);
    }

    // Refresh cache
    await this.refreshCache();
    return this.cache?.has(repoKey) || false;
  }

  /**
   * Add a repository to the allowed list
   */
  async addRepository(repo: AllowedRepository): Promise<void> {
    try {
      const allowedRepos = await this.getAllRepositories();
      const repoKey = `${repo.owner}/${repo.repo}`.toLowerCase();

      // Check if already exists
      const exists = allowedRepos.some((r) => `${r.owner}/${r.repo}`.toLowerCase() === repoKey);

      if (!exists) {
        allowedRepos.push({
          ...repo,
          addedAt: Date.now(),
        });

        await this.configKV.put(this.ALLOWED_REPOS_KEY, JSON.stringify(allowedRepos), {
          metadata: { lastUpdated: Date.now() },
        });

        // Invalidate cache
        this.cache = null;

        logger.info('Repository added to allowed list', {
          owner: repo.owner,
          repo: repo.repo,
        });
      }
    } catch (error) {
      logger.error('Failed to add repository', error as Error, {
        owner: repo.owner,
        repo: repo.repo,
      });
      throw error;
    }
  }

  /**
   * Remove a repository from the allowed list
   */
  async removeRepository(owner: string, repo: string): Promise<boolean> {
    try {
      const allowedRepos = await this.getAllRepositories();
      const repoKey = `${owner}/${repo}`.toLowerCase();

      const filtered = allowedRepos.filter((r) => `${r.owner}/${r.repo}`.toLowerCase() !== repoKey);

      if (filtered.length < allowedRepos.length) {
        await this.configKV.put(this.ALLOWED_REPOS_KEY, JSON.stringify(filtered), {
          metadata: { lastUpdated: Date.now() },
        });

        // Invalidate cache
        this.cache = null;

        logger.info('Repository removed from allowed list', { owner, repo });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to remove repository', error as Error, { owner, repo });
      throw error;
    }
  }

  /**
   * Get all allowed repositories
   */
  async getAllRepositories(): Promise<AllowedRepository[]> {
    try {
      const data = await this.configKV.get(this.ALLOWED_REPOS_KEY);
      if (!data) {
        return [];
      }
      return JSON.parse(data) as AllowedRepository[];
    } catch (error) {
      logger.error('Failed to get allowed repositories', error as Error);
      return [];
    }
  }

  /**
   * Refresh the cache
   */
  private async refreshCache(): Promise<void> {
    try {
      const repos = await this.getAllRepositories();
      this.cache = new Set(repos.map((r) => `${r.owner}/${r.repo}`.toLowerCase()));
      this.cacheExpiry = Date.now() + this.CACHE_TTL * 1000;
    } catch (error) {
      logger.error('Failed to refresh cache', error as Error);
      // Keep existing cache if refresh fails
    }
  }

  /**
   * Clear the allowed repositories list (admin only)
   */
  async clearAll(): Promise<void> {
    await this.configKV.delete(this.ALLOWED_REPOS_KEY);
    this.cache = null;
    logger.info('Cleared all allowed repositories');
  }
}
