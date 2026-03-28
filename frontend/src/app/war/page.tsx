"use client";

import { useState } from "react";
import { useWarData } from "@/hooks/useWarData";
import { WarBanner } from "@/components/war/WarBanner";
import { ChainStatus } from "@/components/war/ChainStatus";
import { MemberTable } from "@/components/war/MemberTable";
import { EnemyTable } from "@/components/war/EnemyTable";

type Tab = "our" | "enemy";

export default function WarPage() {
  const { overview, detail, enemy, loading, lastUpdate, refresh, loadEnemy } =
    useWarData();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("warTab");
      if (saved === "our" || saved === "enemy") return saved;
    }
    return "our";
  });

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    localStorage.setItem("warTab", tab);
  };

  if (loading && !overview) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[200px]">
        <div className="text-text-secondary text-sm">Loading war data...</div>
      </div>
    );
  }

  const memberCount = overview?.members?.length ?? 0;
  const enemyCount = enemy?.members?.length ?? 0;

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      {/* War Banner + Chain */}
      {overview && (
        <div className="space-y-2">
          <WarBanner
            war={overview.war ?? null}
            warProgress={overview.war_progress ?? null}
          />
          <ChainStatus overview={overview} />
        </div>
      )}

      {/* Tab buttons */}
      <div className="flex border-b border-border">
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "our"
              ? "border-torn-green text-torn-green"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
          onClick={() => switchTab("our")}
        >
          Our Team
          <span className="ml-1.5 text-xs text-text-muted">
            ({memberCount})
          </span>
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "enemy"
              ? "border-torn-green text-torn-green"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
          onClick={() => switchTab("enemy")}
        >
          Enemy
          <span className="ml-1.5 text-xs text-text-muted">
            ({enemyCount})
          </span>
        </button>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "our" && overview && (
          <MemberTable
            members={overview.members}
            detail={detail}
            overview={overview}
          />
        )}
        {activeTab === "enemy" && (
          <EnemyTable data={enemy} onLoadEnemy={loadEnemy} />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-text-muted pt-2 border-t border-border">
        <span>
          Last update:{" "}
          {lastUpdate ? lastUpdate.toLocaleTimeString() : "\u2014"}
        </span>
        <button
          onClick={refresh}
          className="text-text-secondary hover:text-torn-green transition-colors px-2 py-1 rounded hover:bg-bg-elevated"
        >
          {"\u21BB"} Refresh
        </button>
      </div>
    </div>
  );
}
