"use client";

/**
 * Shared presentational primitives. Everything here is styling-only — no data
 * fetching — so pages stay about behaviour and the visual language stays
 * consistent across Overview / Activity / Problems / Profile.
 */

import type { ReactNode } from "react";

/** Standard page body: centred column with consistent gutters and rhythm. */
export function PageBody({
  children,
  width = "wide",
}: {
  children: ReactNode;
  width?: "wide" | "narrow";
}) {
  return (
    <div
      className={`animate-fadeup mx-auto space-y-5 px-8 py-6 ${
        width === "wide" ? "max-w-6xl" : "max-w-4xl"
      }`}
    >
      {children}
    </div>
  );
}

/** Section heading used between card groups. */
export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-[13px] font-semibold tracking-tight text-[var(--color-muted)]">{children}</h2>
      {hint && <span className="text-xs text-[var(--color-faint)]">{hint}</span>}
    </div>
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
