"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api-client";
import type { OverviewResponse, EnemyResponse } from "@/types/war";

const REFRESH_INTERVAL = 60_000;

export function useEnemyData() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [enemy, setEnemy] = useState<EnemyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [ov, en] = await Promise.all([api.overview(), api.enemy()]);
      setOverview(ov);
      setEnemy(en);
      setLastUpdate(new Date());
    } catch (e) {
      console.error("Enemy refresh failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEnemy = useCallback(async (factionId: number) => {
    try {
      const en = await api.enemy(factionId);
      setEnemy(en);
    } catch (e) {
      console.error("Load enemy failed:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, REFRESH_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refresh]);

  return { overview, enemy, loading, lastUpdate, refresh, loadEnemy };
}
