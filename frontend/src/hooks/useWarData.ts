"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { usePageVisible } from "@/hooks/usePageVisible";
import type {
  OverviewResponse,
  DetailResponse,
  EnemyResponse,
} from "@/types/war";

const REFRESH_INTERVAL = 60_000;

interface WarDataState {
  overview: OverviewResponse | null;
  detail: DetailResponse | null;
  enemy: EnemyResponse | null;
  loading: boolean;
  lastUpdate: Date | null;
  error: string | null;
}

export function useWarData() {
  const visible = usePageVisible();
  const [state, setState] = useState<WarDataState>({
    overview: null,
    detail: null,
    enemy: null,
    loading: true,
    lastUpdate: null,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      const [ov, det, en] = await Promise.all([
        api.overview(),
        api.detail(),
        api.enemy(),
      ]);
      setState({
        overview: ov,
        detail: det,
        enemy: en,
        loading: false,
        lastUpdate: new Date(),
        error: null,
      });
    } catch (e) {
      console.error("Refresh failed:", e);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : "Refresh failed",
      }));
    }
  }, []);

  const loadEnemy = useCallback(async (factionId: number) => {
    try {
      const en = await api.enemy(factionId);
      setState((prev) => ({ ...prev, enemy: en }));
    } catch (e) {
      console.error("Load enemy failed:", e);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [refresh, visible]);

  return {
    ...state,
    refresh,
    loadEnemy,
  };
}
