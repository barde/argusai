import { Context } from 'hono';
import type { Env } from '../types/env';
import { AllowedReposService } from '../storage/allowed-repos';

/**
 * Get all allowed repositories
 */
export async function getAllowedReposHandler(c: Context<{ Bindings: Env }>) {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !isValidAdminToken(authHeader, c.env)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const allowedRepos = new AllowedReposService(c.env.CONFIG);
    const repos = await allowedRepos.getAllRepositories();

    return c.json({
      count: repos.length,
      repositories: repos,
    });
  } catch (error) {
    console.error('Failed to get allowed repositories:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

/**
 * Add a repository to the allowed list
 */
export async function addAllowedRepoHandler(c: Context<{ Bindings: Env }>) {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !isValidAdminToken(authHeader, c.env)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { owner, repo, reason } = body;

    if (!owner || !repo) {
      return c.json({ error: 'Missing owner or repo' }, 400);
    }

    const allowedRepos = new AllowedReposService(c.env.CONFIG);
    await allowedRepos.addRepository({
      owner,
      repo,
      addedAt: Date.now(),
      addedBy: 'admin',
      reason,
    });

    return c.json({
      message: 'Repository added to allowed list',
      repository: `${owner}/${repo}`,
    });
  } catch (error) {
    console.error('Failed to add repository:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

/**
 * Remove a repository from the allowed list
 */
export async function removeAllowedRepoHandler(c: Context<{ Bindings: Env }>) {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !isValidAdminToken(authHeader, c.env)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const owner = c.req.param('owner');
    const repo = c.req.param('repo');

    if (!owner || !repo) {
      return c.json({ error: 'Missing owner or repo' }, 400);
    }

    const allowedRepos = new AllowedReposService(c.env.CONFIG);
    const removed = await allowedRepos.removeRepository(owner, repo);

    if (removed) {
      return c.json({
        message: 'Repository removed from allowed list',
        repository: `${owner}/${repo}`,
      });
    } else {
      return c.json({ error: 'Repository not found' }, 404);
    }
  } catch (error) {
    console.error('Failed to remove repository:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

/**
 * Check if a repository is allowed
 */
export async function checkAllowedRepoHandler(c: Context<{ Bindings: Env }>) {
  try {
    const owner = c.req.param('owner');
    const repo = c.req.param('repo');

    if (!owner || !repo) {
      return c.json({ error: 'Missing owner or repo' }, 400);
    }

    const allowedRepos = new AllowedReposService(c.env.CONFIG);
    const isAllowed = await allowedRepos.isAllowed(owner, repo);

    return c.json({
      repository: `${owner}/${repo}`,
      allowed: isAllowed,
    });
  } catch (error) {
    console.error('Failed to check repository:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

/**
 * Validate admin token
 * In production, this should validate against a secure admin token
 */
function isValidAdminToken(authHeader: string, env: Env): boolean {
  // Use GitHub token as admin token for now
  // In production, use a separate ADMIN_TOKEN secret
  const token = authHeader.replace('Bearer ', '');
  return token === env.GITHUB_TOKEN;
}
