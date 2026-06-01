"use client";

import React, { useState, useMemo, useCallback } from "react";
import { MemberCard, getReadiness } from "./MemberCard";
import type { Readiness } from "./MemberCard";
import type { FactionMember, DetailResponse } from "@/types/war";
import { isWarActive } from "./ChainStatus";
import type { OverviewResponse } from "@/types/war";
import { MemberTableRow } from "./MemberTableRow";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

type SortCol = "name" | "level" | "online" | "state" | "energy" | "position" | null;

interface SortState {
  col: SortCol;
  asc: boolean;
}

interface MemberTableProps {
  members: FactionMember[];
  detail: DetailResponse | null;
  overview: OverviewResponse | null;
}

function getOurSortValue(
  m: FactionMember,
  dm: DetailResponse["members"],
  col: SortCol,
): string | number {
  switch (col) {
    case "name":
      return m.name.toLowerCase();
    case "level":
      return m.level;
    case "online": {
      const onlineOrd: Record<string, number> = { Online: 0, Idle: 1, Offline: 2 };
      return onlineOrd[m.last_action.status] ?? 3;
    }
    case "state":
      return m.status.state + m.last_action.status;
    case "energy":
      return dm[m.id]?.energy ?? -1;
    case "position":
      return m.position;
    default:
      return 0;
  }
}

