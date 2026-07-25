"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { SyncButton } from "@/components/SyncButton";
import { TopBar } from "@/components/TopBar";
import { Card, StatCard, DifficultyBar, Heatmap, TopicRadar, GrowthChart } from "@/components/charts";

interface Overview {
  snapshot: { totalSolved: number; ranking: number | null } | null;
  totalSubmissions: number;
  byDifficulty: { EASY: number; MEDIUM: number; HARD: number };
  topTopics: { tag: string; count: number }[];
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [heatmap, setHeatmap] = useState<{ date: string; count: number }[]>([]);
  const [radar, setRadar] = useState<{ tag: string; value: number }[]>([]);
  const [snapshots, setSnapshots] = useState<{ capturedAt: string; totalSolved: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, h, r, s] = await Promise.all([
        api<Overview>("/stats/overview"),
        api<{ days: { date: string; count: number }[] }>("/stats/heatmap"),
        api<{ topics: { tag: string; value: number }[] }>("/stats/radar"),
        api<{ snapshots: { capturedAt: string; totalSolved: number }[] }>("/stats/snapshots"),
      ]);
      setOverview(o);
      setHeatmap(h.days);
      setRadar(r.topics);
      setSnapshots(s.snapshots);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeDays = heatmap.length;

  return (
    <div>
      <TopBar title="Overview" subtitle="Your LeetCode analytics at a glance." />

      <div className="mx-auto max-w-6xl space-y-5 px-8 py-6">
        <SyncButton onDone={load} />

        {loading ? (
          <SkeletonGrid />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Total solved" value={overview?.snapshot?.totalSolved ?? 0} accent="var(--color-accent)" />
              <StatCard label="Submissions synced" value={overview?.totalSubmissions ?? 0} />
              <StatCard
                label="Global ranking"
                value={overview?.snapshot?.ranking ? `#${overview.snapshot.ranking.toLocaleString()}` : "—"}
              />
              <StatCard label="Active days" value={activeDays} hint="in the last year" />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="Difficulty breakdown">
                <DifficultyBar data={overview?.byDifficulty ?? { EASY: 0, MEDIUM: 0, HARD: 0 }} />
              </Card>
              <Card title="Top topics">
                <div className="flex flex-wrap gap-2">
                  {overview?.topTopics.length ? (
                    overview.topTopics.map((t) => (
                      <span key={t.tag} className="badge">
                        {t.tag}
                        <span className="num text-[var(--color-text)]">{t.count}</span>
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--color-faint)]">No topics yet — run a sync.</p>
                  )}
                </div>
              </Card>
            </div>

            <Card title="Activity" right={<span className="text-xs text-[var(--color-faint)]">last 12 months</span>}>
              <Heatmap days={heatmap} />
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="Topic strength">
                <TopicRadar topics={radar} />
              </Card>
              <Card title="Growth over time">
                <GrowthChart snapshots={snapshots} />
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-[92px] animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card h-40 animate-pulse" />
        <div className="card h-40 animate-pulse" />
      </div>
      <div className="card h-32 animate-pulse" />
    </div>
  );
}
