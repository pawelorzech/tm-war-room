"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type {
  DirectorMeResponse,
  DirectorFactionResponse,
  DirectorNewsResponse,
  DirectorTrendsResponse,
} from "@/types/company-director";

interface DirectorState {
  me: DirectorMeResponse | null;
  faction: DirectorFactionResponse | null;
  news: DirectorNewsResponse | null;
  trends: DirectorTrendsResponse | null;
  loading: boolean;
  newsLoading: boolean;
  trendsLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
}

export function useCompanyDirector() {
  const [state, setState] = useState<DirectorState>({
    me: null,
    faction: null,
    news: null,
    trends: null,
    loading: true,
    newsLoading: false,
    trendsLoading: false,
    error: null,
    lastUpdate: null,
  });

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

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh, loadNews, loadTrends };
}