export function MemberTable({ members, detail, overview }: MemberTableProps) {
  // ⚡ Bolt Optimization:
  // Extracted row rendering into `MemberTableRow` wrapped in `React.memo()`.
  // Wrapped handlers (`toggleExpanded`, `copyBounty`) in `useCallback` to preserve referential stability.
  // Moved the `now` state into the child row component so the `memo` shallow comparison isn't broken by a continuously changing prop.
  // Expected Impact: Prevents expensive full-table re-renders when interacting with a single row's state (e.g. expanding it), drastically improving table performance.

  const [sort, setSort] = useState<SortState>({ col: null, asc: true });
  // Phase 3B: row expansion for the activity heatmap (and any future row-
  // detail panels Phase 4B adds — see the dedicated section below).
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const flags = useFeatureFlags();

  const dm = useMemo(() => detail?.members || {}, [detail?.members]);
  const yataDown = detail?.yata_down || false;
  const warActive = isWarActive(overview);
  const toggleExpanded = useCallback((id: number) =>
    setExpandedId((prev) => (prev === id ? null : id)), []);
  // Don't show the disclosure column at all when no row-detail feature flag
  // is on — keeps the table identical to today's layout in production until
  // ENABLE_ACTIVITY (or a future Phase 4B flag) flips on.
  const hasRowDetail = flags.activity;
  // Column span for the expanded detail row. Update if column count changes.
  const TABLE_COLSPAN = hasRowDetail ? 14 : 13;

  const sorted = useMemo(() => {
    const ord: Record<Readiness, number> = {
      green: 0,
      yellow: 1,
      gray: 2,
      red: 3,
    };
    if (sort.col) {
      return [...members].sort((a, b) => {
        const va = getOurSortValue(a, dm, sort.col);
        const vb = getOurSortValue(b, dm, sort.col);
        const cmp =
          typeof va === "string" && typeof vb === "string"
            ? va.localeCompare(vb)
            : (va as number) - (vb as number);
        return sort.asc ? cmp : -cmp;
      });
    }
    // Default: readiness sort
    return [...members].sort((a, b) => {
      const ra = ord[getReadiness(a, dm[a.id])] ?? 2;
      const rb = ord[getReadiness(b, dm[b.id])] ?? 2;
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
    });
  }, [members, dm, sort]);

  // Summary stats
  const { online, hospital, offline, withData, visible, inOc } = useMemo(() => {
    let on = 0,
      hosp = 0,
      off = 0;
    for (const m of members) {
      if (m.last_action.status === "Online") on++;
      else if (m.status.state === "Hospital") hosp++;
      else off++;
    }
    const oc = members.filter((m) => m.is_in_oc).length;
    const data = Object.values(dm).filter(
      (d) => d.source === "torn_api" || d.source === "yata",
    ).length;
    const vis = Object.keys(dm).length;
    return { online: on, hospital: hosp, offline: off, withData: data, visible: vis, inOc: oc };
  }, [members, dm]);

  const toggleSort = (col: SortCol) => {
    if (sort.col === col) {
      setSort({ col, asc: !sort.asc });
    } else {
      setSort({ col, asc: col === "name" });
    }
  };

  const mobileSortChange = (val: string) => {
    if (val === "readiness") {
      setSort({ col: null, asc: true });
    } else {
      setSort({ col: val as SortCol, asc: val === "name" });
    }
  };

  const SortArrow = ({ col }: { col: SortCol }) =>
    sort.col === col ? (
      <span className="ml-1 text-torn-green">
        {sort.asc ? "\u25B2" : "\u25BC"}
      </span>
    ) : null;

  const copyBounty = useCallback((name: string, id: number) => {
    const text = `Can someone bounty ${name}? https://www.torn.com/profiles.php?XID=${id}`;
    navigator.clipboard.writeText(text);
  }, []);

  return (
    <div>
      {/* YATA warning */}
      {yataDown && (
        <div className="bg-yellow-950/40 border border-yellow-800/40 rounded-lg px-4 py-2 mb-3 text-sm text-torn-yellow">
          {"\u26A0\uFE0F"} YATA is currently down. Energy/drug data may be stale or unavailable.
        </div>
      )}

      {/* Summary */}
      <div className="text-sm text-text-secondary mb-3 flex flex-wrap items-center gap-x-1">
        <span className="text-torn-green font-medium">{online}</span> <span>online,</span>{" "}
        <span className="text-torn-yellow font-medium">{hospital}</span> <span>hospital,</span>{" "}
        <span className="text-torn-red font-medium">{offline}</span> <span>offline/away</span>{" "}
        <span className="text-text-muted">{"\u2014"}</span>{" "}
        <span className="text-torn-green font-medium">{withData}</span>
        <span>/{visible || members.length} with data</span>{" "}
        <span className="text-text-muted">{"\u2014"}</span>{" "}
        <span>{inOc} in OC</span>
      </div>

      {/* Mobile sort dropdown */}
      <div className="lg:hidden mb-3">
        <select
          className="bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary w-full appearance-none focus:outline-none focus:border-torn-green/50 transition-colors"
          value={sort.col || "readiness"}
          onChange={(e) => mobileSortChange(e.target.value)}
        >
          <option value="readiness">Sort: Readiness</option>
          <option value="online">Sort: Online</option>
          <option value="name">Sort: Name</option>
          <option value="level">Sort: Level</option>
          <option value="state">Sort: Status</option>
          <option value="energy">Sort: Energy</option>
        </select>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {sorted.map((m) => (
          <MemberCard
            key={m.id}
            member={m}
            detail={dm[m.id]}
            warActive={warActive}
          />
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
              {/* Phase 3B: row-detail disclosure column — only present when at
                  least one row-detail feature flag is on. */}
              {hasRowDetail && <th className="py-2.5 px-1 w-6"></th>}
              <th className="py-2.5 px-2 w-6"></th>
              <th
                className="py-2.5 px-2 cursor-pointer hover:text-text-primary transition-colors select-none"
                onClick={() => toggleSort("name")}
              >
                Name
                <SortArrow col="name" />
              </th>
              <th className="py-2.5 px-2 w-6"></th>
              <th
                className="py-2.5 px-2 cursor-pointer hover:text-text-primary transition-colors select-none"
                onClick={() => toggleSort("level")}
              >
                Lvl
                <SortArrow col="level" />
              </th>
              <th
                className="py-2.5 px-2 cursor-pointer hover:text-text-primary transition-colors select-none"
                onClick={() => toggleSort("online")}
              >
                Online
                <SortArrow col="online" />
              </th>
              <th
                className="py-2.5 px-2 cursor-pointer hover:text-text-primary transition-colors select-none"
                onClick={() => toggleSort("state")}
              >
                Status
                <SortArrow col="state" />
              </th>
              <th className="py-2.5 px-2">Last Action</th>
              <th
                className="py-2.5 px-2 cursor-pointer hover:text-text-primary transition-colors select-none"
                onClick={() => toggleSort("energy")}
              >
                Energy
                <SortArrow col="energy" />
              </th>
              <th className="py-2.5 px-2">Drug CD</th>
              <th
                className="py-2.5 px-2 cursor-pointer hover:text-text-primary transition-colors select-none"
                onClick={() => toggleSort("position")}
              >
                Position
                <SortArrow col="position" />
              </th>
              <th className="py-2.5 px-2">Revive</th>
              <th className="py-2.5 px-2">OC</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <MemberTableRow
                key={m.id}
                m={m}
                d={dm[m.id]}
                warActive={warActive}
                hasRowDetail={hasRowDetail}
                flagsActivity={flags.activity}
                tableColspan={TABLE_COLSPAN}
                                isExpanded={expandedId === m.id}
                toggleExpanded={toggleExpanded}
                copyBounty={copyBounty}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
