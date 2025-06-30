import { Context } from 'hono';
import type { Env } from '../types/env';

/**
 * Get the public base URL for the application
 * Uses PUBLIC_URL env var if set, otherwise derives from request
 */
export function getPublicUrl(c: Context<{ Bindings: Env }>): string {
  // If PUBLIC_URL is explicitly set, use it
  if (c.env.PUBLIC_URL) {
    return c.env.PUBLIC_URL.replace(/\/$/, ''); // Remove trailing slash
  }

  // Otherwise, derive from the request URL
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * Get the OAuth callback URL
 */
export function getCallbackUrl(c: Context<{ Bindings: Env }>): string {
  return `${getPublicUrl(c)}/auth/callback-debug`;
}
