import { Queue } from "bullmq";
import { redis } from "../lib/redis.js";

export const SYNC_QUEUE_NAME = "leetcode-sync";

export interface SyncJobData {
  userId: string;
  jobId: string; // our SyncJob row id
}

export const syncQueue = new Queue<SyncJobData>(SYNC_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

export async function enqueueSync(data: SyncJobData) {
  return syncQueue.add("sync", data);
}
