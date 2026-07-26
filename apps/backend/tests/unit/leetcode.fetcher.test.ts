import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The fetcher is mocked globally in `tests/setup.ts` so nothing else in the
 * suite touches leetcode.com. Here it is the thing under test, so the real
 * module is loaded and `fetch` is stubbed instead.
 */
const leetcode = await vi.importActual<typeof import("../../src/fetchers/leetcode.js")>(
  "../../src/fetchers/leetcode.js",
);

const fetchMock = vi.fn();

/** One GraphQL 200 with the given `data` payload. */
function respondWith(data: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ data }),
    text: async () => JSON.stringify({ data }),
  });
}

const CREDENTIALS = { session: "session-cookie-value", csrf: "csrf-token-value" };

function lastRequestHeaders(): Record<string, string> {
  return fetchMock.mock.calls.at(-1)![1].headers;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchProfile", () => {
  const profileResponse = {
    allQuestionsCount: [{ difficulty: "All", count: 3500 }],
    matchedUser: {
      username: "learner",
      profile: { realName: "Learner", ranking: 512_345, reputation: 4, userAvatar: "https://img" },
      submitStatsGlobal: {
        acSubmissionNum: [
          { difficulty: "All", count: 81, submissions: 100 },
          { difficulty: "Easy", count: 40, submissions: 45 },
          { difficulty: "Medium", count: 35, submissions: 40 },
          { difficulty: "Hard", count: 6, submissions: 15 },
        ],
        totalSubmissionNum: [{ difficulty: "All", count: 81, submissions: 200 }],
      },
      languageProblemCount: [{ languageName: "Python3", problemsSolved: 81 }],
      tagProblemCounts: {
        fundamental: [{ tagName: "Array", problemsSolved: 30 }],
        intermediate: [],
        advanced: [],
      },
      userCalendar: { streak: 12, totalActiveDays: 140 },
    },
  };

  it("maps the difficulty split out of LeetCode's array-of-counts shape", async () => {
    respondWith(profileResponse);

    const profile = await leetcode.fetchProfile("learner");

    expect(profile).toMatchObject({ totalSolved: 81, easySolved: 40, mediumSolved: 35, hardSolved: 6 });
  });

  it("derives acceptance rate from accepted over submitted", async () => {
    respondWith(profileResponse);

    expect((await leetcode.fetchProfile("learner")).acceptanceRate).toBe(50);
  });

  it("reports 0% rather than dividing by zero for an account with no submissions", async () => {
    respondWith({
      ...profileResponse,
      matchedUser: {
        ...profileResponse.matchedUser,
        submitStatsGlobal: {
          acSubmissionNum: [{ difficulty: "All", count: 0, submissions: 0 }],
          totalSubmissionNum: [{ difficulty: "All", count: 0, submissions: 0 }],
        },
      },
    });

    expect((await leetcode.fetchProfile("learner")).acceptanceRate).toBe(0);
  });

  it("throws a named error for a username LeetCode does not know", async () => {
    respondWith({ allQuestionsCount: [], matchedUser: null });

    await expect(leetcode.fetchProfile("ghost")).rejects.toThrow(/user "ghost" not found/);
  });

  it("copes with a profile that has no calendar or tag counts", async () => {
    respondWith({
      ...profileResponse,
      matchedUser: { ...profileResponse.matchedUser, userCalendar: null, tagProblemCounts: null },
    });

    const profile = await leetcode.fetchProfile("learner");

    expect(profile.streak).toBe(0);
    expect(profile.totalActiveDays).toBe(0);
    expect(profile.skillStats).toEqual({ fundamental: [], intermediate: [], advanced: [] });
  });

  it("surfaces a transport failure rather than returning empty stats", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "Forbidden" });

    await expect(leetcode.fetchProfile("learner")).rejects.toThrow(/403/);
  });

  it("surfaces GraphQL-level errors", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ errors: [{ message: "rate limited" }] }),
      text: async () => "",
    });

    await expect(leetcode.fetchProfile("learner")).rejects.toThrow(/rate limited/);
  });

  it("sends no cookie on the public path", async () => {
    respondWith(profileResponse);

    await leetcode.fetchProfile("learner");

    expect(lastRequestHeaders().Cookie).toBeUndefined();
  });
});

describe("describeSession", () => {
  it("does not call LeetCode at all when there are no cookies to check", async () => {
    const result = await leetcode.describeSession(null);

    expect(result).toEqual({ username: null, reason: "no-credentials" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the signed-in account", async () => {
    respondWith({ userStatus: { isSignedIn: true, username: "learner" } });

    expect(await leetcode.describeSession(CREDENTIALS)).toEqual({ username: "learner", reason: "ok" });
  });

  it("distinguishes an expired cookie from a refused request", async () => {
    respondWith({ userStatus: { isSignedIn: false, username: null } });
    expect((await leetcode.describeSession(CREDENTIALS)).reason).toBe("signed-out");

    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "blocked" });
    expect((await leetcode.describeSession(CREDENTIALS)).reason).toBe("blocked");
  });

  it("attaches the cookie pair and the CSRF header when authenticating", async () => {
    respondWith({ userStatus: { isSignedIn: true, username: "learner" } });

    await leetcode.describeSession(CREDENTIALS);

    const headers = lastRequestHeaders();
    expect(headers.Cookie).toBe("LEETCODE_SESSION=session-cookie-value; csrftoken=csrf-token-value");
    expect(headers["x-csrftoken"]).toBe("csrf-token-value");
  });

  it("keeps the cookie out of the failure detail it reports", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "blocked" });

    const { detail } = await leetcode.describeSession(CREDENTIALS);

    expect(detail).not.toContain("session-cookie-value");
  });
});

