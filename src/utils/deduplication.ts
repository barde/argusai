/**
 * Checks if an event has already been processed to prevent duplicates
 */
export async function isDuplicateEvent(
  cache: KVNamespace,
  repository: string,
  prNumber: number,
  eventId: string
): Promise<boolean> {
  const key = `dedup:${repository}:${prNumber}:${eventId}`;

  try {
    const existing = await cache.get(key);

    if (existing) {
      return true;
    }

    // Store the event ID with 24-hour TTL
    await cache.put(key, '1', {
      expirationTtl: 86400, // 24 hours in seconds
    });

    return false;
  } catch (error) {
    console.error('Deduplication check error:', error);
    // On error, process the event to avoid losing reviews
    return false;
  }
}
