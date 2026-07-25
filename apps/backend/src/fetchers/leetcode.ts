import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

const LEETCODE_GRAPHQL = "https://leetcode.com/graphql";

export interface SkillTag {
  tagName: string;
  problemsSolved: number;
}

export interface LeetCodeProfile {
  username: string;
  realName?: string;
  avatar?: string;
  ranking?: number;
  reputation?: number;
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;

  // Whole-history aggregates. These come from the public profile query, so they
  // are accurate for any username without a session cookie — unlike the
  // submission list, which is capped at ~20 recent solves.
  totalQuestions: number;
  acceptanceRate: number;
  streak: number;
  totalActiveDays: number;
  languageStats: { languageName: string; problemsSolved: number }[];
  skillStats: { fundamental: SkillTag[]; intermediate: SkillTag[]; advanced: SkillTag[] };
  submissionStats: {
    accepted: number;
    submitted: number;
    byDifficulty: { difficulty: string; accepted: number; submitted: number }[];
  };
}

export interface RawSubmission {
  titleSlug: string;
  title: string;
  timestamp: number; // unix seconds
  lang: string;
  statusDisplay: string;
  runtime?: string;
  memory?: string;
}

export interface QuestionMeta {
  questionId: string;
  titleSlug: string;
  title: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags: string[];
}

/**
 * A user's own LeetCode cookies. Passed per call rather than read from the
 * environment so each user's sync runs under their own credentials — a single
 * global cookie can only ever fetch one person's history.
 */
export interface LeetCodeCredentials {
  session: string;
  csrf: string;
}

/** Falls back to the env cookie, which only exists for single-user setups. */
function resolveCredentials(creds?: LeetCodeCredentials | null): LeetCodeCredentials | null {
  if (creds?.session && creds.csrf) return creds;
  if (env.LEETCODE_SESSION && env.LEETCODE_CSRF) {
    return { session: env.LEETCODE_SESSION, csrf: env.LEETCODE_CSRF };
  }
  return null;
}

