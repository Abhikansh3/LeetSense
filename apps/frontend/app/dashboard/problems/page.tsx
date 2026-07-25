"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { CheckIcon, ExternalIcon } from "@/components/icons";
import { PageBody, PageHeader, DifficultyTag, Chip, EmptyState, ErrorPanel, type DifficultyKey } from "@/components/ui";

interface Problem {
  id: string;
  titleSlug: string;
  title: string;
  difficulty: DifficultyKey;
  tags: string[];
  solved: boolean;
}

const FILTERS = [
  { value: "", label: "All" },
  { value: "EASY", label: "Easy" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HARD", label: "Hard" },
];

export default function ProblemsPage() {
  const [items, setItems] = useState<Problem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<string>("");
  const sentinel = useRef<HTMLDivElement>(null);

  // Paging state in a ref so the observer callback always reads current values
  // without the observer being torn down and rebuilt on every fetch.
  // Written in an effect, not during render — refs are not render-safe.
  const state = useRef({ cursor, hasNext, loading, difficulty });
  useEffect(() => {
    state.current = { cursor, hasNext, loading, difficulty };
  }, [cursor, hasNext, loading, difficulty]);

  const loadMore = useCallback(async (reset = false) => {
    if (state.current.loading) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (state.current.difficulty) params.set("difficulty", state.current.difficulty);
      const next = reset ? null : state.current.cursor;
      if (next) params.set("cursor", next);
      const res = await api<{ items: Problem[]; nextCursor: string | null }>(`/problems?${params}`);
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
      setHasNext(Boolean(res.nextCursor));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load problems");
      setHasNext(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasNext(true);
    void loadMore(true);
  }, [difficulty, loadMore]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && state.current.hasNext && !state.current.loading) {
        void loadMore();
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  return (
    <PageBody>
      <PageHeader title="Questions" subtitle="The problems in your synced history." />

      <div className="space-y-4">
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value || "ALL"}
              onClick={() => setDifficulty(f.value)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                difficulty === f.value
                  ? "bg-[var(--color-surface)] font-medium text-[var(--color-text)] ring-1 ring-[var(--color-border-strong)]"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <ErrorPanel message={error} onRetry={() => void loadMore(true)} />}

        <div className="card divide-y divide-[var(--color-border)] overflow-hidden">
          {items.map((p) => (
            <a
              key={p.id}
              href={`https://leetcode.com/problems/${p.titleSlug}/`}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--color-surface-hover)]"
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  p.solved
                    ? "border-[var(--color-easy)]/40 bg-[var(--color-easy)]/15 text-[var(--color-easy)]"
                    : "border-[var(--color-border-strong)] text-transparent"
                }`}
              >
                <CheckIcon size={12} />
              </span>
              <span className="flex-1 truncate text-sm">{p.title}</span>
              <span className="hidden gap-1 sm:flex">
                {p.tags.slice(0, 2).map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
              </span>
              <DifficultyTag difficulty={p.difficulty} />
              <ExternalIcon size={14} className="shrink-0 text-[var(--color-faint)] opacity-0 transition group-hover:opacity-100" />
            </a>
          ))}

          {items.length === 0 && !loading && !error && (
            <EmptyState
              title={difficulty ? `No ${difficulty.toLowerCase()} problems yet` : "No problems yet"}
              body={
                difficulty
                  ? "Nothing at this difficulty in your synced history."
                  : "Sync your LeetCode account and the problems you've solved will appear here."
              }
              action={
                difficulty ? (
                  <button onClick={() => setDifficulty("")} className="btn btn-secondary">
                    Show all
                  </button>
                ) : (
                  <Link href="/dashboard" className="btn btn-primary">
                    Go to Overview
                  </Link>
                )
              }
            />
          )}

          {loading && items.length === 0 && (
            <div className="divide-y divide-[var(--color-border)]">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-11 animate-pulse bg-[var(--color-surface-hover)]/40" />
              ))}
            </div>
          )}
        </div>

        <div ref={sentinel} className="h-8 text-center text-sm text-[var(--color-faint)]">
          {loading && items.length > 0 ? "Loading…" : !hasNext && items.length > 0 ? "End of list" : ""}
        </div>
      </div>
    </PageBody>
  );
}
