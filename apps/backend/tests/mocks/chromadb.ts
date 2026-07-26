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

/**
 * Records how the client was constructed, so the cloud/self-hosted choice is
 * assertable. Held on globalThis rather than in module scope because the tests
 * that exercise that choice reset the module registry, which would otherwise
 * hand the test and the code under test two different arrays.
 */
export const constructed: { kind: "local" | "cloud"; params: unknown }[] = ((
  globalThis as { __chromaConstructed?: { kind: "local" | "cloud"; params: unknown }[] }
).__chromaConstructed ??= []);

export class ChromaClient {
  getOrCreateCollection = getOrCreateCollection;
  deleteCollection = deleteCollection;

  constructor(params?: unknown) {
    constructed.push({ kind: "local", params });
  }
}

export class CloudClient extends ChromaClient {
  constructor(params?: unknown) {
    super();
    constructed.pop(); // the super() call recorded a local client
    constructed.push({ kind: "cloud", params });
  }
}

export function resetChroma(): void {
  constructed.length = 0;
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
