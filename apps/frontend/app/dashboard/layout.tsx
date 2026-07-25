"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import {
  LogoMark,
  OverviewIcon,
  ProblemsIcon,
  ChatIcon,
  LogoutIcon,
  MoonIcon,
  SunIcon,
} from "@/components/icons";
import { BackgroundBlobs } from "@/components/BackgroundBlobs";

const NAV = [
  { href: "/dashboard", label: "Overview", Icon: OverviewIcon, badge: null },
  { href: "/dashboard/problems", label: "Problems", Icon: ProblemsIcon, badge: null },
  { href: "/dashboard/chat", label: "AI Mentor", Icon: ChatIcon, badge: "AI" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
      <BackgroundBlobs />
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-elevated)] px-4 py-5">
        <Link href="/dashboard" className="mb-8 flex items-center gap-2.5 px-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "linear-gradient(135deg, var(--color-accent-strong), var(--color-accent))" }}
          >
            <LogoMark size={16} />
          </span>
          <span className="text-[17px] font-bold tracking-tight">LeetSense</span>
        </Link>

        <nav className="space-y-1">
          {NAV.map(({ href, label, Icon, badge }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
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
                    className="ml-auto rounded-[5px] px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-white"
                    style={{ background: "linear-gradient(135deg, var(--color-accent-strong), var(--color-accent))" }}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2">
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
          >
            {theme === "dark" ? <SunIcon size={17} /> : <MoonIcon size={17} />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>

          <div className="flex items-center gap-3 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-xs font-semibold text-[var(--color-accent-strong)]">
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
