import { afterEach, describe, expect, it, vi } from "vitest";
import { collection, getOrCreateCollection, setRetrievedDocuments } from "../mocks/chromadb.js";
import { deleteUserChunks, queryChunks, upsertChunks } from "../../src/services/rag/vectorstore.js";

/**
 * Which client the module builds is decided once at import from the
 * environment, so each case needs a fresh module graph.
 */
async function clientFor(envOverrides: Record<string, string>) {
  const original = { ...process.env };
  Object.assign(process.env, envOverrides);
  vi.resetModules();
  try {
    const chroma = await import("../mocks/chromadb.js");
    chroma.resetChroma();
    await import("../../src/services/rag/vectorstore.js");
    return chroma.constructed.at(-1)!;
  } finally {
    process.env = original;
  }
}

describe("vector store client selection", () => {
  afterEach(() => vi.resetModules());

  it("talks to a self-hosted server when no cloud key is set", async () => {
    const client = await clientFor({ CHROMA_API_KEY: "", CHROMA_URL: "http://localhost:8000" });

    expect(client.kind).toBe("local");
    expect(client.params).toMatchObject({ path: "http://localhost:8000" });
  });

  /**
   * CHROMA_API_KEY / TENANT / DATABASE were declared in the environment schema
   * and documented in .env.example from the start, but nothing read them —
   * setting them silently did nothing and the client kept talking to
   * localhost.
   */
  it("uses Chroma Cloud when an API key is configured", async () => {
    const client = await clientFor({
      CHROMA_API_KEY: "ck-test-key",
      CHROMA_TENANT: "tenant-id",
      CHROMA_DATABASE: "leetsense",
    });

    expect(client.kind).toBe("cloud");
    expect(client.params).toMatchObject({
      apiKey: "ck-test-key",
      tenant: "tenant-id",
      database: "leetsense",
    });
  });
});

describe("vector store retrieval", () => {
  it("scopes the search to the asking user", async () => {
    await queryChunks("user-1", "how many have I solved?", 6);

    expect(collection.query).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" }, nResults: 6 }),
    );
  });

  it("returns the retrieved documents", async () => {
    setRetrievedDocuments(["Overall progress: 81 problems solved in total."]);

    expect(await queryChunks("user-1", "progress")).toEqual([
      "Overall progress: 81 problems solved in total.",
    ]);
  });

  it("drops null entries Chroma pads results with", async () => {
    collection.query.mockResolvedValue({ documents: [["a chunk", null, "another chunk"]] });

    expect(await queryChunks("user-1", "progress")).toEqual(["a chunk", "another chunk"]);
  });

  /**
   * The documented contract: retrieval is best-effort. A damaged HNSW index
   * (a full disk mid-write surfaces as "Cannot return the results in a
   * contigious 2D array") must degrade chat to an ungrounded answer, never
   * 500 the endpoint. Recovery is the `reindex` script.
   */
  it("degrades to no context when the index is damaged", async () => {
    collection.query.mockRejectedValue(new Error("Cannot return the results in a contigious 2D array"));

    await expect(queryChunks("user-1", "progress")).resolves.toEqual([]);
  });

  it("degrades to no context when the vector store is unreachable", async () => {
    getOrCreateCollection.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(queryChunks("user-1", "progress")).resolves.toEqual([]);
  });
});

describe("vector store writes", () => {
  it("stamps every chunk with its owner so retrieval can filter by user", async () => {
    await upsertChunks("user-1", [
      { id: "user-1:profile", document: "…", metadata: { kind: "profile" } },
    ]);

    expect(collection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: ["user-1:profile"],
        metadatas: [{ kind: "profile", userId: "user-1" }],
      }),
    );
  });

  it("does not call Chroma at all for an empty chunk list", async () => {
    await upsertChunks("user-1", []);

    expect(getOrCreateCollection).not.toHaveBeenCalled();
  });

  it("deletes only the named user's chunks", async () => {
    await deleteUserChunks("user-1");

    expect(collection.delete).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });
});
