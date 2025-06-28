import { IStorageService } from '../storage/interface';

/**
 * Checks if an event has already been processed to prevent duplicates
 */
export async function isDuplicateEvent(
  storage: IStorageService,
  repository: string,
  prNumber: number,
  eventId: string
): Promise<boolean> {
  try {
    const isDuplicate = await storage.isDuplicate(repository, prNumber, eventId);

    if (isDuplicate) {
      return true;
    }

    // Mark as processed
    await storage.markProcessed(repository, prNumber, eventId);

    return false;
  } catch (error) {
    console.error('Deduplication check error:', error);
    // On error, process the event to avoid losing reviews
    return false;
  }
}
