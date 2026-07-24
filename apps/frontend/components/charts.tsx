"use client";

/** Shared card wrapper. */
export function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 ${className}`}>
      {title && <h3 className="mb-4 text-sm font-semibold text-gray-300">{title}</h3>}
      {children}
    </div>
  );
}

export function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-1 text-3xl font-bold" style={{ color: accent ?? "#fff" }}>
        {value}
      </p>
    </div>
  );
}

const DIFF_COLORS = { EASY: "var(--color-easy)", MEDIUM: "var(--color-medium)", HARD: "var(--color-hard)" };

export function DifficultyBar({ data }: { data: { EASY: number; MEDIUM: number; HARD: number } }) {
  const total = data.EASY + data.MEDIUM + data.HARD || 1;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-[var(--color-bg)]">
        {(["EASY", "MEDIUM", "HARD"] as const).map((k) => (
          <div key={k} style={{ width: `${(data[k] / total) * 100}%`, background: DIFF_COLORS[k] }} />
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-sm">
        {(["EASY", "MEDIUM", "HARD"] as const).map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: DIFF_COLORS[k] }} />
            <span className="text-gray-400">
              {k[0] + k.slice(1).toLowerCase()} <span className="font-semibold text-white">{data[k]}</span>
            </span>
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

  const color = (c: number) => {
    if (c === 0) return "var(--color-bg)";
    const t = c / max;
    if (t > 0.66) return "#6366f1";
    if (t > 0.33) return "#4f46e5";
    return "#3730a3";
  };

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-flow-col grid-rows-7 gap-1" style={{ width: "max-content" }}>
        {cells.map((cell) => (
          <div
            key={cell.date}
            title={`${cell.date}: ${cell.count} solved`}
            className="h-3 w-3 rounded-sm"
            style={{ background: color(cell.count) }}
          />
        ))}
      </div>
    </div>
  );
}

/** Weakness radar over up to 8 topics. */
export function TopicRadar({ topics }: { topics: { tag: string; value: number }[] }) {
  if (topics.length < 3) {
    return <p className="text-sm text-gray-500">Sync more data to see your topic radar.</p>;
  }
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 40;
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
      <polygon points={polygon} fill="rgba(99,102,241,0.35)" stroke="var(--color-accent)" strokeWidth={2} />
      {topics.map((t, i) => {
        const [x, y] = point(i, 1.18);
        return (
          <text key={t.tag} x={x} y={y} fontSize={8} fill="#9ca3af" textAnchor="middle" dominantBaseline="middle">
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
    return <p className="text-sm text-gray-500">Two or more syncs are needed to chart growth.</p>;
  }
  const w = 600;
  const h = 200;
  const pad = 30;
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
          <stop offset="0%" stopColor="rgba(34,211,238,0.35)" />
          <stop offset="100%" stopColor="rgba(34,211,238,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#growth)" />
      <path d={path} fill="none" stroke="var(--color-accent-2)" strokeWidth={2} />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill="var(--color-accent-2)" />
      ))}
    </svg>
  );
}
