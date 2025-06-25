import type { PullRequestEvent } from './github';

export interface ReviewData {
  repository: string;
  prNumber: number;
  installationId: number;
  action: string;
  sha: string;
  timestamp: number;
  eventId: string;
  payload: PullRequestEvent;
}