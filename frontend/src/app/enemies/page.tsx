"use client";

import { useEnemyData } from "@/hooks/useEnemyData";
import { WarBanner } from "@/components/war/WarBanner";
import { ChainStatus } from "@/components/war/ChainStatus";
import { EnemyTable } from "@/components/war/EnemyTable";
import { PageExplainer } from "@/components/layout/PageExplainer";
import { RefreshButton } from "@/components/layout/RefreshButton";

export default function EnemiesPage() {
  const { overview, enemy, loading, lastUpdate, refresh, loadEnemy } =
    useEnemyData();

  if (loading && !overview) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[200px]">
        <div className="text-text-secondary text-sm">Loading enemy data...</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Enemies</h1>
        <RefreshButton onRefresh={refresh} />
      </div>
      <PageExplainer id="enemies" title="Enemies — What's here?" bullets={[
        "Enemy faction members with threat scores based on spy data or combat stats.",
        "During active war, auto-detects the enemy faction. Otherwise, enter a faction ID.",
        "Click any column header to sort. One-click attack links to Torn.",
        "Threat scoring uses Spy Central data when available for accurate stat comparison.",
      ]} />
      {overview && (
        <div className="space-y-2">
          <WarBanner
            war={overview.war ?? null}
            warProgress={overview.war_progress ?? null}
          />
          <ChainStatus overview={overview} />
        </div>
      )}

      <EnemyTable data={enemy} onLoadEnemy={loadEnemy} />

      <div className="flex items-center justify-between text-xs text-text-muted pt-2 border-t border-border">
        <span>
          Last update:{" "}
          {lastUpdate ? lastUpdate.toLocaleTimeString() : "\u2014"}
        </span>
        <button
          onClick={refresh}
          className="text-text-secondary hover:text-torn-green transition-colors px-2.5 py-1.5 rounded-md hover:bg-bg-elevated active:scale-95"
        >
          {"\u21BB"} Refresh
        </button>
      </div>
    </div>
  );
}
