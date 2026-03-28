"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api-client";
import type { OverviewResponse, DetailResponse } from "@/types/war";

const REFRESH_INTERVAL = 60_000;

export function useTeamData() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    refresh();
    intervalRef.current = setInterval(refresh, REFRESH_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refresh]);

  return { overview, detail, loading, lastUpdate, refresh };
}
