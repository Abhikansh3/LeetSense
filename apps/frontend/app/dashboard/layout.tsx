"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "📊" },
  { href: "/dashboard/problems", label: "Problems", icon: "🧩" },
  { href: "/dashboard/chat", label: "AI Mentor", icon: "🤖" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-gray-500">Loading…</div>;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <Link href="/dashboard" className="mb-8 px-2 text-xl font-bold text-white">
          Leet<span className="text-[var(--color-accent-2)]">Sense</span>
        </Link>
        <nav className="space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-[var(--color-accent)]/15 text-white"
                    : "text-gray-400 hover:bg-[var(--color-surface-2)] hover:text-white"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-[var(--color-border)] pt-4">
          <p className="truncate px-2 text-sm text-gray-300">{user.name ?? user.email}</p>
          <p className="truncate px-2 text-xs text-gray-500">
            {user.leetcodeUsername ? `@${user.leetcodeUsername}` : "No LeetCode linked"}
          </p>
          <button
            onClick={() => logout().then(() => router.push("/login"))}
            className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-gray-400 hover:bg-[var(--color-surface-2)] hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
