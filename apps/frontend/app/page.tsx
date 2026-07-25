import Link from "next/link";
import { LogoMark, ArrowRightIcon, OverviewIcon, ChatIcon, SyncIcon } from "@/components/icons";
import { BackgroundBlobs } from "@/components/BackgroundBlobs";

const features = [
  { icon: SyncIcon, title: "Real-time sync", body: "Import your LeetCode history with live, staged progress over SSE." },
  { icon: ChatIcon, title: "Grounded AI mentor", body: "Ask questions answered from your actual submissions, not generic advice." },
  { icon: OverviewIcon, title: "Deep analytics", body: "Activity heatmaps, topic strength radar, and growth trends over time." },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <BackgroundBlobs />
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "linear-gradient(135deg, var(--color-accent-strong), var(--color-accent))" }}
          >
            <LogoMark size={16} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">LeetSense</span>
        </div>
        <nav className="flex items-center gap-1">
          <Link href="/login" className="btn btn-ghost">
            Sign in
          </Link>
          <Link href="/register" className="btn btn-primary">
            Get started
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="border-b border-[var(--color-border)] py-24 text-center">
          <div className="badge mx-auto mb-6 w-fit">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            AI-powered · RAG · Gemini
          </div>
          <h1 className="mx-auto max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Understand your LeetCode practice, not just track it.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-muted)]">
            LeetSense syncs your solved history and gives you an AI mentor grounded in your real
            data — what to practice next, where you&apos;re weak, and how you&apos;re improving.
          </p>
          <div className="mt-9 flex items-center justify-center gap-3">
            <Link href="/register" className="btn btn-primary px-5 py-2.5">
              Start analyzing <ArrowRightIcon size={16} />
            </Link>
            <Link href="/login" className="btn btn-secondary px-5 py-2.5">
              Sign in
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="bg-[var(--color-surface)] p-6">
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                <f.icon size={18} />
              </div>
              <h3 className="text-[15px] font-medium">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-muted)]">{f.body}</p>
            </div>
          ))}
        </section>

        <footer className="py-10 text-center text-sm text-[var(--color-faint)]">
          Built with Next.js, Express, Prisma, Gemini & ChromaDB.
        </footer>
      </main>
    </div>
  );
}
