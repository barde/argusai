import { z } from 'zod';

// Review data validation
export const ReviewDataSchema = z.object({
  repository: z.string().min(1),
  prNumber: z.number().positive(),
  sha: z.string().regex(/^[a-f0-9]{40}$/),
  result: z.object({
    summary: z.string(),
    files: z.array(
      z.object({
        path: z.string(),
        review: z.string(),
        severity: z.enum(['info', 'warning', 'error']),
      })
    ),
  }),
  metadata: z.object({
    model: z.string(),
    timestamp: z.number(),
    processingTime: z.number().nonnegative(),
  }),
});

// Review status validation
export const ReviewStatusSchema = z.object({
  repository: z.string().min(1),
  prNumber: z.number().positive(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'skipped']),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  error: z.string().optional(),
  retryCount: z.number().nonnegative().optional(),
});

// Review history validation
export const ReviewHistorySchema = z.object({
  repository: z.string().min(1),
  prNumber: z.number().positive(),
  reviews: z.array(
    z.object({
      sha: z.string().regex(/^[a-f0-9]{40}$/),
      timestamp: z.number(),
      model: z.string(),
      status: z.enum(['completed', 'failed']),
    })
  ),
});

// Rate limit validation
export const RateLimitDataSchema = z.object({
  installationId: z.string().min(1),
  window: z.number().positive(),
  count: z.number().nonnegative(),
  resetAt: z.number(),
});

// Repository config validation (reuse existing schema)
export const RepositoryConfigSchema = z.object({
  enabled: z.boolean(),
  model: z.enum(['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o1-mini']),
  reviewDrafts: z.boolean(),
  autoApprove: z.boolean(),
  maxFilesPerReview: z.number().min(1).max(100),
  ignorePaths: z.array(z.string()),
  focusPaths: z.array(z.string()),
  customPrompt: z.string().optional(),
  language: z.enum(['en', 'es', 'fr', 'de', 'ja', 'zh']),
  updatedAt: z.number().optional(),
});

// Deduplication data validation
export const DeduplicationDataSchema = z.object({
  eventId: z.string().min(1),
  processedAt: z.number(),
});

// Debug data validation
export const DebugDataSchema = z.object({
  type: z.enum(['error', 'webhook', 'api-call']),
  timestamp: z.number(),
  data: z.any(),
});

// Storage metrics validation
export const StorageMetricsSchema = z.object({
  namespace: z.string().min(1),
  reads: z.number().nonnegative(),
  writes: z.number().nonnegative(),
  deletes: z.number().nonnegative(),
  errors: z.number().nonnegative(),
  lastError: z.string().optional(),
  lastUpdated: z.number(),
});

// Key validation
export const StorageKeySchema = z
  .string()
  .regex(
    /^(review|status|history|rate|config|dedup|debug|metrics):/,
    'Key must start with a valid namespace prefix'
  );

// Validation helper
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: z.ZodError
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateData<T>(data: unknown, schema: z.ZodSchema<T>, context: string): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError(
      `Invalid ${context}: ${result.error.errors.map((e) => e.message).join(', ')}`,
      result.error
    );
  }

  return result.data;
}
