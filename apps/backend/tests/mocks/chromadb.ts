import { vi } from "vitest";

/**
 * Stands in for `chromadb`. Mocking the client rather than our own
 * `vectorstore.ts` keeps that module's real behaviour under test — in
 * particular its promise that a damaged index degrades to an ungrounded answer
 * instead of a 500, which is easiest to prove by making the client throw.
 */

export const collection = {
  upsert: vi.fn(async () => undefined),
  query: vi.fn(async () => ({ documents: [[]] as (string | null)[][] })),
  delete: vi.fn(async () => undefined),
};

export const getOrCreateCollection = vi.fn(async () => collection);
export const deleteCollection = vi.fn(async () => undefined);

export class ChromaClient {
  getOrCreateCollection = getOrCreateCollection;
  deleteCollection = deleteCollection;
}

export function resetChroma(): void {
  collection.upsert.mockReset().mockResolvedValue(undefined);
  collection.query.mockReset().mockResolvedValue({ documents: [[]] });
  collection.delete.mockReset().mockResolvedValue(undefined);
  getOrCreateCollection.mockReset().mockResolvedValue(collection);
  deleteCollection.mockReset().mockResolvedValue(undefined);
}

/** Makes the next queries return these documents as the top-k hits. */
export function setRetrievedDocuments(documents: string[]): void {
  collection.query.mockResolvedValue({ documents: [documents] });
}
