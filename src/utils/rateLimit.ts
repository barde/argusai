/**
 * Simple rate limiting using KV storage
 */
export async function checkRateLimit(
  rateLimits: KVNamespace,
  installationId: number
): Promise<boolean> {
  // Skip rate limiting for installation ID 0 (testing)
  if (installationId === 0) {
    return true;
  }

  const now = Date.now();
  const window = Math.floor(now / 60000); // 1-minute windows
  const key = `rate:${installationId}:${window}`;
  
  try {
    const currentCount = await rateLimits.get(key);
    const count = currentCount ? parseInt(currentCount, 10) : 0;

    // Allow 60 requests per minute per installation
    const RATE_LIMIT = 60;
    
    if (count >= RATE_LIMIT) {
      console.warn(`Rate limit exceeded for installation ${installationId}`);
      return false;
    }

    // Increment counter with TTL
    await rateLimits.put(key, String(count + 1), {
      expirationTtl: 120 // 2 minutes TTL
    });

    return true;
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
  rateLimits: KVNamespace,
  installationId: number
): Promise<{ limit: number; remaining: number; resetAt: number }> {
  const now = Date.now();
  const window = Math.floor(now / 60000);
  const key = `rate:${installationId}:${window}`;
  
  try {
    const currentCount = await rateLimits.get(key);
    const count = currentCount ? parseInt(currentCount, 10) : 0;
    const RATE_LIMIT = 60;

    return {
      limit: RATE_LIMIT,
      remaining: Math.max(0, RATE_LIMIT - count),
      resetAt: (window + 1) * 60000
    };
  } catch (error) {
    console.error('Get rate limit error:', error);
    return {
      limit: 60,
      remaining: 60,
      resetAt: (window + 1) * 60000
    };
  }
}