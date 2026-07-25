"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { LogoMark } from "@/components/icons";

/**
 * Split entry screen: a decorative hero on the left and a tabbed sign-in /
 * sign-up form on the right. Replaces the previous separate landing, login and
 * register pages, so there is one door into the app.
 */
export function AuthScreen({ initialMode = "signin" }: { initialMode?: "signin" | "signup" }) {
  const router = useRouter();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === "signup";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isSignup) {
        await register(email.trim(), password, name.trim() || undefined);
        router.replace("/onboarding");
      } else {
        await login(email.trim(), password);
        router.replace("/dashboard");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell grid min-h-screen grid-cols-[1fr_480px] bg-[var(--color-bg)]">
      {/* ── Hero ── */}
      <div className="auth-hero relative flex flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 overflow-hidden bg-[oklch(0.1_0_0)]">
          <div
            className="absolute rounded-full"
            style={{
              width: "70%",
              height: "70%",
              left: "-10%",
              top: "-10%",
              background: "oklch(0.58 0.21 260.84 / 0.55)",
              filter: "blur(90px)",
              animation: "blobDrift1 22s ease-in-out infinite",
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: "60%",
              height: "60%",
              right: "-10%",
              bottom: "-5%",
              background: "oklch(0.68 0.19 260.84 / 0.4)",
              filter: "blur(100px)",
              animation: "blobDrift2 26s ease-in-out infinite",
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: "45%",
              height: "45%",
              left: "20%",
              bottom: "10%",
              background: "oklch(0.4 0.16 260.84 / 0.5)",
              filter: "blur(80px)",
              animation: "blobDrift3 19s ease-in-out infinite",
            }}
          />
        </div>
        {/* Vignette so the glass panels keep contrast over moving colour. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, oklch(0 0 0 / 0.15) 0%, oklch(0 0 0 / 0.05) 30%, oklch(0 0 0 / 0.15) 65%, oklch(0 0 0 / 0.55) 100%)",
          }}
        />

        <div className="relative px-8 pt-8">
          <div className="inline-flex items-center gap-2.5 rounded-xl border border-white/[0.12] bg-[oklch(0.1_0_0/0.72)] py-2.5 pl-2.5 pr-4 backdrop-blur">
            <span
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg"
              style={{ background: "linear-gradient(135deg, var(--color-accent-strong), var(--color-accent))" }}
            >
              <LogoMark size={16} />
            </span>
            <span className="text-lg font-bold tracking-[-0.02em] text-white">LeetSense</span>
          </div>
        </div>

        <div className="animate-fadeup relative max-w-[520px] px-8">
          <div className="rounded-[18px] border border-white/[0.12] bg-[oklch(0.1_0_0/0.72)] px-[26px] py-6 backdrop-blur">
            <h1 className="mb-3 text-[36px] font-bold leading-[1.14] tracking-[-0.02em] text-white">
              Know your coding
              <br />
              trajectory, not just
              <br />
              your streak.
            </h1>
            <p className="text-sm leading-relaxed text-[oklch(0.85_0_0)]">
              LeetSense syncs every solve and turns it into a conversation you can actually ask questions to.
            </p>
          </div>
        </div>

        <div className="relative px-8 pb-8 pt-6">
          <div className="mb-2.5 inline-block rounded-lg bg-[oklch(0.1_0_0/0.82)] px-2.5 py-[5px] text-[11px] font-bold uppercase tracking-[0.08em] text-[oklch(0.85_0_0)]">
            Ask LeetSense — grounded in your synced data
          </div>
          <div className="flex flex-col gap-2 rounded-2xl border border-white/[0.12] bg-[oklch(0.1_0_0/0.82)] px-5 py-[18px] backdrop-blur">
            <div
              className="max-w-[80%] self-end px-3.5 py-2.5 text-[13px] text-white"
              style={{ background: "var(--color-accent)", borderRadius: "12px 12px 2px 12px" }}
            >
              What&apos;s my weakest topic right now?
            </div>
            <div
              className="max-w-[88%] self-start bg-white/[0.08] px-3.5 py-2.5 text-[13px] leading-relaxed text-white"
              style={{ borderRadius: "12px 12px 12px 2px" }}
            >
              Dynamic Programming — 4 solved against 38 on Array, and only 1 Hard cleared. Worth a run of Medium DP next.
            </div>
            <div className="mt-0.5 flex gap-1.5 pl-0.5">
              {["skill-advanced", "weakness-analysis"].map((t) => (
                <span key={t} className="num rounded-md bg-white/[0.08] px-2 py-[3px] text-[10px] text-[oklch(0.8_0_0)]">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Form ── */}
      <div className="flex flex-col justify-center px-10 py-12">
        <div className="mx-auto w-full max-w-[360px]">
          <h2 className="text-[22px] font-bold tracking-[-0.02em]">
            {isSignup ? "Create your account" : "Welcome back"}
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {isSignup ? "Start analysing your LeetCode practice." : "Sign in to your dashboard."}
          </p>

          <div className="mt-6 flex gap-1 rounded-[11px] bg-[var(--color-bg-subtle)] p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`flex-1 rounded-[9px] py-2.5 text-[13px] font-bold transition ${
                  mode === m
                    ? "bg-[var(--color-elevated)] text-[var(--color-text)] shadow-sm"
                    : "text-[var(--color-faint)] hover:text-[var(--color-muted)]"
                }`}
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            {isSignup && (
              <Field label="Name" value={name} onChange={setName} type="text" placeholder="Ada Lovelace" required={false} />
            )}
            <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@example.com" />
            <Field
              label="Password"
              value={password}
              onChange={setPassword}
              type="password"
              placeholder="At least 8 characters"
            />

            {error && (
              <p className="rounded-lg border border-[var(--color-hard)]/30 bg-[var(--color-hard)]/10 px-3 py-2 text-sm text-[var(--color-hard)]">
                {error}
              </p>
            )}

            <button type="submit" disabled={submitting} className="btn btn-primary w-full py-3">
              {submitting ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-[var(--color-faint)]">
            {isSignup ? "Already have an account? " : "New to LeetSense? "}
            <button
              type="button"
              onClick={() => {
                setMode(isSignup ? "signin" : "signup");
                setError(null);
              }}
              className="font-semibold text-[var(--color-accent)] hover:underline"
            >
              {isSignup ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  placeholder,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[var(--color-muted)]">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="input"
        style={{ padding: "12px 14px" }}
      />
    </label>
  );
}
