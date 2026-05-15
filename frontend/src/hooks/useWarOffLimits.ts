"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import type { WarOffLimits } from "@/types/war";

interface State {
  entries: WarOffLimits[];
  loading: boolean;
  error: string | null;
}

const EMPTY: State = { entries: [], loading: false, error: null };

/**
 * War-scoped off-limits flags. Pass `warId = null` when there is no active war
 * — the hook stays inert and returns an empty map.
 */
export function useWarOffLimits(warId: number | null) {
  const [state, setState] = useState<State>(EMPTY);

  const refresh = useCallback(async () => {
    if (!warId) {
      setState(EMPTY);
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const resp = await api.warOffLimitsList(warId);
      setState({ entries: resp.entries, loading: false, error: null });
    } catch (e) {
      setState({ entries: [], loading: false, error: e instanceof Error ? e.message : "Failed to load" });
    }
  }, [warId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(
    async (playerId: number, playerName: string, reason: string) => {
      if (!warId) throw new Error("No active war");
      await api.warOffLimitsAdd(warId, { player_id: playerId, player_name: playerName, reason });
      await refresh();
    },
    [warId, refresh],
  );

  const update = useCallback(
    async (playerId: number, reason: string) => {
      if (!warId) throw new Error("No active war");
      await api.warOffLimitsUpdate(warId, playerId, { reason });
      await refresh();
    },
    [warId, refresh],
  );

  const remove = useCallback(
    async (playerId: number) => {
      if (!warId) throw new Error("No active war");
      await api.warOffLimitsRemove(warId, playerId);
      await refresh();
    },
    [warId, refresh],
  );

  const byPlayer = useMemo(() => {
    const map = new Map<number, WarOffLimits>();
    for (const e of state.entries) map.set(e.player_id, e);
    return map;
  }, [state.entries]);

  return {
    entries: state.entries,
    byPlayer,
    loading: state.loading,
    error: state.error,
    refresh,
    add,
    update,
    remove,
  };
}
