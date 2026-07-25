"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getAccessToken, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { markOnboardingSkipped } from "@/lib/onboarding";
import { LogoMark, SyncIcon, CheckIcon, ArrowRightIcon } from "@/components/icons";
import { BackgroundBlobs } from "@/components/BackgroundBlobs";

interface Progress {
  stage: string;
  label?: string;
  progress: number;
  error?: string;
}

/**
 * First-run flow: link a LeetCode handle and watch the initial sync finish
 * before landing on a dashboard that would otherwise be empty.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading, refreshUser } = useAuth();
  const [username, setUsername] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/login");
    // Already linked and not mid-run — nothing to onboard.
    else if (user.leetcodeUsername && !syncing && !done) router.replace("/dashboard");
  }, [authLoading, user, router, syncing, done]);

  async function startSync(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSyncing(true);
    setProgress({ stage: "starting", progress: 0 });

    const token = getAccessToken();
    const es = new EventSource(`${API_URL}/api/sync/stream?token=${encodeURIComponent(token ?? "")}`);
    let settled = false;

    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data) as Progress;
      setProgress(data);
      if (data.error) {
        settled = true;
        setError(data.error);
        es.close();
        setSyncing(false);
      }
      if (data.stage === "done") {
        settled = true;
        es.close();
        setSyncing(false);
        setDone(true);
        void refreshUser();
      }
    };
    es.onerror = () => {
      es.close();
      setSyncing(false);
      if (!settled) setError("Lost connection to the sync stream. Check the backend worker is running.");
    };

    try {
      await api("/sync", { method: "POST", json: { leetcodeUsername: username } });
    } catch (err) {
      es.close();
      setSyncing(false);
      setError(err instanceof Error ? err.message : "Could not start the sync");
    }
  }

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--color-faint)]">Loading…</div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <BackgroundBlobs />
      <div className="animate-fadeup w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "linear-gradient(135deg, var(--color-accent-strong), var(--color-accent))" }}
          >
            <LogoMark size={16} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">LeetSense</span>
        </div>

        <div className="card p-7">
          {done ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-easy)]/15 text-[var(--color-easy)]">
                <CheckIcon size={22} />
              </div>
              <h1 className="text-xl font-semibold tracking-tight">You&apos;re all set</h1>
              <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                Synced <span className="font-medium text-[var(--color-text)]">@{username}</span>. Your analytics are
                ready.
              </p>
              <button onClick={() => router.push("/dashboard")} className="btn btn-primary mt-6 w-full py-2.5">
                Open dashboard <ArrowRightIcon size={16} />
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight">
                Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}
              </h1>
              <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                Link your LeetCode handle to pull in your solve history. You can change it later from your profile.
              </p>

              <form onSubmit={startSync} className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-[var(--color-muted)]">
                    LeetCode username
                  </span>
                  <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 focus-within:border-[var(--color-accent)]">
                    <span className="text-sm text-[var(--color-faint)]">@</span>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value.trim())}
                      placeholder="your-handle"
                      required
                      disabled={syncing}
                      className="flex-1 border-0 bg-transparent py-2.5 text-sm outline-none placeholder:text-[var(--color-faint)]"
                    />
                  </div>
                </label>

                {progress && (
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className={error ? "text-[var(--color-hard)]" : "text-[var(--color-muted)]"}>
                        {error ? "Sync failed" : (progress.label ?? progress.stage)}
                      </span>
                      <span className="num text-[var(--color-faint)]">{progress.progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${progress.progress}%`,
                          background: error ? "var(--color-hard)" : "var(--color-accent)",
                        }}
                      />
                    </div>
                  </div>
                )}

                {error && (
                  <p className="rounded-lg border border-[var(--color-hard)]/30 bg-[var(--color-hard)]/10 px-3 py-2 text-sm text-[var(--color-hard)]">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={syncing || !username} className="btn btn-primary w-full py-2.5">
                  <SyncIcon size={16} className={syncing ? "animate-spin" : ""} />
                  {syncing ? "Syncing…" : "Link and sync"}
                </button>
              </form>

              <button
                onClick={() => {
                  markOnboardingSkipped();
                  router.push("/dashboard");
                }}
                className="btn btn-ghost mt-2 w-full"
                disabled={syncing}
              >
                Skip for now
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
