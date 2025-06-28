import { Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env';
import { StorageServiceFactory } from '../storage';

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

    // Initialize storage service
    const storageFactory = new StorageServiceFactory();
    const storage = storageFactory.create(c.env);

    try {
      const config = await storage.getConfig(owner, repo);

      if (!config) {
        // Return default config
        return c.json(ConfigSchema.parse({}));
      }

      // Validate the stored config
      const validatedConfig = ConfigSchema.parse(config);
      return c.json(validatedConfig);
    } catch (error) {
      console.error('Error getting config:', error);
      return c.json({ error: 'Failed to get configuration' }, 500);
    }
  },

  async update(c: Context<{ Bindings: Env }>) {
    const owner = c.req.param('owner');
    const repo = c.req.param('repo');

    // Initialize storage service
    const storageFactory = new StorageServiceFactory();
    const storage = storageFactory.create(c.env);

    try {
      // TODO: Add authentication check here
      // For now, this endpoint should be protected at the edge level

      const body = await c.req.json();
      const config = ConfigSchema.parse(body);

      await storage.saveConfig(owner, repo, config);

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
