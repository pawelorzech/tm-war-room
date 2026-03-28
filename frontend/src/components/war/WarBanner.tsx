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
        {/* Active war banner — commanding with glow */}
        <div
          className="bg-green-950/60 border border-green-700/50 rounded-lg px-4 py-3 text-sm"
          style={{ animation: "tm-war-glow 3s ease-in-out infinite" }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-torn-green font-bold tracking-wide uppercase text-xs"
              style={{ animation: "tm-glow-pulse 2.5s ease-in-out infinite" }}
            >
              {"\u2694\uFE0F"} RW ACTIVE
            </span>
            <span className="text-text-secondary">vs</span>
            <a
              href={`https://www.torn.com/factions.php?step=profile&ID=${them?.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-text-primary hover:text-torn-green transition-colors"
            >
              {them?.name || "?"}
            </a>
            <span className="text-text-muted">{"\u2014"}</span>
            <span className="font-mono">
              <strong className="text-torn-green text-base">{us?.score || 0}</strong>
              <span className="text-text-muted mx-1">:</span>
              <span className="text-torn-red text-base">{them?.score || 0}</span>
            </span>
            <span className="text-text-muted text-xs">(target: {war.target})</span>
          </div>
        </div>

        {/* Progress bars — striking with gradient fills */}
        {warProgress && (
          <div className="bg-bg-surface border border-border rounded-lg px-4 py-3 space-y-2.5">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-torn-green">
                {warProgress.our_name}: {warProgress.our_score}
              </span>
              <span className="text-text-muted font-mono text-[11px]">
                Target: {warProgress.target}
              </span>
              <span className="text-torn-red">
                {warProgress.their_name}: {warProgress.their_score}
              </span>
            </div>
            <div className="flex gap-1.5 h-4">
              {/* Our progress */}
              <div className="flex-1 bg-bg-elevated rounded-full overflow-hidden border border-border-light">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${warProgress.our_pct}%`,
                    background: "linear-gradient(90deg, #238636 0%, #3fb950 60%, #56d364 100%)",
                    backgroundSize: "200% 100%",
                    animation: "tm-progress-shimmer 3s linear infinite",
                  }}
                />
              </div>
              {/* Their progress */}
              <div className="flex-1 bg-bg-elevated rounded-full overflow-hidden flex justify-end border border-border-light">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${warProgress.their_pct}%`,
                    background: "linear-gradient(270deg, #da3633 0%, #f85149 60%, #ff7b72 100%)",
                    backgroundSize: "200% 100%",
                    animation: "tm-progress-shimmer 3s linear infinite",
                  }}
                />
              </div>
            </div>
            {/* Percentage labels below bars */}
            <div className="flex justify-between text-[10px] text-text-muted font-mono">
              <span>{warProgress.our_pct}%</span>
              <span>{warProgress.their_pct}%</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Upcoming war — urgent countdown
  const diff = (war.start ?? 0) - now;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);

  const isUrgent = diff < 1800; // less than 30 min

  return (
    <div
      className={`border rounded-lg px-4 py-3 text-sm ${
        isUrgent
          ? "bg-red-950/40 border-red-800/50"
          : "bg-yellow-950/40 border-yellow-800/40"
      }`}
      style={isUrgent ? { animation: "tm-countdown-pulse 1.5s ease-in-out infinite" } : undefined}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`font-bold tracking-wide ${isUrgent ? "text-torn-red" : "text-torn-yellow"}`}
        >
          {"\u2694\uFE0F"} RW in{" "}
          <span className="font-mono text-base">
            {h}h {m}m
          </span>
        </span>
        <span className="text-text-secondary">vs</span>
        <a
          href={`https://www.torn.com/factions.php?step=profile&ID=${them?.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`font-bold text-text-primary transition-colors ${
            isUrgent ? "hover:text-torn-red" : "hover:text-torn-yellow"
          }`}
        >
          {them?.name || "?"}
        </a>
        {isUrgent && (
          <span className="text-[10px] uppercase tracking-wider text-torn-red font-semibold ml-auto">
            Starting soon
          </span>
        )}
      </div>
    </div>
  );
}
