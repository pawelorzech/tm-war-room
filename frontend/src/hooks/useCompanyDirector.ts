"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type {
  DirectorMeResponse,
  DirectorFactionResponse,
  DirectorNewsResponse,
  DirectorTrendsResponse,
  ApplicationsRankedResponse,
  WeeklyComparisonResponse,
  PinnedWeek,
  TrainsAlertRow,
} from "@/types/company-director";

interface DirectorState {
  me: DirectorMeResponse | null;
  faction: DirectorFactionResponse | null;
  news: DirectorNewsResponse | null;
  trends: DirectorTrendsResponse | null;
  ranked: ApplicationsRankedResponse | null;
  comparison: WeeklyComparisonResponse | null;
  pinned: PinnedWeek[];
  trainsAlerts: TrainsAlertRow[];
  loading: boolean;
  newsLoading: boolean;
  trendsLoading: boolean;
  rankedLoading: boolean;
  comparisonLoading: boolean;
  pinnedLoading: boolean;
  alertsLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
}

const EMPTY: DirectorState = {
  me: null,
  faction: null,
  news: null,
  trends: null,
  ranked: null,
  comparison: null,
  pinned: [],
  trainsAlerts: [],
  loading: true,
  newsLoading: false,
  trendsLoading: false,
  rankedLoading: false,
  comparisonLoading: false,
  pinnedLoading: false,
  alertsLoading: false,
  error: null,
  lastUpdate: null,
};

export function useCompanyDirector() {
  const [state, setState] = useState<DirectorState>(EMPTY);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [me, faction] = await Promise.all([
        api.companyDirectorMe().catch(() => null),
        api.companyDirectorFaction().catch(() => null),
      ]);
      setState((prev) => ({
        ...prev,
        me,
        faction,
        loading: false,
        lastUpdate: new Date(),
      }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : "Refresh failed",
      }));
    }
  }, []);

  const loadNews = useCallback(async (opts?: { from?: number; limit?: number }) => {
    setState((prev) => ({ ...prev, newsLoading: true }));
    try {
      const news = await api.companyDirectorNews(opts);
      setState((prev) => ({ ...prev, news, newsLoading: false }));
    } catch {
      setState((prev) => ({ ...prev, newsLoading: false }));
    }
  }, []);

  const loadTrends = useCallback(async (days = 30) => {
    setState((prev) => ({ ...prev, trendsLoading: true }));
    try {
      const trends = await api.companyDirectorTrends(days);
      setState((prev) => ({ ...prev, trends, trendsLoading: false }));
    } catch {
      setState((prev) => ({ ...prev, trendsLoading: false }));
    }
  }, []);

  const loadRanked = useCallback(async () => {
    setState((prev) => ({ ...prev, rankedLoading: true }));
    try {
      const ranked = await api.companyDirectorApplicationsRanked();
      setState((prev) => ({ ...prev, ranked, rankedLoading: false }));
    } catch {
      setState((prev) => ({ ...prev, rankedLoading: false }));
    }
  }, []);

  const loadComparison = useCallback(
    async (opts?: { week_start?: number; scope?: 'same_type' | 'all' }) => {
      setState((prev) => ({ ...prev, comparisonLoading: true }));
      try {
        const comparison = await api.companyDirectorWeeklyComparison(opts);
        setState((prev) => ({ ...prev, comparison, comparisonLoading: false }));
      } catch {
        setState((prev) => ({ ...prev, comparisonLoading: false }));
      }
    },
    [],
  );

  const loadPinned = useCallback(async () => {
    setState((prev) => ({ ...prev, pinnedLoading: true }));
    try {
      const res = await api.companyDirectorPinnedWeeks();
      setState((prev) => ({ ...prev, pinned: res.pinned, pinnedLoading: false }));
    } catch {
      setState((prev) => ({ ...prev, pinnedLoading: false }));
    }
  }, []);

  const pinWeek = useCallback(
    async (week_start: number, label: string, note?: string) => {
      const created = await api.companyDirectorPinWeek({ week_start, label, note });
      setState((prev) => ({
        ...prev,
        pinned: [created, ...prev.pinned.filter((p) => p.id !== created.id)].sort(
          (a, b) => b.week_start_ts - a.week_start_ts,
        ),
      }));
      return created;
    },
    [],
  );

  const unpinWeek = useCallback(async (id: number) => {
    await api.companyDirectorDeletePinnedWeek(id);
    setState((prev) => ({ ...prev, pinned: prev.pinned.filter((p) => p.id !== id) }));
  }, []);

  const loadTrainsAlerts = useCallback(async () => {
    setState((prev) => ({ ...prev, alertsLoading: true }));
    try {
      const res = await api.companyDirectorTrainsAlerts();
      setState((prev) => ({ ...prev, trainsAlerts: res.alerts, alertsLoading: false }));
    } catch {
      setState((prev) => ({ ...prev, alertsLoading: false }));
    }
  }, []);

  const toggleTrainsAlert = useCallback(
    async (target_player_id: number, enabled: boolean, threshold_days = 3) => {
      await api.companyDirectorUpsertTrainsAlert({ target_player_id, enabled, threshold_days });
      setState((prev) => {
        const without = prev.trainsAlerts.filter((a) => a.target_player_id !== target_player_id);
        if (!enabled) return { ...prev, trainsAlerts: without };
        return {
          ...prev,
          trainsAlerts: [
            ...without,
            {
              company_id: prev.me?.company_id ?? 0,
              alert_type: 'company_trains_stagnant',
              target_player_id,
              threshold_days,
              created_at: Math.floor(Date.now() / 1000),
            },
          ],
        };
      });
    },
    [],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
    loadNews,
    loadTrends,
    loadRanked,
    loadComparison,
    loadPinned,
    pinWeek,
    unpinWeek,
    loadTrainsAlerts,
    toggleTrainsAlert,
  };
}
