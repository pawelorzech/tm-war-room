"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { usePageVisible } from "@/hooks/usePageVisible";
import type { OverviewResponse, DetailResponse } from "@/types/war";

const REFRESH_INTERVAL = 60_000;

export function useTeamData() {
  const visible = usePageVisible();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [ov, det] = await Promise.all([api.overview(), api.detail()]);
      setOverview(ov);
      setDetail(det);
      setLastUpdate(new Date());
    } catch (e) {
      console.error("Team refresh failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [refresh, visible]);

  return { overview, detail, loading, lastUpdate, refresh };
}
