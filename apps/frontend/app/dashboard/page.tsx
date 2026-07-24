"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { SyncButton } from "@/components/SyncButton";
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Overview</h1>
          <p className="text-sm text-gray-400">Your LeetCode analytics at a glance.</p>
        </div>
      </header>

      <SyncButton onDone={load} />

      {loading ? (
        <p className="text-gray-500">Loading analytics…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total solved" value={overview?.snapshot?.totalSolved ?? 0} accent="#22d3ee" />
            <StatCard label="Submissions synced" value={overview?.totalSubmissions ?? 0} />
            <StatCard label="Global ranking" value={overview?.snapshot?.ranking?.toLocaleString() ?? "—"} />
            <StatCard
              label="Hard solved"
              value={overview?.byDifficulty.HARD ?? 0}
              accent="var(--color-hard)"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Difficulty breakdown">
              <DifficultyBar data={overview?.byDifficulty ?? { EASY: 0, MEDIUM: 0, HARD: 0 }} />
            </Card>
            <Card title="Top topics">
              <div className="flex flex-wrap gap-2">
                {overview?.topTopics.length ? (
                  overview.topTopics.map((t) => (
                    <span
                      key={t.tag}
                      className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs text-gray-300"
                    >
                      {t.tag} <span className="text-[var(--color-accent-2)]">{t.count}</span>
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No topics yet — run a sync.</p>
                )}
              </div>
            </Card>
          </div>

          <Card title="Activity (last year)">
            <Heatmap days={heatmap} />
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Topic strength radar">
              <TopicRadar topics={radar} />
            </Card>
            <Card title="Growth over time">
              <GrowthChart snapshots={snapshots} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
