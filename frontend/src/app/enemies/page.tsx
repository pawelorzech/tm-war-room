"use client";

import { Suspense } from "react";
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
        "Enemy faction members with threat levels based on how their stats compare to yours. Threat scoring uses two methods: relative (spy-based stat comparison) and absolute (personalstats ratios like attacks won/lost).",
        "During active war, the enemy faction is auto-detected. Target selection strategy: attack weak online enemies first, avoid hospitalized players (they can't be hit), and skip players with very high threat levels unless you're confident.",
        "Spy data shows estimated battle stats (strength, speed, dexterity, defense) gathered from TornStats Spy Central. When available, this gives the most accurate threat assessment.",
        "Click any column header to sort — sort by threat to find easy targets, or by status to find online enemies. One-click attack links take you directly to the Torn attack page.",
      ]}
      dataSources={["Torn API v2 faction members", "TornStats spy API for battle stat estimates", "Personalstats-based threat scoring"]}
      links={[["Torn Wiki: Wars", "https://wiki.torn.com/wiki/War"], ["Torn Wiki: Attacking", "https://wiki.torn.com/wiki/Attacking"]]}
      />
      {overview && (
        <div className="space-y-2">
          <WarBanner
            war={overview.war ?? null}
            warProgress={overview.war_progress ?? null}
          />
          <ChainStatus overview={overview} />
        </div>
      )}

      <Suspense
        fallback={
          <div className="text-text-muted text-sm">Loading filters…</div>
        }
      >
        <EnemyTable
          data={enemy}
          onLoadEnemy={loadEnemy}
          warId={overview?.war?.war_id ?? null}
        />
      </Suspense>

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
