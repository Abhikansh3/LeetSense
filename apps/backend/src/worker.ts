/**
 * Standalone worker process. Run separately from the API so background jobs
 * don't compete with request handling: `pnpm --filter @leetsense/backend worker`.
 */
import "./config/load-env.js"; // must be first: populates process.env from root .env
import { createSyncWorker } from "./queue/sync.worker.js";
import { logger } from "./lib/logger.js";

const worker = createSyncWorker();
logger.info("👷 LeetSense sync worker started");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    logger.info(`${signal} received, closing worker...`);
    await worker.close();
    process.exit(0);
  });
}
