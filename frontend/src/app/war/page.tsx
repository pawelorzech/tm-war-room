"use client";

import { useState, useRef, useEffect } from "react";
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

  // Animated underline refs
  const tabsRef = useRef<HTMLDivElement>(null);
  const ourBtnRef = useRef<HTMLButtonElement>(null);
  const enemyBtnRef = useRef<HTMLButtonElement>(null);
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const btn = activeTab === "our" ? ourBtnRef.current : enemyBtnRef.current;
    const container = tabsRef.current;
    if (btn && container) {
      const containerRect = container.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      setUnderlineStyle({
        left: btnRect.left - containerRect.left,
        width: btnRect.width,
      });
    }
  }, [activeTab]);

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

      {/* Tab buttons with sliding underline */}
      <div ref={tabsRef} className="relative flex border-b border-border">
        <button
          ref={ourBtnRef}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "our"
              ? "text-torn-green"
              : "text-text-secondary hover:text-text-primary"
          }`}
          onClick={() => switchTab("our")}
        >
          Our Team
          <span className={`ml-1.5 text-xs ${activeTab === "our" ? "text-torn-green/60" : "text-text-muted"}`}>
            ({memberCount})
          </span>
        </button>
        <button
          ref={enemyBtnRef}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "enemy"
              ? "text-torn-green"
              : "text-text-secondary hover:text-text-primary"
          }`}
          onClick={() => switchTab("enemy")}
        >
          Enemy
          <span className={`ml-1.5 text-xs ${activeTab === "enemy" ? "text-torn-green/60" : "text-text-muted"}`}>
            ({enemyCount})
          </span>
        </button>

        {/* Animated underline */}
        <span
          className="absolute bottom-0 h-0.5 bg-torn-green rounded-full transition-all duration-300 ease-out"
          style={{
            left: underlineStyle.left,
            width: underlineStyle.width,
          }}
        />
      </div>

      {/* Tab content with fade transition */}
      <div
        key={activeTab}
        style={{ animation: "tm-fade-in 0.2s ease-out" }}
      >
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
          className="text-text-secondary hover:text-torn-green transition-colors px-2.5 py-1.5 rounded-md hover:bg-bg-elevated active:scale-95"
        >
          {"\u21BB"} Refresh
        </button>
      </div>
    </div>
  );
}