describe("fetchSessionUsername", () => {
  it("returns just the account name", async () => {
    respondWith({ userStatus: { isSignedIn: true, username: "learner" } });

    expect(await leetcode.fetchSessionUsername(CREDENTIALS)).toBe("learner");
  });

  it("returns null for anything that is not a signed-in session", async () => {
    respondWith({ userStatus: { isSignedIn: false, username: null } });

    expect(await leetcode.fetchSessionUsername(CREDENTIALS)).toBeNull();
  });
});

describe("fetchRecentAcSubmissions", () => {
  it("labels the language as unknown, since the public endpoint omits it", async () => {
    // Downstream code relies on this sentinel to keep an "unknown" bar off the
    // languages chart.
    respondWith({
      recentAcSubmissionList: [{ title: "Two Sum", titleSlug: "two-sum", timestamp: "1767000000" }],
    });

    const [submission] = await leetcode.fetchRecentAcSubmissions("learner", 100);

    expect(submission).toEqual({
      titleSlug: "two-sum",
      title: "Two Sum",
      timestamp: 1_767_000_000,
      lang: "unknown",
      statusDisplay: "Accepted",
    });
  });

  it("passes the requested limit through", async () => {
    respondWith({ recentAcSubmissionList: [] });

    await leetcode.fetchRecentAcSubmissions("learner", 100);

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).variables).toEqual({ username: "learner", limit: 100 });
  });
});

describe("fetchAllSubmissions", () => {
  const page = (hasNext: boolean, slug: string) => ({
    submissionList: {
      hasNext,
      submissions: [
        {
          title: "Two Sum",
          titleSlug: slug,
          statusDisplay: "Accepted",
          lang: "python3",
          timestamp: "1767000000",
          runtime: "52 ms",
          memory: "16.9 MB",
        },
      ],
    },
  });

  it("follows hasNext until the history runs out", async () => {
    respondWith(page(true, "two-sum"));
    respondWith(page(false, "valid-parentheses"));

    const all = await leetcode.fetchAllSubmissions(CREDENTIALS);

    expect(all.map((s) => s.titleSlug)).toEqual(["two-sum", "valid-parentheses"]);
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).variables.offset).toBe(20);
  });

  it("keeps only accepted submissions", async () => {
    respondWith({
      submissionList: {
        hasNext: false,
        submissions: [
          { title: "A", titleSlug: "a", statusDisplay: "Accepted", lang: "python3", timestamp: "1" },
          { title: "B", titleSlug: "b", statusDisplay: "Wrong Answer", lang: "python3", timestamp: "2" },
        ],
      },
    });

    expect((await leetcode.fetchAllSubmissions(CREDENTIALS)).map((s) => s.titleSlug)).toEqual(["a"]);
  });

  it("treats a null list as the expired cookie it is", async () => {
    // LeetCode answers 200 with no list rather than erroring, so this has to
    // be detected explicitly or the sync silently records zero submissions.
    respondWith({ submissionList: null });

    await expect(leetcode.fetchAllSubmissions(CREDENTIALS)).rejects.toThrow(/expired or invalid/);
  });

  it("stops at the page cap instead of looping forever", async () => {
    for (let i = 0; i < 120; i++) respondWith(page(true, `problem-${i}`));

    const all = await leetcode.fetchAllSubmissions(CREDENTIALS);

    expect(fetchMock).toHaveBeenCalledTimes(100);
    expect(all).toHaveLength(100);
  });
});

describe("fetchQuestionMeta", () => {
  it("normalises difficulty to the enum casing the database uses", async () => {
    respondWith({
      question: {
        questionId: "1",
        title: "Two Sum",
        titleSlug: "two-sum",
        difficulty: "Easy",
        topicTags: [{ name: "Array" }, { name: "Hash Table" }],
      },
    });

    expect(await leetcode.fetchQuestionMeta("two-sum")).toEqual({
      questionId: "1",
      title: "Two Sum",
      titleSlug: "two-sum",
      difficulty: "EASY",
      tags: ["Array", "Hash Table"],
    });
  });

  it("returns null for a slug LeetCode does not have", async () => {
    respondWith({ question: null });

    expect(await leetcode.fetchQuestionMeta("not-a-problem")).toBeNull();
  });

  it("returns null rather than throwing when the lookup fails", async () => {
    // One unresolvable problem must not abort a whole sync.
    fetchMock.mockRejectedValueOnce(new Error("network reset"));

    expect(await leetcode.fetchQuestionMeta("two-sum")).toBeNull();
  });
});
