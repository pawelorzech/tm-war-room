"use client";

import { useMemo } from "react";
import type { WarStatus, WarProgress } from "@/types/war";

const FACTION_ID = 11559;

interface WarBannerProps {
  war: WarStatus | null;
  warProgress: WarProgress | null;
}

export function WarBanner({ war, warProgress }: WarBannerProps) {
  const now = useMemo(() => Math.floor(Date.now() / 1000), []);

  // No active or upcoming war
  if (!war?.war_id || war.winner || (war.end && war.end <= now)) {
    return null;
  }

  const us = war.factions.find((f) => f.id === FACTION_ID);
  const them = war.factions.find((f) => f.id !== FACTION_ID);

  const isActive = war.start !== null && war.start <= now;

  if (isActive) {
    return (
      <div className="space-y-2">
        {/* Active war banner */}
        <div className="bg-green-950/60 border border-green-800/60 rounded-lg px-4 py-3 text-sm">
          <span className="text-torn-green font-semibold">
            {"\u2694\uFE0F"} RW ACTIVE
          </span>{" "}
          vs{" "}
          <a
            href={`https://www.torn.com/factions.php?step=profile&ID=${them?.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-text-primary hover:text-torn-green transition-colors"
          >
            {them?.name || "?"}
          </a>{" "}
          {"\u2014"}{" "}
          <strong className="text-torn-green">{us?.score || 0}</strong> :{" "}
          <span className="text-text-secondary">{them?.score || 0}</span>{" "}
          <span className="text-text-muted">(target: {war.target})</span>
        </div>

        {/* Progress bars */}
        {warProgress && (
          <div className="bg-bg-surface border border-border rounded-lg px-4 py-3 space-y-2">
            <div className="flex justify-between text-xs text-text-secondary">
              <span>
                {warProgress.our_name}: {warProgress.our_score}
              </span>
              <span>Target: {warProgress.target}</span>
              <span>
                {warProgress.their_name}: {warProgress.their_score}
              </span>
            </div>
            <div className="flex gap-1 h-3">
              <div className="flex-1 bg-bg-elevated rounded-l overflow-hidden">
                <div
                  className="h-full bg-torn-green rounded-l transition-all duration-500"
                  style={{ width: `${warProgress.our_pct}%` }}
                />
              </div>
              <div className="flex-1 bg-bg-elevated rounded-r overflow-hidden flex justify-end">
                <div
                  className="h-full bg-torn-red rounded-r transition-all duration-500"
                  style={{ width: `${warProgress.their_pct}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Upcoming war
  const diff = (war.start ?? 0) - now;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);

  return (
    <div className="bg-yellow-950/40 border border-yellow-800/40 rounded-lg px-4 py-3 text-sm">
      <span className="text-torn-yellow font-semibold">
        {"\u2694\uFE0F"} RW in {h}h {m}m
      </span>{" "}
      vs{" "}
      <a
        href={`https://www.torn.com/factions.php?step=profile&ID=${them?.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-text-primary hover:text-torn-yellow transition-colors"
      >
        {them?.name || "?"}
      </a>
    </div>
  );
}
