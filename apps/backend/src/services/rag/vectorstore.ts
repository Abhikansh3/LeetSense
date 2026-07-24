import { ChromaClient, type IEmbeddingFunction } from "chromadb";
import { env } from "../../config/env.js";
import { embedText } from "../../lib/gemini.js";

const COLLECTION_NAME = "leetsense";

/** Bridges Chroma to Gemini embeddings so we never store vectors ourselves. */
class GeminiEmbeddingFunction implements IEmbeddingFunction {
  async generate(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => embedText(t)));
  }
}

const client = new ChromaClient({ path: env.CHROMA_URL });
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

/** Retrieves the most relevant chunks for a query, scoped to one user. */
export async function queryChunks(userId: string, query: string, nResults = 6): Promise<string[]> {
  const col = await collection();
  const res = await col.query({
    queryTexts: [query],
    nResults,
    where: { userId },
  });
  return (res.documents[0] ?? []).filter((d): d is string => d !== null);
}

/** Removes all of a user's chunks (e.g. before a full re-index). */
export async function deleteUserChunks(userId: string): Promise<void> {
  const col = await collection();
  await col.delete({ where: { userId } });
}
