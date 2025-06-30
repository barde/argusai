import { Logger } from './logger';

const logger = new Logger('kv-retry');

interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
}

/**
 * Retry a KV operation with exponential backoff
 */
export async function retryKVOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, initialDelay = 100, maxDelay = 5000, backoffFactor = 2 } = options;

  let lastError: Error | unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info(`Attempting ${operationName}`, { attempt, maxAttempts });
      const result = await operation();

      if (attempt > 1) {
        logger.info(`${operationName} succeeded after retry`, { attempt });
      }

      return result;
    } catch (error) {
      lastError = error;
      logger.error(`${operationName} failed`, {
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });

      if (attempt < maxAttempts) {
        const delay = Math.min(initialDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
        logger.info(`Retrying ${operationName} after delay`, { delay, nextAttempt: attempt + 1 });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logger.error(`${operationName} failed after all attempts`, {
    maxAttempts,
    lastError: lastError instanceof Error ? lastError.message : String(lastError),
  });

  throw lastError;
}

/**
 * Store a value in KV with retry and verification
 */
export async function storeWithVerification(
  kv: KVNamespace,
  key: string,
  value: string,
  options?: KVNamespacePutOptions
): Promise<boolean> {
  // Store with retry
  await retryKVOperation(() => kv.put(key, value, options), `KV.put(${key})`);

  // Verify storage with retry
  const verified = await retryKVOperation(async () => {
    const stored = await kv.get(key);
    if (stored !== value) {
      throw new Error(`Verification failed: expected '${value}', got '${stored}'`);
    }
    return true;
  }, `KV.get(${key}) verification`);

  return verified;
}
