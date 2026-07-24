import { Worker } from "bullmq";
import { createRedis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { runSync } from "../services/sync.service.js";
import { SYNC_QUEUE_NAME, type SyncJobData } from "./sync.queue.js";

/** Creates (but does not implicitly start elsewhere) the sync worker. */
export function createSyncWorker(): Worker<SyncJobData> {
  const worker = new Worker<SyncJobData>(
    SYNC_QUEUE_NAME,
    async (job) => {
      const { userId, jobId } = job.data;
      logger.info({ userId, jobId, bullId: job.id }, "Processing sync job");
      await runSync(userId, jobId);
    },
    {
      connection: createRedis(),
      concurrency: 2,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.data.jobId }, "Sync worker job failed");
  });

  return worker;
}
