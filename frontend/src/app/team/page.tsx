"use client";

import { useTeamData } from "@/hooks/useTeamData";
import { WarBanner } from "@/components/war/WarBanner";
import { ChainStatus } from "@/components/war/ChainStatus";
import { MemberTable } from "@/components/war/MemberTable";
import { PageExplainer } from "@/components/layout/PageExplainer";
import { RefreshButton } from "@/components/layout/RefreshButton";

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Our Team</h1>
        <RefreshButton onRefresh={refresh} />
      </div>
      <PageExplainer id="team" title="Our Team — What's here?" bullets={[
        "Live status of all faction members — Online, Idle, Offline, Hospital, Traveling, or Jail. Use this to coordinate attacks, revives, and faction activities in real time.",
        "\"Last action\" shows when a member was last active on Torn. Members idle for 5+ minutes may be AFK — important for war coordination and chain timing.",
        "Energy levels and drug cooldowns help plan when members can attack next. During war, knowing who has energy ready is critical for keeping chains alive.",
        "Sort by any column to quickly find available members. During war, filter for Online members with energy to maximize your faction's attack output.",
        "Revive settings matter during war — members set to 'Everyone' can be revived by enemies. Change to 'Faction only' or 'Nobody' during active wars!",
      ]}
      dataSources={["Torn API v2 faction members endpoint, cached 60s", "Status updates every 30s via background scheduler"]}
      links={[["Torn Wiki: Factions", "https://wiki.torn.com/wiki/Faction"]]}
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
