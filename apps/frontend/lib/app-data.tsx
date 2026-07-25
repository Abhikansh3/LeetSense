"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

export interface Snapshot {
  capturedAt: string;
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  ranking: number | null;
}

export interface Overview {
  snapshot: Snapshot | null;
  totalSubmissions: number;
  byDifficulty: { EASY: number; MEDIUM: number; HARD: number };
  topTopics: { tag: string; count: number }[];
  languages: { lang: string; count: number }[];
}

interface AppData {
  overview: Overview | null;
  heatmap: { date: string; count: number }[];
  radar: { tag: string; value: number }[];
  snapshots: Snapshot[];
  loading: boolean;
  error: string | null;
  /** Re-fetches every dashboard dataset — call after a sync completes. */
  refresh: () => Promise<void>;
}

const AppDataContext = createContext<AppData | null>(null);

/**
 * Loads the dashboard datasets once and shares them across every page, so
 * navigating between Overview / Activity / Profile doesn't refetch the same
 * four endpoints each time.
 */
export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [heatmap, setHeatmap] = useState<{ date: string; count: number }[]>([]);
  const [radar, setRadar] = useState<{ tag: string; value: number }[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guards against a second load when React 18 double-invokes effects in dev.
  const loadedFor = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, h, r, s] = await Promise.all([
        api<Overview>("/stats/overview"),
        api<{ days: { date: string; count: number }[] }>("/stats/heatmap"),
        api<{ topics: { tag: string; value: number }[] }>("/stats/radar"),
        api<{ snapshots: Snapshot[] }>("/stats/snapshots"),
      ]);
      setOverview(o);
      setHeatmap(h.days);
      setRadar(r.topics);
      setSnapshots(s.snapshots);
    } catch (err) {
      // Previously these rejections were swallowed and the UI just showed
      // zeroes, which read as "the data is wrong" rather than "it failed".
      setError(err instanceof Error ? err.message : "Could not load your stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      loadedFor.current = null;
      return;
    }
    if (loadedFor.current === user.id) return;
    loadedFor.current = user.id;
    void refresh();
  }, [user, refresh]);

  const value = useMemo(
    () => ({ overview, heatmap, radar, snapshots, loading, error, refresh }),
    [overview, heatmap, radar, snapshots, loading, error, refresh],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
