import { vi } from "vitest";

/**
 * Stands in for `bullmq`. `src/queue/sync.queue.ts` constructs a Queue at
 * import time, so this exists mainly to keep that import from opening a
 * connection — and to let the sync tests assert what was enqueued without
 * running a worker.
 */

export const queueAdd = vi.fn(async (name: string, data: unknown) => ({ id: "bull-job-1", name, data }));

export class Queue {
  add = queueAdd;
  async close(): Promise<void> {}
}

export class Worker {
  constructor(
    public name: string,
    public processor: unknown,
    public opts: unknown,
  ) {}
  on(): this {
    return this;
  }
  async close(): Promise<void> {}
}

export function resetQueue(): void {
  queueAdd.mockReset().mockResolvedValue({ id: "bull-job-1", name: "sync", data: {} });
}
