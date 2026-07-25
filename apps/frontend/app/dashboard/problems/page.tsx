"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { TopBar } from "@/components/TopBar";
import { CheckIcon, ExternalIcon } from "@/components/icons";

interface Problem {
  id: string;
  titleSlug: string;
  title: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags: string[];
  solved: boolean;
}

const DIFF_COLOR: Record<Problem["difficulty"], string> = {
  EASY: "var(--color-easy)",
  MEDIUM: "var(--color-medium)",
  HARD: "var(--color-hard)",
};

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
  const [difficulty, setDifficulty] = useState<string>("");
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(
    async (reset = false) => {
      if (loading) return;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (difficulty) params.set("difficulty", difficulty);
        if (!reset && cursor) params.set("cursor", cursor);
        const res = await api<{ items: Problem[]; nextCursor: string | null }>(`/problems?${params}`);
        setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
        setCursor(res.nextCursor);
        setHasNext(Boolean(res.nextCursor));
      } finally {
        setLoading(false);
      }
    },
    [cursor, difficulty, loading],
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasNext(true);
    loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasNext && !loading) loadMore();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNext, loading, loadMore]);

  return (
    <div>
      <TopBar title="Problems" subtitle="Browse the problems in your synced dataset." />

      <div className="mx-auto max-w-4xl space-y-4 px-8 py-6">
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
                  <span key={t} className="rounded-md bg-[var(--color-bg-subtle)] px-2 py-0.5 text-xs text-[var(--color-faint)]">
                    {t}
                  </span>
                ))}
              </span>
              <span className="w-16 text-right text-xs font-medium" style={{ color: DIFF_COLOR[p.difficulty] }}>
                {p.difficulty[0] + p.difficulty.slice(1).toLowerCase()}
              </span>
              <ExternalIcon size={14} className="text-[var(--color-faint)] opacity-0 transition group-hover:opacity-100" />
            </a>
          ))}

          {items.length === 0 && !loading && (
            <p className="px-4 py-12 text-center text-sm text-[var(--color-faint)]">
              No problems yet — sync your LeetCode account from the Overview page.
            </p>
          )}
          {loading && items.length === 0 && (
            <div className="divide-y divide-[var(--color-border)]">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-11 animate-pulse bg-[var(--color-surface-hover)]/40" />
              ))}
            </div>
          )}
        </div>

        <div ref={sentinel} className="h-8 text-center text-sm text-[var(--color-faint)]">
          {loading && items.length > 0 ? "Loading…" : !hasNext && items.length > 0 ? "End of list" : ""}
        </div>
      </div>
    </div>
  );
}
