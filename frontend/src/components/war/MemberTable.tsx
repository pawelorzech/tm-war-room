"use client";

import React, { useState, useMemo, useCallback, memo } from "react";
import { fmtCD } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { MemberCard, getReadiness } from "./MemberCard";
import type { Readiness } from "./MemberCard";
import type { FactionMember, DetailResponse } from "@/types/war";
import { isWarActive } from "./ChainStatus";
import type { OverviewResponse } from "@/types/war";
import { MemberActivityPanel } from "@/components/intel/MemberActivityPanel";
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

const DOT_GLOW: Record<Readiness, string> = {
  green: "text-green-500",
  yellow: "text-yellow-500",
  red: "text-red-500",
  gray: "text-gray-500",
};

interface MemberTableRowProps {
  m: FactionMember;
  d: DetailResponse["members"][string] | undefined;
  r: Readiness;
  now: number;
  hasRowDetail: boolean;
  warActive: boolean;
  flags: ReturnType<typeof useFeatureFlags>;
  TABLE_COLSPAN: number;
  isExpanded: boolean;
  toggleExpanded: (id: number) => void;
  copyBounty: (name: string, id: number) => void;
}

const MemberTableRow = memo(function MemberTableRow({
  m, d, r, now, hasRowDetail, warActive, flags, TABLE_COLSPAN, isExpanded, toggleExpanded, copyBounty
}: MemberTableRowProps) {
  // Energy
  let energyNode: React.ReactNode;
  if (d && d.source === "torn_api") {
    if (d.energy > (d.max_energy ?? 0)) {
      energyNode = (
        <span className="text-torn-green font-semibold">
          {d.energy}/{d.max_energy}
        </span>
      );
    } else if (d.energy < (d.max_energy ?? 0)) {
      energyNode = (
        <span className="text-torn-red">
          {d.energy}/{d.max_energy}
        </span>
      );
    } else {
      energyNode = (
        <span>
          {d.energy}/{d.max_energy}
        </span>
      );
    }
  } else if (d && d.source === "yata") {
    energyNode = (
      <span>
        {d.energy ?? "\u2014"}E{" "}
        <span
          className="text-text-muted text-xs"
          title="From YATA (~1h cache)"
        >
          yata
        </span>
      </span>
    );
  } else if (d && d.source === "hidden") {
    energyNode = (
      <span className="text-text-muted">Hidden</span>
    );
  } else if (d && d.source === "not_on_yata") {
    energyNode = (
      <span className="text-text-muted">No data</span>
    );
  } else {
    energyNode = (
      <span className="text-text-muted">{"\u2014"}</span>
    );
  }

  // Drug CD
  let cdNode: React.ReactNode;
  if (d && (d.source === "torn_api" || d.source === "yata")) {
    cdNode =
      d.drug_cd > 0 ? (
        <span className="text-torn-red">
          {fmtCD(d.drug_cd)}
        </span>
      ) : (
        <span className="text-torn-green">Ready</span>
      );
  } else if (d && d.source === "hidden") {
    cdNode = (
      <span className="text-text-muted">Hidden</span>
    );
  } else {
    cdNode = (
      <span className="text-text-muted">{"\u2014"}</span>
    );
  }

  // State text
  let stateNode: React.ReactNode;
  if (m.status.state === "Hospital") {
    const reason = m.status.details || "hospitalized";
    const shortReason = reason
      .replace("Overdosed on ", "OD ")
      .replace("Hospitalized by ", "by ")
      .replace("Mugged by ", "mugged ")
      .replace("Attacked by ", "atk ");
    const left = m.status.until
      ? fmtCD(m.status.until - now)
      : "";
    stateNode = (
      <span className="text-torn-yellow">
        Hosp: {shortReason}
        {left ? ` (${left})` : ""}
      </span>
    );
  } else if (
    m.status.state === "Traveling" ||
    m.status.state === "Abroad"
  ) {
    const desc = m.status.description || "";
    const dest = desc
      .replace("Traveling to ", "\u2192 ")
      .replace("Returning to Torn from ", "\u2190 ")
      .replace("In ", "\u2022 ");
    stateNode = (
      <span className="text-torn-yellow">{dest}</span>
    );
  } else if (m.status.state === "Jail") {
    const left = m.status.until
      ? fmtCD(m.status.until - now)
      : "";
    stateNode = (
      <span className="text-torn-red">
        Jail{left ? ` (${left})` : ""}
      </span>
    );
  } else {
    stateNode = <span>{m.last_action.status}</span>;
  }

  // Revive
  let reviveNode: React.ReactNode;
  if (m.revive_setting === "No one") {
    reviveNode = (
      <span className="text-torn-green">OFF</span>
    );
  } else if (m.revive_setting === "Friends & faction") {
    reviveNode = (
      <span
        className="text-torn-yellow"
        title="Faction members can revive you"
      >
        Faction
      </span>
    );
  } else if (m.revive_setting === "Everyone") {
    reviveNode = (
      <span
        className="text-torn-red"
        title="ANYONE can revive you - enemies can revive and attack again!"
      >
        {"\u26A0"} ALL
      </span>
    );
  } else {
    reviveNode = (
      <span className="text-text-muted">{"\u2014"}</span>
    );
  }

  const isNew = m.days_in_faction <= 30;
  const needsBounty =
    warActive &&
    m.last_action.status === "Offline" &&
    m.status.state !== "Hospital";

  return (
    <React.Fragment>
    <tr
      className="border-b border-border-light hover:bg-bg-elevated/50 transition-colors group"
    >
      {hasRowDetail && (
        <td className="py-2 px-1">
          <button
            type="button"
            onClick={() => toggleExpanded(m.id)}
            className="text-text-muted hover:text-torn-green transition-colors px-1 py-0.5 rounded select-none"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse details" : "Expand details"}
          >
            {isExpanded ? "▼" : "▶"}
          </button>
        </td>
      )}
      <td className="py-2 px-2">
        <span
          className={`w-2.5 h-2.5 rounded-full inline-block ${DOT_GLOW[r]} ${
            r === "green"
              ? "bg-green-500"
              : r === "yellow"
                ? "bg-yellow-500"
                : r === "red"
                  ? "bg-red-500"
                  : "bg-gray-500"
          }`}
          style={
            r !== "gray"
              ? { boxShadow: `0 0 6px currentColor` }
              : undefined
          }
        />
      </td>
      <td className="py-2 px-2">
        <div className="flex items-center gap-1.5">
          <Avatar playerId={m.id} name={m.name} size="sm" />
          <a
            href={`https://www.torn.com/profiles.php?XID=${m.id}`}
            target="_blank" rel="noopener noreferrer"

            className="text-text-primary hover:text-torn-green transition-colors"
          >
            {m.name}
          </a>
          {isNew && (
            <span className="ml-1.5 text-[10px] bg-torn-green/20 text-torn-green px-1 py-0.5 rounded font-medium">
              new
            </span>
          )}
        </div>
      </td>
      <td className="py-2 px-2">
        {needsBounty && (
          <button
            onClick={() => copyBounty(m.name, m.id)}
            className="text-xs px-1 py-0.5 bg-bg-elevated rounded hover:bg-border transition-colors active:scale-95"
            title="Copy bounty request"
          >
            {"\uD83D\uDCCB"}
          </button>
        )}
      </td>
      <td className="py-2 px-2 text-text-muted">
        {m.level}
      </td>
      <td className="py-2 px-2">
        <span className={
          m.last_action.status === "Online" ? "text-torn-green font-medium" :
          m.last_action.status === "Idle" ? "text-torn-yellow" :
          "text-text-muted"
        }>
          {m.last_action.status}
        </span>
      </td>
      <td className="py-2 px-2">{stateNode}</td>
      <td className="py-2 px-2 text-text-muted">
        {m.last_action.relative}
      </td>
      <td className="py-2 px-2">{energyNode}</td>
      <td className="py-2 px-2">{cdNode}</td>
      <td className="py-2 px-2 text-text-muted">
        {m.position}
      </td>
      <td className="py-2 px-2">{reviveNode}</td>
      <td className="py-2 px-2">
        {m.is_in_oc ? (
          <span className="text-torn-green">{"\u2713"}</span>
        ) : (
          <span className="text-text-muted">{"\u2014"}</span>
        )}
      </td>
    </tr>
    {/* Phase 3B: row-detail panel. Keep this section clearly
        delimited — Phase 4B (hit-claims) will add its own panel
        in the same expanded row. */}
    {isExpanded && hasRowDetail && (
      <tr className="bg-bg-elevated/30">
        <td colSpan={TABLE_COLSPAN} className="py-3 px-4">
          <div className="space-y-3 max-w-3xl">
            {/* ── Phase 3B: Activity heatmap ─────────────── */}
            {flags.activity && <MemberActivityPanel playerId={m.id} />}
            {/* ── /Phase 3B ──────────────────────────────── */}

            {/* ── Phase 4B claim-list slot (reserved) ────── */}
            {/* ── /Phase 4B ──────────────────────────────── */}
          </div>
        </td>
      </tr>
    )}
    </React.Fragment>
  );
});

export function MemberTable({ members, detail, overview }: MemberTableProps) {
  const [sort, setSort] = useState<SortState>({ col: null, asc: true });
  // Phase 3B: row expansion for the activity heatmap (and any future row-
  // detail panels Phase 4B adds — see the dedicated section below).
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const flags = useFeatureFlags();

  const dm = useMemo(() => detail?.members || {}, [detail?.members]);
  const yataDown = detail?.yata_down || false;
  const warActive = isWarActive(overview);
  const now = Math.floor(Date.now() / 1000);

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
            {sorted.map((m) => {
              const d = dm[m.id];
              const r = getReadiness(m, d);
              const isExpanded = expandedId === m.id;

              return (
                <MemberTableRow
                  key={m.id}
                  m={m}
                  d={d}
                  r={r}
                  now={now}
                  hasRowDetail={hasRowDetail}
                  warActive={warActive}
                  flags={flags}
                  TABLE_COLSPAN={TABLE_COLSPAN}
                  isExpanded={isExpanded}
                  toggleExpanded={toggleExpanded}
                  copyBounty={copyBounty}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
