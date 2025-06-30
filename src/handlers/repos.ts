import { Context } from 'hono';
import { Env } from '../types/env';
import { Logger } from '../utils/logger';
import { JWTPayload } from '../utils/jwt';

const logger = new Logger('repos');

interface Repository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  private: boolean;
  description: string | null;
  html_url: string;
  default_branch: string;
  updated_at: string;
  language: string | null;
  stargazers_count: number;
  archived: boolean;
  disabled: boolean;
}

interface UserRepoConfig {
  enabled: boolean;
  enabledAt?: string;
  configuration?: {
    reviewMode?: 'all' | 'requested' | 'mentions';
    autoReview?: boolean;
  };
}

/**
 * Get user's repositories from GitHub
 */
export async function getUserRepos(c: Context<{ Bindings: Env; Variables: { user: JWTPayload } }>) {
  const user = c.get('user');

  if (!user || !c.env.OAUTH_TOKENS) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  try {
    // Get user's access token
    const accessToken = await c.env.OAUTH_TOKENS.get(`token:${user.sub}`);

    if (!accessToken) {
      return c.json({ error: 'Token not found' }, 401);
    }

    // Fetch user info to get installations
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      throw new Error(`GitHub API error: ${userResponse.status}`);
    }

    const userData = (await userResponse.json()) as { id: number; login: string };

    // For now, return empty repos since we removed public_repo scope
    // In a production app, you would:
    // 1. Use GitHub App installations API to find where ArgusAI is installed
    // 2. Only show repos where the user has access AND ArgusAI is installed
    // This requires using the GitHub App's private key, not the user's OAuth token
    logger.info('User repos endpoint called - returning empty list due to minimal OAuth scope', {
      userId: userData.id,
      login: userData.login,
    });

    // Return empty array for now
    const repos: Repository[] = [];

    // Get user's repo configurations
    const configs = new Map<string, UserRepoConfig>();

    if (c.env.CONFIG) {
      const configKey = `user:${user.sub}:repos`;
      const storedConfigs = (await c.env.CONFIG.get(configKey, 'json')) as Record<
        string,
        UserRepoConfig
      > | null;

      if (storedConfigs) {
        Object.entries(storedConfigs).forEach(([repoName, config]) => {
          configs.set(repoName, config);
        });
      }
    }

    // Check which repos have ArgusAI installed
    const argusaiRepos = new Set<string>();
    if (c.env.CONFIG) {
      const allowedRepos = await c.env.CONFIG.list({ prefix: 'allowed:' });
      allowedRepos.keys.forEach((key) => {
        const repoName = key.name.replace('allowed:', '');
        argusaiRepos.add(repoName);
      });
    }

    // Combine repo data with configurations
    const reposWithConfig = repos
      .filter((repo) => !repo.archived && !repo.disabled)
      .map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        owner: repo.owner,
        private: repo.private,
        description: repo.description,
        html_url: repo.html_url,
        default_branch: repo.default_branch,
        updated_at: repo.updated_at,
        language: repo.language,
        stargazers_count: repo.stargazers_count,
        argusai_installed: argusaiRepos.has(repo.full_name),
        user_config: configs.get(repo.full_name) || { enabled: false },
      }));

    return c.json({
      repositories: reposWithConfig,
      total: reposWithConfig.length,
    });
  } catch (error) {
    logger.error('Failed to fetch repositories', error as Error);
    return c.json({ error: 'Failed to fetch repositories' }, 500);
  }
}

/**
 * Enable ArgusAI for a repository
 */
export async function enableRepo(c: Context<{ Bindings: Env; Variables: { user: JWTPayload } }>) {
  const user = c.get('user');
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');

  if (!user || !owner || !repo) {
    return c.json({ error: 'Invalid request' }, 400);
  }

  const fullName = `${owner}/${repo}`;

  try {
    // Verify user has access to this repo
    const hasAccess = await verifyRepoAccess(c, user.sub, fullName);
    if (!hasAccess) {
      return c.json({ error: 'Repository not found or access denied' }, 403);
    }

    // Update user configuration
    if (c.env.CONFIG) {
      const configKey = `user:${user.sub}:repos`;
      const configs =
        ((await c.env.CONFIG.get(configKey, 'json')) as Record<string, UserRepoConfig>) || {};

      configs[fullName] = {
        enabled: true,
        enabledAt: new Date().toISOString(),
        configuration: {
          reviewMode: 'requested',
          autoReview: false,
        },
      };

      await c.env.CONFIG.put(configKey, JSON.stringify(configs));
    }

    // Add to allowed repos if not already there
    if (c.env.CONFIG) {
      await c.env.CONFIG.put(`allowed:${fullName}`, 'true');
    }

    return c.json({
      success: true,
      repository: fullName,
      enabled: true,
    });
  } catch (error) {
    logger.error('Failed to enable repository', error as Error);
    return c.json({ error: 'Failed to enable repository' }, 500);
  }
}

/**
 * Disable ArgusAI for a repository
 */
export async function disableRepo(c: Context<{ Bindings: Env; Variables: { user: JWTPayload } }>) {
  const user = c.get('user');
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');

  if (!user || !owner || !repo) {
    return c.json({ error: 'Invalid request' }, 400);
  }

  const fullName = `${owner}/${repo}`;

  try {
    // Update user configuration
    if (c.env.CONFIG) {
      const configKey = `user:${user.sub}:repos`;
      const configs =
        ((await c.env.CONFIG.get(configKey, 'json')) as Record<string, UserRepoConfig>) || {};

      if (configs[fullName]) {
        configs[fullName].enabled = false;
        await c.env.CONFIG.put(configKey, JSON.stringify(configs));
      }
    }

    // Note: We don't remove from allowed repos as other users might have it enabled

    return c.json({
      success: true,
      repository: fullName,
      enabled: false,
    });
  } catch (error) {
    logger.error('Failed to disable repository', error as Error);
    return c.json({ error: 'Failed to disable repository' }, 500);
  }
}

/**
 * Verify user has access to a repository
 */
async function verifyRepoAccess(
  c: Context<{ Bindings: Env; Variables: { user: JWTPayload } }>,
  userId: string,
  repoFullName: string
): Promise<boolean> {
  if (!c.env.OAUTH_TOKENS) return false;

  const accessToken = await c.env.OAUTH_TOKENS.get(`token:${userId}`);
  if (!accessToken) return false;

  try {
    const [owner, repo] = repoFullName.split('/');
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}
