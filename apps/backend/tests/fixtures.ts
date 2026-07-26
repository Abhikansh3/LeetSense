/** Shared row shapes, so each test only states the field it cares about. */

export function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: "snap-1",
    userId: "user-1",
    totalSolved: 81,
    easySolved: 40,
    mediumSolved: 35,
    hardSolved: 6,
    ranking: 512_345,
    reputation: 0,
    capturedAt: new Date("2026-07-01T00:00:00.000Z"),
    totalQuestions: 3500,
    acceptanceRate: 62.5,
    streak: 12,
    totalActiveDays: 140,
    languageStats: [
      { languageName: "Python3", problemsSolved: 60 },
      { languageName: "TypeScript", problemsSolved: 21 },
    ],
    skillStats: {
      fundamental: [
        { tagName: "Array", problemsSolved: 30 },
        { tagName: "String", problemsSolved: 12 },
      ],
      intermediate: [{ tagName: "Binary Search", problemsSolved: 8 }],
      advanced: [{ tagName: "Dynamic Programming", problemsSolved: 2 }],
    },
    submissionStats: { accepted: 81, submitted: 130 },
    ...overrides,
  };
}

export function makeProblem(overrides: Record<string, unknown> = {}) {
  return {
    id: "problem-1",
    titleSlug: "two-sum",
    questionId: "1",
    title: "Two Sum",
    difficulty: "EASY",
    tags: ["Array", "Hash Table"],
    acRate: 49.1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

export function makeSubmission(overrides: Record<string, unknown> = {}) {
  const problem = (overrides.problem as ReturnType<typeof makeProblem>) ?? makeProblem();
  return {
    id: "submission-1",
    userId: "user-1",
    problemId: problem.id,
    lang: "python3",
    statusDisplay: "Accepted",
    timestamp: new Date("2026-07-01T10:00:00.000Z"),
    runtime: "52 ms",
    memory: "16.9 MB",
    createdAt: new Date("2026-07-01T10:00:01.000Z"),
    ...overrides,
    problem,
  };
}

export function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "learner@example.com",
    passwordHash: "$2a$12$notarealhash",
    name: "Learner",
    leetcodeUsername: "learner",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    leetcodeSessionEnc: null,
    leetcodeCsrfEnc: null,
    ...overrides,
  };
}
