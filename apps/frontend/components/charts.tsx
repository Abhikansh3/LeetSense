"use client";

export function Card({
  title,
  right,
  children,
  className = "",
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`card p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h3 className="text-[13px] font-medium text-[var(--color-muted)]">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="card p-5">
      <p className="text-[13px] text-[var(--color-muted)]">{label}</p>
      <p className="num mt-2 text-3xl font-semibold" style={{ color: accent ?? "var(--color-text)" }}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-[var(--color-faint)]">{hint}</p>}
    </div>
  );
}

const DIFF = {
  EASY: { color: "var(--color-easy)", label: "Easy" },
  MEDIUM: { color: "var(--color-medium)", label: "Medium" },
  HARD: { color: "var(--color-hard)", label: "Hard" },
} as const;

/** Donut of solved-by-difficulty with the total in the center. */
export function DifficultyDonut({ data }: { data: { EASY: number; MEDIUM: number; HARD: number } }) {
  const total = data.EASY + data.MEDIUM + data.HARD;
  const r = 46;
  const circ = 2 * Math.PI * r;
  const order = ["EASY", "MEDIUM", "HARD"] as const;

  let offset = 0;
  const segments = order.map((k) => {
    const frac = total > 0 ? data[k] / total : 0;
    const len = frac * circ;
    const seg = { key: k, len, gap: circ - len, dashoffset: -offset };
    offset += len;
    return seg;
  });

  return (
    <div className="flex items-center gap-6">
      <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth="14" />
        {segments.map((s) => (
          <circle
            key={s.key}
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={DIFF[s.key].color}
            strokeWidth="14"
            strokeDasharray={`${s.len} ${s.gap}`}
            strokeDashoffset={s.dashoffset}
            transform="rotate(-90 60 60)"
            strokeLinecap={s.len > 0 && s.len < circ ? "round" : "butt"}
          />
        ))}
        <text x="60" y="56" textAnchor="middle" fill="var(--color-text)" className="num" fontWeight="700" fontSize="22">
          {total}
        </text>
        <text x="60" y="74" textAnchor="middle" fill="var(--color-faint)" fontSize="10">
          solved
        </text>
      </svg>
      <div className="flex-1 space-y-2.5">
        {order.map((k) => (
          <div key={k} className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: DIFF[k].color }} />
              {DIFF[k].label}
            </span>
            <span className="num text-sm font-semibold">{data[k]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DifficultyBar({ data }: { data: { EASY: number; MEDIUM: number; HARD: number } }) {
  const total = data.EASY + data.MEDIUM + data.HARD || 1;
  return (
    <div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        {(["EASY", "MEDIUM", "HARD"] as const).map((k) => (
          <div key={k} style={{ width: `${(data[k] / total) * 100}%`, background: DIFF[k].color }} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {(["EASY", "MEDIUM", "HARD"] as const).map((k) => (
          <div key={k}>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: DIFF[k].color }} />
              <span className="text-xs text-[var(--color-muted)]">{DIFF[k].label}</span>
            </div>
            <p className="num mt-1 text-xl font-semibold">{data[k]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** GitHub-style contribution heatmap for the last ~53 weeks. */
export function Heatmap({ days }: { days: { date: string; count: number }[] }) {
  const counts = new Map(days.map((d) => [d.date, d.count]));
  const max = Math.max(1, ...days.map((d) => d.count));

  const cells: { date: string; count: number }[] = [];
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 7 * 52 - today.getDay());
  for (let i = 0; i < 53 * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ date: key, count: counts.get(key) ?? 0 });
  }

  const level = (c: number) => {
    if (c === 0) return "var(--color-bg-subtle)";
    const t = c / max;
    if (t > 0.66) return "#7c6cf5";
    if (t > 0.33) return "#5b4fca";
    return "#3a3480";
  };

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="grid grid-flow-col grid-rows-7 gap-[3px]" style={{ width: "max-content" }}>
          {cells.map((cell) => (
            <div
              key={cell.date}
              title={`${cell.date}: ${cell.count} solved`}
              className="h-[11px] w-[11px] rounded-[3px] ring-1 ring-inset ring-white/[0.03]"
              style={{ background: level(cell.count) }}
            />
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-[var(--color-faint)]">
        <span>Less</span>
        {["var(--color-bg-subtle)", "#3a3480", "#5b4fca", "#7c6cf5"].map((c) => (
          <span key={c} className="h-[10px] w-[10px] rounded-[2px]" style={{ background: c }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

/** Weakness radar over up to 8 topics. */
export function TopicRadar({ topics }: { topics: { tag: string; value: number }[] }) {
  if (topics.length < 3) {
    return <EmptyHint>Sync more data to see your topic radar.</EmptyHint>;
  }
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 42;
  const max = Math.max(...topics.map((t) => t.value));
  const n = topics.length;

  const point = (i: number, ratio: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(angle) * r * ratio, cy + Math.sin(angle) * r * ratio];
  };
  const polygon = topics.map((t, i) => point(i, t.value / max).join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-64 w-64">
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          points={topics.map((_, i) => point(i, ring).join(",")).join(" ")}
          fill="none"
          stroke="var(--color-border)"
        />
      ))}
      {topics.map((_, i) => {
        const [x, y] = point(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-border)" />;
      })}
      <polygon points={polygon} fill="var(--color-accent)" fillOpacity={0.22} stroke="var(--color-accent)" strokeWidth={1.75} />
      {topics.map((t, i) => {
        const [x, y] = point(i, 1.2);
        return (
          <text key={t.tag} x={x} y={y} fontSize={8.5} fill="var(--color-faint)" textAnchor="middle" dominantBaseline="middle">
            {t.tag.length > 12 ? t.tag.slice(0, 11) + "…" : t.tag}
          </text>
        );
      })}
    </svg>
  );
}

/** Line chart of total solved over time. */
export function GrowthChart({ snapshots }: { snapshots: { capturedAt: string; totalSolved: number }[] }) {
  if (snapshots.length < 2) {
    return <EmptyHint>Two or more syncs are needed to chart growth.</EmptyHint>;
  }
  const w = 600;
  const h = 200;
  const pad = 24;
  const values = snapshots.map((s) => s.totalSolved);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const pts = snapshots.map((s, i) => {
    const x = pad + (i / (snapshots.length - 1)) * (w - pad * 2);
    const y = h - pad - ((s.totalSolved - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const area = `${path} L${pts[pts.length - 1]![0]},${h - pad} L${pts[0]![0]},${h - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <defs>
        <linearGradient id="growth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.28} />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#growth)" />
      <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={2} />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill="var(--color-bg)" stroke="var(--color-accent)" strokeWidth={1.5} />
      ))}
    </svg>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-40 items-center justify-center text-center text-sm text-[var(--color-faint)]">
      {children}
    </div>
  );
}
