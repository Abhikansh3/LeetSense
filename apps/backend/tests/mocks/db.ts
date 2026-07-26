import { vi } from "vitest";

/**
 * Stands in for `@leetsense/db`. Tests program the queries they expect
 * (`prisma.user.findUnique.mockResolvedValue(...)`) and assert on the
 * arguments the code passed — which is where the interesting behaviour lives:
 * user scoping, `distinct`, cursor pagination, transactional deletes.
 *
 * The enums are re-declared rather than imported so the suite doesn't depend
 * on `prisma generate` having been run.
 */

function model() {
  return {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  };
}

export const prisma = {
  user: model(),
  refreshToken: model(),
  problem: model(),
  submission: model(),
  profileSnapshot: model(),
  syncJob: model(),
  chatMessage: model(),
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
};

export const Difficulty = { EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD" } as const;

export const SyncStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

/** Namespace placeholder — the real one is only used for types at runtime-erased positions. */
export const Prisma = {};

const models = [
  prisma.user,
  prisma.refreshToken,
  prisma.problem,
  prisma.submission,
  prisma.profileSnapshot,
  prisma.syncJob,
  prisma.chatMessage,
];

export function resetDb(): void {
  for (const m of models) {
    for (const fn of Object.values(m)) fn.mockReset();
  }
  prisma.$queryRaw.mockReset();
  // Default: run the batched operations, mirroring a real transaction's
  // "all of them, or none" from the caller's point of view.
  prisma.$transaction.mockReset();
  prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
}

resetDb();
