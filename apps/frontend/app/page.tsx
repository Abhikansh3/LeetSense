"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/**
 * There is no separate marketing page — the auth screen is the front door.
 * Signed-in visitors go straight to their dashboard.
 */
export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/dashboard" : "/login");
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-surface-2)] border-t-[var(--color-accent)]" />
    </div>
  );
}
