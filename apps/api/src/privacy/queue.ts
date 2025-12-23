import { Queue } from 'bullmq';
import { createQueue } from '../queue';

export const PRIVACY_QUEUE_NAME = 'privacy';
export const PRIVACY_JOB_NAME = 'privacy:process';

let privacyQueue: Queue | null = null;

export function getPrivacyQueue(): Queue {
  if (!privacyQueue) {
    privacyQueue = createQueue(PRIVACY_QUEUE_NAME);
  }

  return privacyQueue;
}
