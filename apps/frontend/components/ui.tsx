"use client";

/**
 * Shared presentational primitives. Everything here is styling-only — no data
 * fetching — so pages stay about behaviour and the visual language stays
 * consistent across Overview / Activity / Problems / Profile.
 */

import type { ReactNode } from "react";

/** Full-width page shell: generous gutters, no max-width column. */
export function PageBody({ children }: { children: ReactNode; width?: "wide" | "narrow" }) {
  return <div className="animate-fadeup px-11 py-9">{children}</div>;
}

/** Large inline page title. Replaces a sticky bar so content starts at the top. */
export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** Card heading: larger and higher-contrast than a muted label. */
export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-[18px] flex items-center justify-between gap-3">
      <h3 className="text-[15px] font-bold">{children}</h3>
      {right}
    </div>
  );
}

/** Uppercase micro-label used on stat tiles. */
export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="mb-3.5 text-xs font-semibold uppercase tracking-[0.04em] text-[var(--color-muted)]">
        {label}
      </div>
      <div className="num text-[28px] font-bold tracking-[-0.02em]">{value}</div>
      {sub && <div className="mt-1 text-xs text-[var(--color-faint)]">{sub}</div>}
    </div>
  );
}

/** Thin progress bar used in language and skill breakdowns. */
export function Bar({ value, max, color = "var(--color-accent)" }: { value: number; max: number; color?: string }) {
  return (
    <div className="h-[5px] overflow-hidden rounded bg-[var(--color-surface-2)]">
      <div className="h-full rounded transition-all duration-500" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color }} />
    </div>
  );
}

/** Labelled row + bar, the repeating unit of the breakdown cards. */
export function BarStat({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  return (
    <div>
      <div className="mb-[5px] flex justify-between text-xs">
        <span>{label}</span>
        <span className="num text-[var(--color-faint)]">{value}</span>
      </div>
      <Bar value={value} max={max} color={color} />
    </div>
  );
}

/** Foreground + soft background pair for a difficulty. */
export function diffColor(difficulty: string): { fg: string; soft: string } {
  const d = difficulty.toLowerCase();
  if (d === "easy") return { fg: "var(--color-easy)", soft: "var(--color-easy-soft)" };
  if (d === "hard") return { fg: "var(--color-hard)", soft: "var(--color-hard-soft)" };
  return { fg: "var(--color-medium)", soft: "var(--color-medium-soft)" };
}

/** Centred block for loading / empty / error states inside a card. */
export function StateBlock({ children }: { children: ReactNode }) {
  return <div className="px-5 py-14 text-center text-sm text-[var(--color-muted)]">{children}</div>;
}

/** Spinner + label, for whole-page loads. */
export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <StateBlock>
      <span className="inline-flex items-center gap-2.5">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-surface-2)] border-t-[var(--color-accent)]" />
        {label}
      </span>
    </StateBlock>
  );
}

const DIFF_COLOR = {
  EASY: "var(--color-easy)",
  MEDIUM: "var(--color-medium)",
  HARD: "var(--color-hard)",
} as const;

export type DifficultyKey = keyof typeof DIFF_COLOR;

/** Difficulty pill — one definition so Easy/Medium/Hard never drift in colour. */
export function DifficultyTag({ difficulty }: { difficulty: DifficultyKey }) {
  const color = DIFF_COLOR[difficulty];
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ color, background: `color-mix(in oklab, ${color} 14%, transparent)` }}
    >
      {difficulty[0] + difficulty.slice(1).toLowerCase()}
    </span>
  );
}

/** Neutral tag chip for topics and languages. */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-[var(--color-bg-subtle)] px-2 py-0.5 text-xs text-[var(--color-faint)]">
      {children}
    </span>
  );
}

/** Empty / zero-data state with an optional call to action. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-sm text-[var(--color-faint)]">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Inline error panel for a failed fetch, with a retry affordance. */
export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex items-center justify-between gap-4 border-[var(--color-hard)]/30 p-4">
      <div>
        <p className="text-sm font-medium text-[var(--color-hard)]">Couldn&apos;t load your data</p>
        <p className="mt-0.5 text-sm text-[var(--color-muted)]">{message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-secondary shrink-0">
          Retry
        </button>
      )}
    </div>
  );
}

/** Loading placeholder matching the card silhouette it replaces. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`card animate-pulse ${className}`} />;
}

/** Horizontal labelled bar, used for language and topic distributions. */
export function BarRow({
  label,
  value,
  max,
  color = "var(--color-accent)",
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-[var(--color-muted)]">{label}</span>
        <span className="num shrink-0 text-sm font-semibold">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/** Compact key/value row for the profile detail cards. */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm text-[var(--color-muted)]">{label}</span>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  );
}

/** Relative time ("3d ago") with an absolute tooltip. */
export function RelativeTime({ value }: { value: string | Date }) {
  const date = typeof value === "string" ? new Date(value) : value;
  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString()} className="text-xs text-[var(--color-faint)]">
      {formatRelative(date)}
    </time>
  );
}

export function formatRelative(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}