/** Low-level GraphQL call. Attaches the caller's LeetCode cookies when given. */
async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
  creds?: LeetCodeCredentials | null,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Referer: "https://leetcode.com",
    Origin: "https://leetcode.com",
    // LeetCode's edge rejects or challenges unfamiliar clients, and an
    // authenticated session sent with a non-browser agent is the case it
    // treats most harshly — so present as a normal browser.
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };

  const auth = resolveCredentials(creds);
  if (auth) {
    headers.Cookie = `LEETCODE_SESSION=${auth.session}; csrftoken=${auth.csrf}`;
    headers["x-csrftoken"] = auth.csrf;
  }

  const res = await fetch(LEETCODE_GRAPHQL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`LeetCode GraphQL ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) {
    throw new Error(`LeetCode GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

/** Fetches public profile + aggregate solved counts. */
export async function fetchProfile(username: string): Promise<LeetCodeProfile> {
  const query = /* GraphQL */ `
    query userProfile($username: String!) {
      allQuestionsCount { difficulty count }
      matchedUser(username: $username) {
        username
        profile { realName ranking reputation userAvatar }
        submitStatsGlobal {
          acSubmissionNum { difficulty count submissions }
          totalSubmissionNum { difficulty count submissions }
        }
        languageProblemCount { languageName problemsSolved }
        tagProblemCounts {
          fundamental { tagName problemsSolved }
          intermediate { tagName problemsSolved }
          advanced { tagName problemsSolved }
        }
        userCalendar { streak totalActiveDays }
      }
    }
  `;

  type Count = { difficulty: string; count: number; submissions: number };
  type Resp = {
    allQuestionsCount: { difficulty: string; count: number }[];
    matchedUser: {
      username: string;
      profile: { realName?: string; ranking?: number; reputation?: number; userAvatar?: string };
      submitStatsGlobal: { acSubmissionNum: Count[]; totalSubmissionNum: Count[] };
      languageProblemCount: { languageName: string; problemsSolved: number }[];
      tagProblemCounts: { fundamental: SkillTag[]; intermediate: SkillTag[]; advanced: SkillTag[] };
      userCalendar: { streak: number; totalActiveDays: number } | null;
    } | null;
  };

  const data = await gql<Resp>(query, { username });
  if (!data.matchedUser) throw new Error(`LeetCode user "${username}" not found`);

  const m = data.matchedUser;
  const ac = m.submitStatsGlobal.acSubmissionNum;
  const total = m.submitStatsGlobal.totalSubmissionNum;
  const by = (d: string) => ac.find((s) => s.difficulty === d)?.count ?? 0;

  const accepted = ac.find((s) => s.difficulty === "All")?.submissions ?? 0;
  const submitted = total.find((s) => s.difficulty === "All")?.submissions ?? 0;

  return {
    username: m.username,
    realName: m.profile.realName,
    avatar: m.profile.userAvatar,
    ranking: m.profile.ranking,
    reputation: m.profile.reputation,
    totalSolved: by("All"),
    easySolved: by("Easy"),
    mediumSolved: by("Medium"),
    hardSolved: by("Hard"),
    totalQuestions: data.allQuestionsCount.find((q) => q.difficulty === "All")?.count ?? 0,
    acceptanceRate: submitted > 0 ? (accepted / submitted) * 100 : 0,
    streak: m.userCalendar?.streak ?? 0,
    totalActiveDays: m.userCalendar?.totalActiveDays ?? 0,
    languageStats: m.languageProblemCount ?? [],
    skillStats: {
      fundamental: m.tagProblemCounts?.fundamental ?? [],
      intermediate: m.tagProblemCounts?.intermediate ?? [],
      advanced: m.tagProblemCounts?.advanced ?? [],
    },
    submissionStats: {
      accepted,
      submitted,
      byDifficulty: ["Easy", "Medium", "Hard"].map((d) => ({
        difficulty: d,
        accepted: ac.find((s) => s.difficulty === d)?.submissions ?? 0,
        submitted: total.find((s) => s.difficulty === d)?.submissions ?? 0,
      })),
    },
  };
}

/**
 * Which LeetCode account a set of cookies belongs to, or null when they are
 * absent, expired or rejected. The authenticated submission history is scoped
 * to this account and no other, so callers must check it before trusting a
 * cookie to fetch a given username's data.
 */
export async function fetchSessionUsername(creds?: LeetCodeCredentials | null): Promise<string | null> {
  return (await describeSession(creds)).username;
}

/**
 * Same check, but reports *why* it failed so the UI can say something more
 * useful than "rejected". Distinguishes a cookie LeetCode considers signed
 * out from a request LeetCode refused to serve at all.
 */
export async function describeSession(
  creds?: LeetCodeCredentials | null,
): Promise<{ username: string | null; reason: "ok" | "no-credentials" | "signed-out" | "blocked"; detail?: string }> {
  if (!resolveCredentials(creds)) return { username: null, reason: "no-credentials" };

  const query = /* GraphQL */ `
    query globalData {
      userStatus {
        isSignedIn
        username
      }
    }
  `;
  type Resp = { userStatus: { isSignedIn: boolean; username: string | null } | null };

  try {
    const data = await gql<Resp>(query, {}, creds);
    if (!data.userStatus?.isSignedIn || !data.userStatus.username) {
      return { username: null, reason: "signed-out" };
    }
    return { username: data.userStatus.username, reason: "ok" };
  } catch (err) {
    // Never log the cookie itself — only the transport-level failure.
    const detail = err instanceof Error ? err.message.slice(0, 200) : "unknown error";
    logger.warn({ detail }, "LeetCode refused the session check");
    return { username: null, reason: "blocked", detail };
  }
}

/** Public: last N accepted submissions (no auth needed, capped ~20). */
export async function fetchRecentAcSubmissions(
  username: string,
  limit = 20,
): Promise<RawSubmission[]> {
  const query = /* GraphQL */ `
    query recentAc($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) {
        title titleSlug timestamp
      }
    }
  `;
  type Resp = {
    recentAcSubmissionList: { title: string; titleSlug: string; timestamp: string }[];
  };
  const data = await gql<Resp>(query, { username, limit });
  return data.recentAcSubmissionList.map((s) => ({
    titleSlug: s.titleSlug,
    title: s.title,
    timestamp: Number(s.timestamp),
    lang: "unknown",
    statusDisplay: "Accepted",
  }));
}

/**
 * Authenticated: full paginated submission history (needs LEETCODE_SESSION).
 *
 * NOTE: this endpoint takes no username — it always returns the history of
 * whoever owns the configured cookie. Only call it for that account (see
 * `fetchSessionUsername`), never as a generic per-user fetch.
 */
export async function fetchAllSubmissions(creds?: LeetCodeCredentials | null): Promise<RawSubmission[]> {
  const query = /* GraphQL */ `
    query submissions($offset: Int!, $limit: Int!) {
      submissionList(offset: $offset, limit: $limit) {
        hasNext
        submissions { title titleSlug status statusDisplay lang timestamp runtime memory }
      }
    }
  `;
  type Resp = {
    submissionList: {
      hasNext: boolean;
      submissions: {
        title: string;
        titleSlug: string;
        statusDisplay: string;
        lang: string;
        timestamp: string;
        runtime?: string;
        memory?: string;
      }[];
    };
  };

  const all: RawSubmission[] = [];
  let offset = 0;
  const limit = 20;
  // Safety cap so a huge history can't loop forever.
  for (let page = 0; page < 100; page++) {
    const data = await gql<Resp>(query, { offset, limit }, creds);
    const list = data.submissionList;
    // LeetCode returns a null list rather than an error for an expired cookie.
    if (!list) {
      throw new Error("LeetCode returned no submission list — the session cookie is expired or invalid");
    }
    for (const s of list.submissions) {
      if (s.statusDisplay !== "Accepted") continue;
      all.push({
        titleSlug: s.titleSlug,
        title: s.title,
        timestamp: Number(s.timestamp),
        lang: s.lang,
        statusDisplay: s.statusDisplay,
        runtime: s.runtime,
        memory: s.memory,
      });
    }
    if (!list.hasNext) break;
    offset += limit;
  }
  return all;
}

/** Difficulty + topic tags for a single problem. */
export async function fetchQuestionMeta(titleSlug: string): Promise<QuestionMeta | null> {
  const query = /* GraphQL */ `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId title titleSlug difficulty
        topicTags { name }
      }
    }
  `;
  type Resp = {
    question: {
      questionId: string;
      title: string;
      titleSlug: string;
      difficulty: string;
      topicTags: { name: string }[];
    } | null;
  };
  try {
    const data = await gql<Resp>(query, { titleSlug });
    if (!data.question) return null;
    return {
      questionId: data.question.questionId,
      titleSlug: data.question.titleSlug,
      title: data.question.title,
      difficulty: data.question.difficulty.toUpperCase() as QuestionMeta["difficulty"],
      tags: data.question.topicTags.map((t) => t.name),
    };
  } catch (err) {
    logger.warn({ err, titleSlug }, "Failed to fetch question meta");
    return null;
  }
}
