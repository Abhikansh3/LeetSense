"use client";

import Link from "next/link";
import { useAppData } from "@/lib/app-data";
import { SyncButton } from "@/components/SyncButton";
import { TopBar } from "@/components/TopBar";
import { Card, StatCard, DifficultyDonut, Heatmap, TopicRadar, GrowthChart } from "@/components/charts";
import { PageBody, Chip, EmptyState, ErrorPanel, Skeleton } from "@/components/ui";

export default function DashboardPage() {
  const { overview, heatmap, radar, snapshots, loading, error, refresh } = useAppData();

  const activeDays = heatmap.length;
  const hasData = (overview?.totalSubmissions ?? 0) > 0;

  return (
    <div>
      <TopBar title="Overview" subtitle="Your LeetCode analytics at a glance." />

      <PageBody>
        <SyncButton onDone={refresh} />

        {error && <ErrorPanel message={error} onRetry={() => void refresh()} />}

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

            {!hasData && !error && (
              <div className="card">
                <EmptyState
                  title="Nothing synced yet"
                  body="Enter your LeetCode username above and run a sync to populate your analytics."
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="Difficulty breakdown">
                <DifficultyDonut data={overview?.byDifficulty ?? { EASY: 0, MEDIUM: 0, HARD: 0 }} />
              </Card>
              <Card
                title="Top topics"
                right={
                  hasData ? (
                    <Link href="/dashboard/problems" className="text-xs text-[var(--color-accent)] hover:underline">
                      Browse problems
                    </Link>
                  ) : null
                }
              >
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

            <Card
              title="Activity"
              right={
                <Link href="/dashboard/activity" className="text-xs text-[var(--color-accent)] hover:underline">
                  View all
                </Link>
              }
            >
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

            {overview?.languages?.length ? (
              <Card title="Languages" right={<span className="text-xs text-[var(--color-faint)]">by submissions</span>}>
                <div className="flex flex-wrap gap-2">
                  {[...overview.languages]
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 8)
                    .map((l) => (
                      <Chip key={l.lang}>
                        {l.lang} · {l.count}
                      </Chip>
                    ))}
                </div>
              </Card>
            ) : null}
          </>
        )}
      </PageBody>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-32" />
    </div>
  );
}
