import "./config/load-env.js"; // must be first: populates process.env from root .env
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

const app = createApp();

const server = app.listen(env.BACKEND_PORT, () => {
  logger.info(`🚀 LeetSense backend listening on http://localhost:${env.BACKEND_PORT}`);
});

// Graceful shutdown
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down...`);
    server.close(() => process.exit(0));
  });
}
