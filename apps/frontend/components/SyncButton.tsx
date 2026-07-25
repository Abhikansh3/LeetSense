"use client";

import { useState } from "react";
import { api, getAccessToken, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SyncIcon } from "@/components/icons";

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
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3">
          <span className="text-sm text-[var(--color-faint)]">@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="leetcode-username"
            disabled={syncing}
            className="flex-1 border-0 bg-transparent py-2.5 text-sm outline-none placeholder:text-[var(--color-faint)]"
          />
        </div>
        <button onClick={startSync} disabled={syncing || !username} className="btn btn-primary">
          <SyncIcon size={16} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {progress && (
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className={progress.error ? "text-[var(--color-hard)]" : "text-[var(--color-muted)]"}>
              {progress.error ? "Sync failed" : (progress.label ?? progress.stage)}
            </span>
            <span className="num text-[var(--color-faint)]">{progress.progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress.progress}%`,
                background: progress.error ? "var(--color-hard)" : "var(--color-accent)",
              }}
            />
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-[var(--color-hard)]">{error}</p>}
    </div>
  );
}
