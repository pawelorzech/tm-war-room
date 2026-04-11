"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { getOverview } from "@/lib/overview-cache";
import { usePageVisible } from "@/hooks/usePageVisible";
import type { OverviewResponse, EnemyResponse } from "@/types/war";

const REFRESH_INTERVAL = 60_000;

export function useEnemyData() {
  const visible = usePageVisible();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [enemy, setEnemy] = useState<EnemyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [ov, en] = await Promise.all([getOverview(), api.enemy()]);
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
    if (!visible) return;
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [refresh, visible]);

  return { overview, enemy, loading, lastUpdate, refresh, loadEnemy };
}
