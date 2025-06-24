import { Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env';

// Configuration schema
const ConfigSchema = z.object({
  enabled: z.boolean().default(true),
  model: z.enum(['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o1-mini']).default('gpt-4o-mini'),
  reviewDrafts: z.boolean().default(false),
  autoApprove: z.boolean().default(false),
  maxFilesPerReview: z.number().min(1).max(100).default(50),
  ignorePaths: z.array(z.string()).default([]),
  focusPaths: z.array(z.string()).default([]),
  customPrompt: z.string().optional(),
  language: z.enum(['en', 'es', 'fr', 'de', 'ja', 'zh']).default('en'),
});

export type Config = z.infer<typeof ConfigSchema>;

export const configHandler = {
  async get(c: Context<{ Bindings: Env }>) {
    const owner = c.req.param('owner');
    const repo = c.req.param('repo');
    const key = `config:${owner}/${repo}`;

    try {
      const configJson = await c.env.CONFIG.get(key);

      if (!configJson) {
        // Return default config
        return c.json(ConfigSchema.parse({}));
      }

      const config = ConfigSchema.parse(JSON.parse(configJson));
      return c.json(config);
    } catch (error) {
      console.error('Error getting config:', error);
      return c.json({ error: 'Failed to get configuration' }, 500);
    }
  },

  async update(c: Context<{ Bindings: Env }>) {
    const owner = c.req.param('owner');
    const repo = c.req.param('repo');
    const key = `config:${owner}/${repo}`;

    try {
      // TODO: Add authentication check here
      // For now, this endpoint should be protected at the edge level

      const body = await c.req.json();
      const config = ConfigSchema.parse(body);

      await c.env.CONFIG.put(key, JSON.stringify(config));

      return c.json({
        message: 'Configuration updated',
        config,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json(
          {
            error: 'Invalid configuration',
            details: error.errors,
          },
          400
        );
      }

      console.error('Error updating config:', error);
      return c.json({ error: 'Failed to update configuration' }, 500);
    }
  },
};
