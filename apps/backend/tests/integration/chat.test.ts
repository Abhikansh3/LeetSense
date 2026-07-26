import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, authHeader } from "../helpers/app.js";
import { prisma } from "../mocks/db.js";
import { collection, setRetrievedDocuments } from "../mocks/chromadb.js";
import { generateContent } from "../mocks/gemini.js";

const GROUNDED_CHUNK = "Overall progress: 81 problems solved in total. These totals are authoritative.";

describe("POST /api/chat", () => {
  beforeEach(() => {
    prisma.chatMessage.createMany.mockResolvedValue({ count: 2 });
  });

  it("requires authentication", async () => {
    const res = await request(app).post("/api/chat").send({ question: "How am I doing?" });

    expect(res.status).toBe(401);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("answers with the retrieved context as its sources", async () => {
    setRetrievedDocuments([GROUNDED_CHUNK]);

    const res = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader())
      .send({ question: "How many problems have I solved?" });

    expect(res.status).toBe(200);
    expect(res.body.answer).toBe("A mock grounded answer.");
    expect(res.body.sources).toEqual([GROUNDED_CHUNK]);
  });

  it("puts the retrieved context in the prompt it sends the model", async () => {
    setRetrievedDocuments([GROUNDED_CHUNK]);

    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader())
      .send({ question: "How many problems have I solved?" });

    const prompt = generateContent.mock.calls[0]![0] as string;
    expect(prompt).toContain(GROUNDED_CHUNK);
    expect(prompt).toContain("How many problems have I solved?");
  });

  it("retrieves only the asking user's chunks", async () => {
    await request(app).post("/api/chat").set("Authorization", authHeader("user-7")).send({ question: "hi" });

    expect(collection.query).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-7" } }));
  });

  it("persists both turns of the conversation", async () => {
    await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader())
      .send({ question: "How am I doing?" });

    expect(prisma.chatMessage.createMany).toHaveBeenCalledWith({
      data: [
        { userId: "user-1", role: "user", content: "How am I doing?" },
        { userId: "user-1", role: "assistant", content: "A mock grounded answer." },
      ],
    });
  });

  it("tells the model there is no data rather than inventing context", async () => {
    setRetrievedDocuments([]);

    const res = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader())
      .send({ question: "How many problems have I solved?" });

    expect(res.status).toBe(200);
    expect(res.body.sources).toEqual([]);
    expect(generateContent.mock.calls[0]![0]).toContain("No synced data is available");
  });

  /**
   * `queryChunks` swallows vector-store failures by design, so a damaged index
   * degrades to an ungrounded answer instead of 500-ing the endpoint. This is
   * the behaviour that guarantee describes.
   */
  it("still answers when the vector store is broken", async () => {
    collection.query.mockRejectedValue(new Error("Cannot return the results in a contigious 2D array"));

    const res = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader())
      .send({ question: "How am I doing?" });

    expect(res.status).toBe(200);
    expect(res.body.sources).toEqual([]);
  });

  it("rejects an empty question", async () => {
    const res = await request(app).post("/api/chat").set("Authorization", authHeader()).send({ question: "" });

    expect(res.status).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("rejects a question past the length limit", async () => {
    const res = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader())
      .send({ question: "x".repeat(1001) });

    expect(res.status).toBe(400);
  });

  it("rejects a request with no question field", async () => {
    expect((await request(app).post("/api/chat").set("Authorization", authHeader()).send({})).status).toBe(400);
  });

  it("returns 500 rather than a fabricated answer when the model itself fails", async () => {
    generateContent.mockRejectedValue(new Error("429 quota exceeded"));

    const res = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader())
      .send({ question: "How am I doing?" });

    expect(res.status).toBe(500);
    expect(prisma.chatMessage.createMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/chat/history", () => {
  it("returns the caller's messages oldest-first", async () => {
    prisma.chatMessage.findMany.mockResolvedValue([
      { id: "m-1", role: "user", content: "hi" },
      { id: "m-2", role: "assistant", content: "hello" },
    ]);

    const res = await request(app).get("/api/chat/history").set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/api/chat/history")).status).toBe(401);
  });
});
