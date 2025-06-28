import { IStorageService } from '../storage/interface';

/**
 * Simple rate limiting using storage service
 */
export async function checkRateLimit(
  storage: IStorageService,
  installationId: number
): Promise<boolean> {
  // Skip rate limiting for installation ID 0 (testing)
  if (installationId === 0) {
    return true;
  }

  try {
    const result = await storage.incrementRateLimit(String(installationId));

    if (!result.allowed) {
      console.warn(`Rate limit exceeded for installation ${installationId}`);
    }

    return result.allowed;
  } catch (error) {
    console.error('Rate limit check error:', error);
    // On error, allow the request
    return true;
  }
}

/**
 * Get remaining rate limit for an installation
 */
export async function getRateLimit(
  storage: IStorageService,
  installationId: number
): Promise<{ limit: number; remaining: number; resetAt: number }> {
  const now = Date.now();
  const window = Math.floor(now / 60000);

  try {
    const rateLimitData = await storage.getRateLimit(String(installationId));
    const RATE_LIMIT = 60;

    if (rateLimitData) {
      return {
        limit: RATE_LIMIT,
        remaining: RATE_LIMIT - rateLimitData.count,
        resetAt: rateLimitData.resetAt,
      };
    } else {
      return {
        limit: RATE_LIMIT,
        remaining: RATE_LIMIT,
        resetAt: (window + 1) * 60000,
      };
    }
  } catch (error) {
    console.error('Get rate limit error:', error);
    return {
      limit: 60,
      remaining: 60,
      resetAt: (window + 1) * 60000,
    };
  }
}
