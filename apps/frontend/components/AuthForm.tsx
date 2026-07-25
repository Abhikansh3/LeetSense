"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Logo } from "@/components/icons";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { login, register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isRegister) await register(email, password, name || undefined);
      else await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">LeetSense</span>
        </Link>

        <div className="card p-7">
          <h1 className="text-xl font-semibold tracking-tight">
            {isRegister ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {isRegister ? "Start analyzing your LeetCode journey." : "Sign in to your dashboard."}
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {isRegister && (
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

            <button type="submit" disabled={loading} className="btn btn-primary w-full py-2.5">
              {loading ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
          {isRegister ? "Already have an account? " : "New here? "}
          <Link href={isRegister ? "/login" : "/register"} className="text-[var(--color-text)] underline underline-offset-4 hover:text-[var(--color-accent)]">
            {isRegister ? "Sign in" : "Create one"}
          </Link>
        </p>
      </div>
    </main>
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
      <span className="mb-1.5 block text-[13px] font-medium text-[var(--color-muted)]">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      />
    </label>
  );
}
