"use client";

import { useState } from "react";
import { api, getAccessToken, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Progress {
  stage: string;
  label?: string;
  progress: number;
  error?: string;
}

export function SyncButton({ onDone }: { onDone?: () => void }) {
  const { user, refreshUser } = useAuth();
  const [username, setUsername] = useState(user?.leetcodeUsername ?? "");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSync() {
    setError(null);
    setSyncing(true);
    setProgress({ stage: "starting", progress: 0 });

    // Open the SSE stream first so we don't miss early events.
    const token = getAccessToken();
    const es = new EventSource(`${API_URL}/api/sync/stream?token=${encodeURIComponent(token ?? "")}`);

    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data) as Progress;
      setProgress(data);
      if (data.error) {
        setError(data.error);
        es.close();
        setSyncing(false);
      }
      if (data.stage === "done") {
        es.close();
        setSyncing(false);
        refreshUser();
        onDone?.();
      }
    };
    es.onerror = () => {
      es.close();
      setSyncing(false);
    };

    try {
      await api("/sync", { method: "POST", json: username ? { leetcodeUsername: username } : {} });
    } catch (err) {
      es.close();
      setSyncing(false);
      setError(err instanceof Error ? err.message : "Failed to start sync");
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="LeetCode username"
          disabled={syncing}
          className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <button
          onClick={startSync}
          disabled={syncing || !username}
          className="rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {progress && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-gray-400">
            <span>{progress.error ? "Failed" : (progress.label ?? progress.stage)}</span>
            <span>{progress.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg)]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                progress.error ? "bg-[var(--color-hard)]" : "bg-gradient-to-r from-indigo-500 to-cyan-400"
              }`}
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
