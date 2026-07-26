/**
 * A small in-memory Redis, standing in for `ioredis`.
 *
 * It implements enough for the cache (GET/SET with EX, INCR) and the sync
 * progress stream (PUBLISH/SUBSCRIBE) to run for real, so cache behaviour is
 * tested through the actual key layout rather than through a stub that always
 * says "miss".
 */

type MessageHandler = (channel: string, message: string) => void;

const store = new Map<string, string>();
const subscribers = new Map<string, Set<FakeRedis>>();

/** When set, every command rejects — used to prove the cache degrades safely. */
let failing = false;

function assertUp() {
  if (failing) throw new Error("Simulated Redis outage");
}

export class FakeRedis {
  private handlers: MessageHandler[] = [];
  private channels = new Set<string>();

  async get(key: string): Promise<string | null> {
    assertUp();
    return store.get(key) ?? null;
  }

  // Signature matches the `set(key, value, "EX", seconds)` form the cache uses.
  // TTLs are not simulated: nothing in the suite depends on wall-clock expiry.
  async set(key: string, value: string, ..._opts: unknown[]): Promise<"OK"> {
    assertUp();
    store.set(key, value);
    return "OK";
  }

  async incr(key: string): Promise<number> {
    assertUp();
    const next = Number(store.get(key) ?? 0) + 1;
    store.set(key, String(next));
    return next;
  }

  async del(...keys: string[]): Promise<number> {
    assertUp();
    let removed = 0;
    for (const k of keys) if (store.delete(k)) removed += 1;
    return removed;
  }

  async publish(channel: string, message: string): Promise<number> {
    assertUp();
    const subs = subscribers.get(channel);
    if (!subs) return 0;
    for (const sub of subs) sub.deliver(channel, message);
    return subs.size;
  }

  async subscribe(channel: string): Promise<number> {
    assertUp();
    this.channels.add(channel);
    let subs = subscribers.get(channel);
    if (!subs) subscribers.set(channel, (subs = new Set()));
    subs.add(this);
    return this.channels.size;
  }

  async unsubscribe(channel: string): Promise<number> {
    this.channels.delete(channel);
    subscribers.get(channel)?.delete(this);
    return this.channels.size;
  }

  on(event: string, handler: MessageHandler): this {
    if (event === "message") this.handlers.push(handler);
    return this;
  }

  async quit(): Promise<"OK"> {
    for (const channel of this.channels) subscribers.get(channel)?.delete(this);
    this.channels.clear();
    return "OK";
  }

  private deliver(channel: string, message: string): void {
    for (const handler of this.handlers) handler(channel, message);
  }
}

export const Redis = FakeRedis;
export default FakeRedis;

// --- Test controls ---

export function resetRedis(): void {
  store.clear();
  subscribers.clear();
  failing = false;
}

/** Simulates Redis being unreachable, so callers' fallbacks can be asserted. */
export function setRedisFailing(value: boolean): void {
  failing = value;
}

/** The raw keyspace, for asserting on key layout. */
export function redisKeys(): string[] {
  return [...store.keys()];
}
