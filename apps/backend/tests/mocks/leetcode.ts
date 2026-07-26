import { vi } from "vitest";

/**
 * Stands in for `src/fetchers/leetcode.ts` — the only module that talks to
 * leetcode.com. Mocked globally so no test can accidentally hit the real site
 * (which would be slow, flaky, and a good way to get an IP blocked).
 */

// Declared without inline implementations so their inferred return type stays
// open — otherwise `mockResolvedValue("learner")` fails to type-check against
// an implementation that only ever returned null.
export const fetchProfile = vi.fn();
export const fetchSessionUsername = vi.fn();
export const describeSession = vi.fn();
export const fetchRecentAcSubmissions = vi.fn();
export const fetchAllSubmissions = vi.fn();
export const fetchQuestionMeta = vi.fn();

export function resetLeetcode(): void {
  fetchProfile.mockReset();
  fetchSessionUsername.mockReset().mockResolvedValue(null);
  describeSession.mockReset();
  fetchRecentAcSubmissions.mockReset().mockResolvedValue([]);
  fetchAllSubmissions.mockReset().mockResolvedValue([]);
  fetchQuestionMeta.mockReset().mockResolvedValue(null);
}

resetLeetcode();
