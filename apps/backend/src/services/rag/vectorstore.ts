import { ChromaClient, CloudClient, type IEmbeddingFunction } from "chromadb";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { embedText } from "../../lib/gemini.js";

const COLLECTION_NAME = "leetsense";

/** Bridges Chroma to Gemini embeddings so we never store vectors ourselves. */
class GeminiEmbeddingFunction implements IEmbeddingFunction {
  async generate(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => embedText(t)));
  }
}

/**
 * Chroma Cloud when an API key is configured, otherwise a self-hosted server
 * at CHROMA_URL. The cloud credentials were declared in the environment schema
 * from the start but were never actually read here, so setting them silently
 * did nothing and the client kept talking to localhost.
 */
const client = env.CHROMA_API_KEY
  ? new CloudClient({
      apiKey: env.CHROMA_API_KEY,
      tenant: env.CHROMA_TENANT,
      database: env.CHROMA_DATABASE,
    })
  : new ChromaClient({ path: env.CHROMA_URL });

const embeddingFunction = new GeminiEmbeddingFunction();

async function collection() {
  return client.getOrCreateCollection({ name: COLLECTION_NAME, embeddingFunction });
}

export interface Chunk {
  id: string;
  document: string;
  metadata: Record<string, string | number | boolean>;
}

/** Upserts a user's context chunks into the shared collection. */
export async function upsertChunks(userId: string, chunks: Chunk[]): Promise<void> {
  if (chunks.length === 0) return;
  const col = await collection();
  await col.upsert({
    ids: chunks.map((c) => c.id),
    documents: chunks.map((c) => c.document),
    metadatas: chunks.map((c) => ({ ...c.metadata, userId })),
  });
}

/**
 * Retrieves the most relevant chunks for a query, scoped to one user.
 *
 * Retrieval is best-effort: if the vector store is unavailable or its HNSW
 * index is damaged (a full disk mid-write will do it, surfacing as "Cannot
 * return the results in a contigious 2D array"), chat should fall back to an
 * ungrounded answer rather than returning a 500. Rebuild with reindexAll().
 */
export async function queryChunks(userId: string, query: string, nResults = 6): Promise<string[]> {
  try {
    const col = await collection();
    const res = await col.query({
      queryTexts: [query],
      nResults,
      where: { userId },
    });
    return (res.documents[0] ?? []).filter((d): d is string => d !== null);
  } catch (err) {
    logger.error({ err, userId }, "Vector search failed — answering without retrieved context");
    return [];
  }
}

/**
 * Drops and recreates the collection. The chunks are derived from Postgres, so
 * this is lossless once every user is re-indexed — the recovery path for a
 * corrupted index.
 */
export async function resetCollection(): Promise<void> {
  try {
    await client.deleteCollection({ name: COLLECTION_NAME });
  } catch {
    // Nothing to delete on a fresh install.
  }
  await client.getOrCreateCollection({ name: COLLECTION_NAME, embeddingFunction });
}

/** Removes all of a user's chunks (e.g. before a full re-index). */
export async function deleteUserChunks(userId: string): Promise<void> {
  const col = await collection();
  await col.delete({ where: { userId } });
}
