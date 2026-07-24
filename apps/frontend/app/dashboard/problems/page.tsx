"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface Problem {
  id: string;
  titleSlug: string;
  title: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags: string[];
  solved: boolean;
}

const DIFF_STYLE: Record<Problem["difficulty"], string> = {
  EASY: "text-[var(--color-easy)]",
  MEDIUM: "text-[var(--color-medium)]",
  HARD: "text-[var(--color-hard)]",
};

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

  // Reset + reload when the filter changes.
  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasNext(true);
    loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty]);

  // Infinite scroll via IntersectionObserver.
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
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Problems</h1>
        <p className="text-sm text-gray-400">Browse the problems in your synced dataset.</p>
      </header>

      <div className="flex gap-2">
        {["", "EASY", "MEDIUM", "HARD"].map((d) => (
          <button
            key={d || "ALL"}
            onClick={() => setDifficulty(d)}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              difficulty === d
                ? "bg-[var(--color-accent)] text-white"
                : "border border-[var(--color-border)] bg-[var(--color-surface)] text-gray-400 hover:text-white"
            }`}
          >
            {d ? d[0] + d.slice(1).toLowerCase() : "All"}
          </button>
        ))}
      </div>

      <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {items.map((p) => (
          <a
            key={p.id}
            href={`https://leetcode.com/problems/${p.titleSlug}/`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--color-surface-2)]"
          >
            <span className={p.solved ? "text-[var(--color-easy)]" : "text-gray-600"}>{p.solved ? "✓" : "○"}</span>
            <span className="flex-1 text-sm text-white">{p.title}</span>
            <span className="hidden gap-1 sm:flex">
              {p.tags.slice(0, 2).map((t) => (
                <span key={t} className="rounded bg-[var(--color-bg)] px-2 py-0.5 text-xs text-gray-500">
                  {t}
                </span>
              ))}
            </span>
            <span className={`text-xs font-medium ${DIFF_STYLE[p.difficulty]}`}>
              {p.difficulty[0] + p.difficulty.slice(1).toLowerCase()}
            </span>
          </a>
        ))}
        {items.length === 0 && !loading && (
          <p className="px-4 py-8 text-center text-sm text-gray-500">
            No problems yet — sync your LeetCode account from the Overview page.
          </p>
        )}
      </div>

      <div ref={sentinel} className="h-8 text-center text-sm text-gray-500">
        {loading ? "Loading…" : hasNext ? "" : items.length > 0 ? "End of list" : ""}
      </div>
    </div>
  );
}
