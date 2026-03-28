"use client";

import type { OverviewResponse } from "@/types/war";

const FACTION_ID = 11559;

interface ChainStatusProps {
  overview: OverviewResponse | null;
}

function isWarActive(overview: OverviewResponse | null): boolean {
  const war = overview?.war;
  if (!war?.war_id) return false;
  const now = Math.floor(Date.now() / 1000);
  if (war.winner || (war.end && war.end <= now)) return false;
  return war.start !== null && war.start <= now;
}

export function ChainStatus({ overview }: ChainStatusProps) {
  if (!overview?.chain || !isWarActive(overview)) return null;

  const c = overview.chain;
  if (c.current <= 0) return null;

  return (
    <div className="bg-bg-surface border border-border rounded-lg px-4 py-2 text-sm text-text-secondary">
      Chain:{" "}
      <span className="text-torn-green font-medium">{c.current}</span>/
      {c.max}{" "}
      <span className="text-text-muted">({c.modifier}x bonus)</span>
    </div>
  );
}

export { isWarActive, FACTION_ID };
