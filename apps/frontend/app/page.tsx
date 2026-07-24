import Link from "next/link";

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1 text-xs font-medium text-[var(--color-accent-2)]">
        AI-powered · RAG · Gemini
      </span>
      <h1 className="bg-gradient-to-r from-indigo-400 to-cyan-300 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl">
        LeetSense
      </h1>
      <p className="mt-6 max-w-xl text-lg text-gray-400">
        Sync your LeetCode history and ask an AI mentor — grounded in your real data — what
        to practice next, where you&apos;re weak, and how you&apos;re growing.
      </p>
      <div className="mt-10 flex gap-4">
        <Link
          href="/register"
          className="rounded-lg bg-[var(--color-accent)] px-6 py-3 font-medium text-white transition hover:opacity-90"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 font-medium transition hover:bg-[var(--color-surface-2)]"
        >
          Sign in
        </Link>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
        {[
          { t: "Real-time sync", d: "9-stage SSE progress as your history imports." },
          { t: "RAG chatbot", d: "Answers grounded in your actual submissions." },
          { t: "Deep analytics", d: "Heatmaps, topic radar, and growth trends." },
        ].map((f) => (
          <div key={f.t} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h3 className="font-semibold text-white">{f.t}</h3>
            <p className="mt-1 text-sm text-gray-400">{f.d}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
