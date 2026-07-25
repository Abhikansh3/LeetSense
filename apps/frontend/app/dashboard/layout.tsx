"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Logo, OverviewIcon, ProblemsIcon, ChatIcon, LogoutIcon } from "@/components/icons";

const NAV = [
  { href: "/dashboard", label: "Overview", Icon: OverviewIcon },
  { href: "/dashboard/problems", label: "Problems", Icon: ProblemsIcon },
  { href: "/dashboard/chat", label: "AI Mentor", Icon: ChatIcon },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--color-faint)]">
        Loading…
      </div>
    );
  }

  const initials = (user.name ?? user.email).slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-5">
        <Link href="/dashboard" className="mb-8 flex items-center gap-2 px-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">LeetSense</span>
        </Link>

        <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--color-faint)]">
          Menu
        </p>
        <nav className="space-y-0.5">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-[var(--color-surface)] font-medium text-[var(--color-text)]"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                }`}
              >
                <Icon size={17} className={active ? "text-[var(--color-accent)]" : ""} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-xs font-semibold text-[var(--color-accent)]">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{user.name ?? user.email}</p>
              <p className="truncate text-xs text-[var(--color-faint)]">
                {user.leetcodeUsername ? `@${user.leetcodeUsername}` : "No LeetCode linked"}
              </p>
            </div>
            <button
              onClick={() => logout().then(() => router.push("/login"))}
              title="Sign out"
              className="rounded-md p-1.5 text-[var(--color-faint)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
            >
              <LogoutIcon size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
