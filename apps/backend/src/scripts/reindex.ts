/**
 * Rebuilds the vector store from Postgres for every user with synced data.
 *
 * Chunks are derived data, so dropping and regenerating the collection is
 * lossless. Use this when the HNSW index is damaged — a disk that fills up
 * mid-write leaves it in a state where every query fails with "Cannot return
 * the results in a contigious 2D array".
 *
 *   pnpm --filter @leetsense/backend reindex
 */
import "../config/load-env.js";
import { prisma } from "@leetsense/db";
import { logger } from "../lib/logger.js";
import { isGeminiConfigured } from "../lib/gemini.js";
import { resetCollection } from "../services/rag/vectorstore.js";
import { indexUserData } from "../services/rag/index.js";

async function main() {
  if (!isGeminiConfigured) {
    logger.error("GEMINI_API_KEY is not set — embeddings cannot be generated");
    process.exit(1);
  }

  logger.info("Dropping and recreating the collection…");
  await resetCollection();

  const users = await prisma.user.findMany({
    where: { submissions: { some: {} } },
    select: { id: true, leetcodeUsername: true },
  });
  logger.info({ users: users.length }, "Re-indexing users with synced data");

  let indexed = 0;
  for (const user of users) {
    try {
      const chunks = await indexUserData(user.id);
      indexed += chunks;
    } catch (err) {
      // One bad user shouldn't abort the whole rebuild.
      logger.error({ err, userId: user.id }, "Failed to re-index user");
    }
  }

  logger.info({ users: users.length, chunks: indexed }, "✅ Re-index complete");
  await prisma.$disconnect();
}

void main();
