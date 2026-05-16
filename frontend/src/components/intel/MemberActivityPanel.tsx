"use client";

// Activity section embedded in /team row detail. Renders nothing when the
// `activity` feature flag is off (backend returns 503 in that mode anyway),
// renders an empty-state when there's no data yet, and the full SVG heatmap
// once 24h of bins have accumulated.

import { useEffect, useState } from "react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { ActivityHeatmap } from "./ActivityHeatmap";

interface ActivityResponse {
  bins: number[][];
  most_active_window: string;
}

interface Props {
  playerId: number;
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: ActivityResponse }
  | { status: "error"; message: string };

export function MemberActivityPanel({ playerId }: Props) {
  const flags = useFeatureFlags();
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    if (!flags.activity) return;
    let cancelled = false;
    setState({ status: "loading" });
    fetch(`/api/activity/${playerId}`, { credentials: "include" })
      .then(async (r) => {
        if (r.status === 503 || r.status === 404) {
          // Feature disabled or no data — treat both as silent.
          if (!cancelled) setState({ status: "ready", data: { bins: emptyMatrix(), most_active_window: "" } });
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = (await r.json()) as ActivityResponse;
        if (!cancelled) setState({ status: "ready", data: body });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: e instanceof Error ? e.message : "Failed to load activity",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [playerId, flags.activity]);

  if (!flags.activity) return null;

  if (state.status === "loading" || state.status === "idle") {
    return (
      <div className="rounded-lg border border-border bg-bg-surface p-4 text-sm text-text-muted">
        Loading activity heatmap…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-border bg-bg-surface p-4 text-xs text-text-muted">
        Activity unavailable: {state.message}
      </div>
    );
  }

  return (
    <ActivityHeatmap
      bins={state.data.bins}
      mostActiveWindow={state.data.most_active_window}
    />
  );
}

function emptyMatrix(): number[][] {
  return Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
}
