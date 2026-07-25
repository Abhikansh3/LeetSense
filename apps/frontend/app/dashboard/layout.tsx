"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { AppDataProvider } from "@/lib/app-data";
import { hasSkippedOnboarding } from "@/lib/onboarding";
import {
  LogoMark,
  OverviewIcon,
  ActivityIcon,
  ProblemsIcon,
  ChatIcon,
  ProfileIcon,
  LogoutIcon,
  MoonIcon,
  SunIcon,
} from "@/components/icons";
import { BackgroundBlobs } from "@/components/BackgroundBlobs";

// AI chat leads, then a rule, then the analytics pages.
const NAV = [
  { href: "/dashboard/chat", label: "AI Chat", Icon: ChatIcon, badge: "AI" },
  { href: "/dashboard", label: "Dashboard", Icon: OverviewIcon, badge: null },
  { href: "/dashboard/problems", label: "Questions", Icon: ProblemsIcon, badge: null },
  { href: "/dashboard/activity", label: "Activity", Icon: ActivityIcon, badge: null },
  { href: "/dashboard/profile", label: "Profile", Icon: ProfileIcon, badge: null },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    // A user with no linked handle has nothing to show — send them to
    // onboarding instead of a dashboard full of zeroes, unless they chose
    // to skip it for this session.
    else if (!user.leetcodeUsername && !hasSkippedOnboarding()) router.replace("/onboarding");
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
      <BackgroundBlobs />
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-elevated)] px-4 py-[22px]">
        <Link href="/dashboard" className="mb-8 flex items-center gap-2.5 px-2">
          <span
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg"
            style={{ background: "linear-gradient(135deg, var(--color-accent-strong), var(--color-accent))" }}
          >
            <LogoMark size={16} />
          </span>
          <span className="text-[17px] font-bold tracking-[-0.02em]">LeetSense</span>
        </Link>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, Icon, badge }, idx) => {
            const active = pathname === href;
            return (
              <div key={href}>
                {/* Rule separating the AI entry point from the analytics pages. */}
                {idx === 1 && <div className="mx-1 mb-1.5 mt-2 h-px bg-[var(--color-border)]" />}
                <Link
                  href={href}
                  className={`flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-sm font-semibold transition ${
                    active
                      ? "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                      : "border-transparent text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                  }`}
                >
                  <Icon size={17} />
                  {label}
                  {badge && (
                    <span
                      className="ml-auto rounded-[5px] px-1.5 py-0.5 text-[9px] font-extrabold tracking-[0.04em] text-white"
                      style={{ background: "linear-gradient(135deg, var(--color-accent-strong), var(--color-accent))" }}
                    >
                      {badge}
                    </span>
                  )}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2.5">
          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex w-full items-center justify-between rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-[11px]"
          >
            <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-muted)]">
              {theme === "dark" ? <MoonIcon size={14} /> : <SunIcon size={14} />}
              {theme === "dark" ? "Dark mode" : "Light mode"}
            </span>
            <span
              className="relative h-5 w-[34px] rounded-xl transition-colors"
              style={{ background: theme === "dark" ? "var(--color-surface-2)" : "var(--color-accent)" }}
            >
              <span
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
                style={{ left: theme === "dark" ? 2 : 16 }}
              />
            </span>
          </button>

          <div className="flex items-center gap-2.5 px-2 py-2.5">
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[13px] font-bold text-[var(--color-accent)]">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold">{user.name ?? user.email}</p>
              <p className="truncate text-[11px] text-[var(--color-faint)]">
                {user.leetcodeUsername ?? "No LeetCode linked"}
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

      <main className="min-w-0 flex-1">
        <AppDataProvider>{children}</AppDataProvider>
      </main>
    </div>
  );
}
