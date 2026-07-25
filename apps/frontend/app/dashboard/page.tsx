"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAppData } from "@/lib/app-data";
import { SyncButton } from "@/components/SyncButton";
import { Card, DifficultyDonut, GrowthChart } from "@/components/charts";
import {
  PageBody,
  PageHeader,
  StatTile,
  BarStat,
  Bar,
  ErrorPanel,
  LoadingBlock,
  Skeleton,
} from "@/components/ui";

interface SkillTag {
  tagName: string;
  problemsSolved: number;
}

interface ProfileStats {
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  totalQuestions: number | null;
  ranking: number | null;
  acceptanceRate: number | null;
  streak: number | null;
  totalActiveDays: number | null;
  languageStats: { languageName: string; problemsSolved: number }[] | null;
  skillStats: { fundamental: SkillTag[]; intermediate: SkillTag[]; advanced: SkillTag[] } | null;
  submissionStats: {
    accepted: number;
    submitted: number;
    byDifficulty: { difficulty: string; accepted: number; submitted: number }[];
  } | null;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { snapshots, loading, error, refresh } = useAppData();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    api<{ stats: ProfileStats | null }>("/stats/profile")
      .then((r) => setStats(r.stats))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, [snapshots]);

  const firstName = (user?.name ?? "there").split(" ")[0];

  if (statsLoading || loading) {
    return (
      <PageBody>
        <PageHeader title={`Hey ${firstName}`} subtitle="Here's how your practice looks." />
        <LoadingBlock label="Loading dashboard…" />
      </PageBody>
    );
  }

  if (!stats) {
    return (
      <PageBody>
        <PageHeader title={`Hey ${firstName}`} subtitle="No synced data yet." />
        {error && <div className="mb-4"><ErrorPanel message={error} onRetry={() => void refresh()} /></div>}
        <SyncButton onDone={refresh} />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader title={`Hey ${firstName}`} subtitle="Here's how your practice looks." />

      {error && <div className="mb-4"><ErrorPanel message={error} onRetry={() => void refresh()} /></div>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Total solved"
          value={stats.totalSolved.toLocaleString()}
          sub={stats.totalQuestions ? `of ${stats.totalQuestions.toLocaleString()}` : undefined}
        />
        <StatTile label="Global ranking" value={stats.ranking ? `#${stats.ranking.toLocaleString()}` : "—"} />
        <StatTile
          label="Acceptance"
          value={stats.acceptanceRate != null ? `${stats.acceptanceRate.toFixed(1)}%` : "—"}
        />
        <StatTile label="Current streak" value={stats.streak ?? 0} sub="days" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card
          title="Solved over time"
          right={<span className="num text-[11px] text-[var(--color-faint)]">last {snapshots.length} snapshots</span>}
        >
          <GrowthChart snapshots={snapshots} />
        </Card>
        <Card title="Difficulty split">
          <DifficultyDonut
            data={{ EASY: stats.easySolved, MEDIUM: stats.mediumSolved, HARD: stats.hardSolved }}
          />
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LanguageCard languages={stats.languageStats ?? []} />
        <SubmissionsCard submissions={stats.submissionStats} activeDays={stats.totalActiveDays} />
      </div>

      <SkillCoverage skills={stats.skillStats} />

      <div className="mt-4">
        <SyncButton onDone={refresh} />
      </div>
    </PageBody>
  );
}

function LanguageCard({ languages }: { languages: { languageName: string; problemsSolved: number }[] }) {
  const top = [...languages].sort((a, b) => b.problemsSolved - a.problemsSolved).slice(0, 6);
  const max = top[0]?.problemsSolved ?? 0;
  return (
    <Card title="Solved by language">
      {top.length === 0 ? (
        <p className="text-[13px] text-[var(--color-faint)]">No language data.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {top.map((l) => (
            <BarStat key={l.languageName} label={l.languageName} value={l.problemsSolved} max={max} />
          ))}
        </div>
      )}
    </Card>
  );
}

function SubmissionsCard({
  submissions,
  activeDays,
}: {
  submissions: ProfileStats["submissionStats"];
  activeDays: number | null;
}) {
  if (!submissions) {
    return (
      <Card title="Submissions">
        <p className="text-[13px] text-[var(--color-faint)]">No submission data.</p>
      </Card>
    );
  }

  const failed = Math.max(0, submissions.submitted - submissions.accepted);
  const tiles = [
    { label: "Submitted", value: submissions.submitted, bg: "var(--color-surface-2)", fg: "var(--color-text)" },
    { label: "Accepted", value: submissions.accepted, bg: "var(--color-easy-soft)", fg: "var(--color-easy)" },
    { label: "Failed", value: failed, bg: "var(--color-hard-soft)", fg: "var(--color-hard)" },
  ];

  return (
    <Card
      title="Submissions"
      right={
        activeDays != null ? (
          <span className="num text-[11px] text-[var(--color-faint)]">{activeDays} active days</span>
        ) : null
      }
    >
      <div className="mb-[18px] grid grid-cols-3 gap-2.5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[10px] p-3" style={{ background: t.bg }}>
            <div
              className="mb-1 text-[10.5px] uppercase tracking-[0.04em]"
              style={{ color: t.fg === "var(--color-text)" ? "var(--color-faint)" : t.fg }}
            >
              {t.label}
            </div>
            <div className="num text-lg font-bold" style={{ color: t.fg }}>
              {t.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {submissions.byDifficulty.map((row) => {
          const rowFailed = Math.max(0, row.submitted - row.accepted);
          const color =
            row.difficulty === "Easy"
              ? "var(--color-easy)"
              : row.difficulty === "Hard"
                ? "var(--color-hard)"
                : "var(--color-medium)";
          return (
            <div key={row.difficulty}>
              <div className="mb-[5px] flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                  {row.difficulty}
                </span>
                <span className="num text-[var(--color-faint)]">
                  {row.accepted} ok · {rowFailed} fail
                </span>
              </div>
              <div className="flex h-[5px] overflow-hidden rounded bg-[var(--color-surface-2)]">
                <div style={{ width: `${row.submitted > 0 ? (row.accepted / row.submitted) * 100 : 0}%`, background: color }} />
                <div
                  style={{
                    width: `${row.submitted > 0 ? (rowFailed / row.submitted) * 100 : 0}%`,
                    background: "var(--color-hard)",
                    opacity: 0.5,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SkillCoverage({ skills }: { skills: ProfileStats["skillStats"] }) {
  const groups = [
    { name: "Fundamental", tags: skills?.fundamental ?? [] },
    { name: "Intermediate", tags: skills?.intermediate ?? [] },
    { name: "Advanced", tags: skills?.advanced ?? [] },
  ];
  const hasAny = groups.some((g) => g.tags.length > 0);

  return (
    <Card title="Skill coverage">
      {!hasAny ? (
        <p className="text-[13px] text-[var(--color-faint)]">No skill data.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {groups.map((grp) => {
            const top = [...grp.tags].sort((a, b) => b.problemsSolved - a.problemsSolved).slice(0, 5);
            const max = top[0]?.problemsSolved ?? 0;
            return (
              <div key={grp.name}>
                <div className="mb-3 text-xs font-bold uppercase tracking-[0.04em] text-[var(--color-faint)]">
                  {grp.name}
                </div>
                <div className="flex flex-col gap-2.5">
                  {top.length === 0 && <span className="text-xs text-[var(--color-faint)]">—</span>}
                  {top.map((sk) => (
                    <div key={sk.tagName}>
                      <div className="mb-[5px] flex justify-between text-xs">
                        <span className="truncate">{sk.tagName}</span>
                        <span className="num shrink-0 text-[var(--color-faint)]">{sk.problemsSolved}</span>
                      </div>
                      <Bar value={sk.problemsSolved} max={max} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
