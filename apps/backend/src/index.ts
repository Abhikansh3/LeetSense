import "./config/load-env.js"; // must be first: populates process.env from root .env
import type { Worker } from "bullmq";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { createSyncWorker } from "./queue/sync.worker.js";

const app = createApp();

const server = app.listen(env.BACKEND_PORT, () => {
  logger.info(`🚀 LeetSense backend listening on http://localhost:${env.BACKEND_PORT}`);
});

// `turbo run dev` only starts each package's `dev` script, which for the
// backend is the API alone. Without a worker, sync jobs queue up and never
// run — the UI just sits at 0%. Run one in-process in development so a plain
// `pnpm dev` works; production still uses the standalone worker process.
const runWorkerInProcess = env.WORKER_IN_PROCESS ?? env.NODE_ENV === "development";
let worker: Worker | null = null;
if (runWorkerInProcess) {
  worker = createSyncWorker();
  logger.info("👷 Sync worker running in-process (set WORKER_IN_PROCESS=false to disable)");
}

// Graceful shutdown
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down...`);
    void (async () => {
      await worker?.close();
      server.close(() => process.exit(0));
    })();
  });
}
