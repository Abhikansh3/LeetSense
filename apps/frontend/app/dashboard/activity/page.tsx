"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAppData } from "@/lib/app-data";
import { Card, Heatmap } from "@/components/charts";
import {
  PageBody,
  PageHeader,
  DifficultyTag,
  Chip,
  EmptyState,
  ErrorPanel,
  RelativeTime,
  type DifficultyKey,
} from "@/components/ui";
import { ExternalIcon } from "@/components/icons";

interface ActivityItem {
  id: string;
  titleSlug: string;
  title: string;
  difficulty: DifficultyKey;
  tags: string[];
  lang: string;
  runtime: string | null;
  memory: string | null;
  timestamp: string;
}

export default function ActivityPage() {
  const { heatmap, loading: statsLoading } = useAppData();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  // Held in a ref so the IntersectionObserver callback always sees current
  // paging state without having to tear down and re-create the observer.
  const state = useRef({ cursor, hasNext, loading });
  state.current = { cursor, hasNext, loading };

  const loadMore = useCallback(async (reset = false) => {
    if (state.current.loading) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const next = reset ? null : state.current.cursor;
      if (next) params.set("cursor", next);
      const res = await api<{ items: ActivityItem[]; nextCursor: string | null }>(`/stats/activity?${params}`);
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
      setHasNext(Boolean(res.nextCursor));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your activity");
      setHasNext(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMore(true);
  }, [loadMore]);

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

  const activeDays = heatmap.length;
  const totalInYear = heatmap.reduce((sum, d) => sum + d.count, 0);

  return (
    <PageBody>
      <PageHeader title="Activity" subtitle="Every problem you've solved, most recent first." />

      <div className="space-y-4">
        <Card
          title="Solve activity"
          right={
            <span className="text-xs text-[var(--color-faint)]">
              {statsLoading ? "…" : `${totalInYear} solves across ${activeDays} active days`}
            </span>
          }
        >
          <Heatmap days={heatmap} />
        </Card>

        {error && <ErrorPanel message={error} onRetry={() => void loadMore(true)} />}

        <div className="card divide-y divide-[var(--color-border)] overflow-hidden">
          {items.map((item) => (
            <a
              key={item.id}
              href={`https://leetcode.com/problems/${item.titleSlug}/`}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--color-surface-hover)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{item.title}</span>
                  <DifficultyTag difficulty={item.difficulty} />
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <RelativeTime value={item.timestamp} />
                  {item.lang !== "unknown" && <Chip>{item.lang}</Chip>}
                  {item.runtime && <Chip>{item.runtime}</Chip>}
                </div>
              </div>
              <span className="hidden gap-1 lg:flex">
                {item.tags.slice(0, 2).map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
              </span>
              <ExternalIcon size={14} className="shrink-0 text-[var(--color-faint)] opacity-0 transition group-hover:opacity-100" />
            </a>
          ))}

          {items.length === 0 && !loading && !error && (
            <EmptyState
              title="No solves yet"
              body="Sync your LeetCode account and your accepted submissions will show up here."
              action={
                <Link href="/dashboard" className="btn btn-primary">
                  Go to Overview
                </Link>
              }
            />
          )}

          {loading && items.length === 0 && (
            <div className="divide-y divide-[var(--color-border)]">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-[62px] animate-pulse bg-[var(--color-surface-hover)]/40" />
              ))}
            </div>
          )}
        </div>

        <div ref={sentinel} className="h-8 text-center text-sm text-[var(--color-faint)]">
          {loading && items.length > 0 ? "Loading…" : !hasNext && items.length > 0 ? "End of history" : ""}
        </div>
      </div>
    </PageBody>
  );
}
