"use client";

import { useTeamData } from "@/hooks/useTeamData";
import { WarBanner } from "@/components/war/WarBanner";
import { ChainStatus } from "@/components/war/ChainStatus";
import { MemberTable } from "@/components/war/MemberTable";
import { PageExplainer } from "@/components/layout/PageExplainer";

export default function TeamPage() {
  const { overview, detail, loading, lastUpdate, refresh } = useTeamData();

  if (loading && !overview) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[200px]">
        <div className="text-text-secondary text-sm">Loading team data...</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      <PageExplainer id="team" title="Our Team — What's here?" bullets={[
        "Live status of all faction members — who's online, in hospital, traveling, or in jail.",
        "Energy levels and drug cooldowns (from registered API keys or YATA).",
        "Sort by any column. Click 'Online' to see who's available right now.",
        "Data refreshes every 60 seconds automatically. Hit Refresh for instant update.",
        "Revive settings shown — members with 'Everyone' should change this during war!",
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

      {overview && (
        <MemberTable
          members={overview.members}
          detail={detail}
          overview={overview}
        />
      )}

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
