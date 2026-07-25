"use client";

import { useAuth } from "@/lib/auth";
import { useAppData } from "@/lib/app-data";
import { TopBar } from "@/components/TopBar";
import { Card, DifficultyBar, GrowthChart } from "@/components/charts";
import { PageBody, DetailRow, BarRow, EmptyState, ErrorPanel, Skeleton, RelativeTime } from "@/components/ui";
import { SyncButton } from "@/components/SyncButton";

export default function ProfilePage() {
  const { user } = useAuth();
  const { overview, snapshots, loading, error, refresh } = useAppData();

  const latest = overview?.snapshot ?? null;
  const first = snapshots[0] ?? null;
  const solvedSinceFirstSync = latest && first ? latest.totalSolved - first.totalSolved : null;

  const languages = [...(overview?.languages ?? [])].sort((a, b) => b.count - a.count).slice(0, 6);
  const maxLang = languages[0]?.count ?? 0;

  return (
    <div>
      <TopBar title="Profile" subtitle="Your account, linked LeetCode handle, and progress." />

      <PageBody width="narrow">
        {error && <ErrorPanel message={error} onRetry={() => void refresh()} />}

        <Card title="Account">
          <div className="divide-y divide-[var(--color-border)]">
            <DetailRow label="Name" value={user?.name ?? "—"} />
            <DetailRow label="Email" value={user?.email ?? "—"} />
            <DetailRow
              label="LeetCode"
              value={
                user?.leetcodeUsername ? (
                  <a
                    href={`https://leetcode.com/u/${user.leetcodeUsername}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--color-accent)] hover:underline"
                  >
                    @{user.leetcodeUsername}
                  </a>
                ) : (
                  <span className="text-[var(--color-faint)]">Not linked</span>
                )
              }
            />
            <DetailRow
              label="Global ranking"
              value={latest?.ranking ? `#${latest.ranking.toLocaleString()}` : "—"}
            />
            <DetailRow
              label="Last synced"
              value={latest ? <RelativeTime value={latest.capturedAt} /> : <span className="text-[var(--color-faint)]">Never</span>}
            />
          </div>
        </Card>

        {/* SyncButton renders its own card, so it is not wrapped again here. */}
        <SyncButton onDone={refresh} />

        {loading ? (
          <>
            <Skeleton className="h-48" />
            <Skeleton className="h-56" />
          </>
        ) : (
          <>
            <Card
              title="Solved by difficulty"
              right={
                latest ? <span className="num text-xs text-[var(--color-faint)]">{latest.totalSolved} total</span> : null
              }
            >
              {latest ? (
                <DifficultyBar
                  data={{ EASY: latest.easySolved, MEDIUM: latest.mediumSolved, HARD: latest.hardSolved }}
                />
              ) : (
                <EmptyState title="No snapshot yet" body="Run a sync to record your solved counts." />
              )}
            </Card>

            <Card title="Languages" right={<span className="text-xs text-[var(--color-faint)]">by submissions</span>}>
              {languages.length > 0 ? (
                <div className="space-y-3.5">
                  {languages.map((l) => (
                    <BarRow key={l.lang} label={l.lang} value={l.count} max={maxLang} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No language data"
                  body="LeetCode's public endpoint doesn't report the language used, so this fills in once a session cookie is configured for your account."
                />
              )}
            </Card>

            <Card
              title="Growth"
              right={
                solvedSinceFirstSync !== null && solvedSinceFirstSync > 0 ? (
                  <span className="num text-xs text-[var(--color-easy)]">+{solvedSinceFirstSync} since first sync</span>
                ) : null
              }
            >
              <GrowthChart snapshots={snapshots} />
            </Card>
          </>
        )}
      </PageBody>
    </div>
  );
}
