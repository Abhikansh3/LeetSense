import { vi } from "vitest";

/** Stands in for `@google/generative-ai` — no API key, no quota, no latency. */

// Implementations are installed by `resetGemini` rather than inline, so the
// inferred argument and return types stay open for per-test overrides.
export const generateContent = vi.fn();

export const embedContent = vi.fn();

export const getGenerativeModel = vi.fn(() => ({ generateContent, embedContent }));

export class GoogleGenerativeAI {
  getGenerativeModel = getGenerativeModel;
}

export function resetGemini(): void {
  generateContent.mockReset().mockResolvedValue({ response: { text: () => "A mock grounded answer." } });
  embedContent.mockReset().mockResolvedValue({ embedding: { values: [0.1, 0.2, 0.3] } });
  getGenerativeModel.mockReset().mockReturnValue({ generateContent, embedContent });
}

resetGemini();
