"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/charts";
import { CheckIcon } from "@/components/icons";

/**
 * Lets a user connect their own LeetCode session so their sync can read their
 * full submission history rather than the ~20 solves the public endpoint
 * returns. The cookies are sent once, encrypted server-side, and never read
 * back — the UI only ever learns whether one is on file.
 */
export function LeetCodeSessionCard({ onChange }: { onChange?: () => void }) {
  const { user, refreshUser } = useAuth();
  const [session, setSession] = useState("");
  const [csrf, setCsrf] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedTo, setLinkedTo] = useState<string | null>(null);

  const connected = user?.hasLeetcodeSession ?? false;

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ username: string }>("/auth/leetcode-session", {
        method: "PUT",
        json: { session: session.trim(), csrf: csrf.trim() },
      });
      setLinkedTo(res.username);
      setSession("");
      setCsrf("");
      await refreshUser();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify those cookies");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await api("/auth/leetcode-session", { method: "DELETE" });
      setLinkedTo(null);
      await refreshUser();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not disconnect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Full history access"
      right={
        connected ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-easy)]">
            <CheckIcon size={13} /> Connected
          </span>
        ) : (
          <span className="text-xs text-[var(--color-faint)]">Optional</span>
        )
      }
    >
      {connected ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-muted)]">
            Your LeetCode session is stored encrypted, so syncs pull your complete submission history instead of just
            recent solves.
            {linkedTo && <> Verified as <span className="font-medium text-[var(--color-text)]">@{linkedTo}</span>.</>}
          </p>
          <button onClick={disconnect} disabled={busy} className="btn btn-secondary">
            {busy ? "Removing…" : "Disconnect"}
          </button>
        </div>
      ) : (
        <form onSubmit={connect} className="space-y-3">
          <p className="text-sm text-[var(--color-muted)]">
            Without this, LeetCode&apos;s public API only returns your ~20 most recent solves. Connect your own session
            to sync everything.
          </p>

          <details className="text-sm">
            <summary className="cursor-pointer text-[var(--color-accent)]">Where do I find these?</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-[var(--color-muted)]">
              <li>Sign in to leetcode.com in your browser.</li>
              <li>
                Open DevTools → Application → Cookies → <code className="num">https://leetcode.com</code>.
              </li>
              <li>
                Copy the values of <code className="num">LEETCODE_SESSION</code> and{" "}
                <code className="num">csrftoken</code>.
              </li>
            </ol>
            <p className="mt-2 text-[13px] text-[var(--color-faint)]">
              These grant access to your LeetCode account. They&apos;re encrypted before storage and never sent back to
              the browser — but treat them like a password, and disconnect when you&apos;re done.
            </p>
          </details>

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-[var(--color-muted)]">LEETCODE_SESSION</span>
            <input
              type="password"
              value={session}
              onChange={(e) => setSession(e.target.value)}
              placeholder="eyJhbGciOi…"
              autoComplete="off"
              required
              className="input num"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-[var(--color-muted)]">csrftoken</span>
            <input
              type="password"
              value={csrf}
              onChange={(e) => setCsrf(e.target.value)}
              placeholder="A1b2C3…"
              autoComplete="off"
              required
              className="input num"
            />
          </label>

          {error && (
            <p className="rounded-lg border border-[var(--color-hard)]/30 bg-[var(--color-hard)]/10 px-3 py-2 text-sm text-[var(--color-hard)]">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy || !session.trim() || !csrf.trim()} className="btn btn-primary">
            {busy ? "Verifying…" : "Connect"}
          </button>
        </form>
      )}
    </Card>
  );
}
