"use client";

import { useState } from "react";
import { fmtCD } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import type { FactionMember, DetailResponse } from "@/types/war";

type Readiness = "green" | "yellow" | "red" | "gray";

function getReadiness(
  m: FactionMember,
  d: DetailResponse["members"][string] | undefined,
): Readiness {
  const on = m.last_action.status;
  const st = m.status.state;
  if (["Traveling", "Abroad", "Jail"].includes(st)) return "red";
  if (on === "Offline") return "red";
  if (st === "Hospital") return "yellow";
  if (d && (d.source === "torn_api" || d.source === "yata") && d.drug_cd > 3600)
    return "yellow";
  if (on === "Online" && st === "Okay") return "green";
  if (on === "Idle") return "yellow";
  return "gray";
}

const DOT_COLORS: Record<Readiness, string> = {
  green: "bg-green-500 text-green-500",
  yellow: "bg-yellow-500 text-yellow-500",
  red: "bg-red-500 text-red-500",
  gray: "bg-gray-500 text-gray-500",
};

const NAME_COLORS: Record<Readiness, string> = {
  green: "text-torn-green",
  yellow: "text-torn-yellow",
  red: "text-torn-red",
  gray: "text-text-muted",
};

const EXPANDED_BORDER: Record<Readiness, string> = {
  green: "border-green-700/40",
  yellow: "border-yellow-700/40",
  red: "border-red-700/40",
  gray: "border-border",
};

interface MemberCardProps {
  member: FactionMember;
  detail: DetailResponse["members"][string] | undefined;
  warActive: boolean;
}

export function MemberCard({ member: m, detail: d, warActive }: MemberCardProps) {
  const [expanded, setExpanded] = useState(false);
  const r = getReadiness(m, d);
  const now = Math.floor(Date.now() / 1000);

  // State display
  let stateNode: React.ReactNode;
  if (m.status.state === "Hospital") {
    const left = m.status.until ? fmtCD(m.status.until - now) : "";
    stateNode = (
      <span className="text-torn-yellow">{"\uD83C\uDFE5"} {left}</span>
    );
  } else if (m.status.state === "Traveling" || m.status.state === "Abroad") {
    const desc = m.status.description || "";
    const dest = desc
      .replace("Traveling to ", "\u2708 ")
      .replace("Returning to Torn from ", "\u2708\u2190 ")
      .replace("In ", "\u2022 ");
    const left = m.status.until ? " " + fmtCD(m.status.until - now) : "";
    stateNode = (
      <span className="text-torn-yellow">
        {dest}
        {left}
      </span>
    );
  } else if (m.status.state === "Jail") {
    const left = m.status.until ? fmtCD(m.status.until - now) : "";
    stateNode = <span className="text-torn-red">Jail {left}</span>;
  } else if (m.last_action.status === "Offline") {
    stateNode = <span className="text-text-muted">Offline</span>;
  } else {
    stateNode = (
      <span className="text-torn-green">{m.last_action.status}</span>
    );
  }

  // Energy display
  let energyNode: React.ReactNode;
  if (d && d.source === "torn_api" && d.max_energy) {
    if (d.energy > d.max_energy) {
      energyNode = (
        <span className="text-torn-green font-semibold">
          {"\u26A1"} {d.energy}/{d.max_energy}
        </span>
      );
    } else if (d.energy < d.max_energy) {
      energyNode = (
        <span className="text-torn-red">
          {"\u26A1"} {d.energy}/{d.max_energy}
        </span>
      );
    } else {
      energyNode = (
        <span className="text-torn-blue">
          {"\u26A1"} {d.energy}/{d.max_energy}
        </span>
      );
    }
  } else if (d && d.source === "yata") {
    energyNode = (
      <span className="text-torn-blue">
        {"\u26A1"} {d.energy ?? "\u2014"}E
      </span>
    );
  } else {
    energyNode = <span className="text-text-muted">{"\u26A1"} {"\u2014"}</span>;
  }

  // Drug CD
  let cdNode: React.ReactNode;
  if (d && (d.source === "torn_api" || d.source === "yata")) {
    cdNode =
      d.drug_cd > 0 ? (
        <span className="text-torn-red">
          {"\uD83D\uDC8A"} {fmtCD(d.drug_cd)}
        </span>
      ) : (
        <span className="text-torn-green">{"\uD83D\uDC8A"} ready</span>
      );
  } else {
    cdNode = <span className="text-text-muted">{"\uD83D\uDC8A"} {"\u2014"}</span>;
  }

  // Revive
  let reviveNode: React.ReactNode;
  if (m.revive_setting === "No one") {
    reviveNode = <span className="text-torn-green">{"\uD83D\uDD04"} OFF</span>;
  } else if (m.revive_setting === "Friends & faction") {
    reviveNode = <span className="text-torn-yellow">{"\uD83D\uDD04"} Fac</span>;
  } else if (m.revive_setting === "Everyone") {
    reviveNode = <span className="text-torn-red">{"\uD83D\uDD04"} ALL</span>;
  } else {
    reviveNode = <span className="text-text-muted">{"\uD83D\uDD04"} {"\u2014"}</span>;
  }

  // Bounty
  const needsBounty =
    warActive &&
    m.last_action.status === "Offline" &&
    m.status.state !== "Hospital";

  const copyBounty = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `Can someone bounty ${m.name}? https://www.torn.com/profiles.php?XID=${m.id}`;
    navigator.clipboard.writeText(text);
  };

  return (
    <div
      className={`bg-bg-surface border rounded-lg p-3 cursor-pointer transition-all duration-200 active:scale-[0.99] ${
        expanded ? `${EXPANDED_BORDER[r]} bg-bg-elevated/30` : "border-border hover:border-border-light"
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Row 1: name + time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar playerId={m.id} name={m.name} size="md" className="shrink-0" />
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT_COLORS[r]}`}
            style={{ animation: r === "green" ? "tm-dot-glow 2s ease-in-out infinite" : undefined }}
          />
          <a
            href={`https://www.torn.com/profiles.php?XID=${m.id}`}
            target="_blank" rel="noopener noreferrer"
            
            className={`font-medium truncate hover:underline ${NAME_COLORS[r]}`}
            onClick={(e) => e.stopPropagation()}
          >
            {m.name}
          </a>
          <span className="text-xs text-text-muted">{m.level}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {needsBounty && (
            <button
              onClick={copyBounty}
              className="text-xs px-1.5 py-0.5 bg-bg-elevated rounded hover:bg-border transition-colors active:scale-95"
              title="Copy bounty request"
            >
              {"\uD83D\uDCCB"}
            </button>
          )}
          <span className="text-xs text-text-muted">
            {m.last_action.relative}
          </span>
        </div>
      </div>

      {/* Row 2: status chips */}
      <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
        {stateNode}
        {energyNode}
        {cdNode}
        {reviveNode}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div
          className="mt-3 pt-3 border-t border-border text-xs text-text-secondary space-y-1.5"
          style={{ animation: "tm-expand 0.25s ease-out" }}
        >
          <div>
            <span className="text-text-muted">Position:</span> {m.position}
          </div>
          <div>
            <span className="text-text-muted">Days:</span>{" "}
            {m.days_in_faction}
          </div>
          <div>
            <span className="text-text-muted">OC:</span>{" "}
            {m.is_in_oc ? (
              <span className="text-torn-green">{"\u2713"} In OC</span>
            ) : (
              <span className="text-text-muted">{"\u2014"}</span>
            )}
          </div>
          <div>
            <span className="text-text-muted">Last action:</span>{" "}
            {m.last_action.relative}
          </div>
          {m.status.state === "Hospital" && m.status.details && (
            <div>
              <span className="text-text-muted">Hospital:</span>{" "}
              <span className="text-torn-yellow">{m.status.details}</span>
            </div>
          )}
          <div className="pt-1.5">
            <a
              href={`https://www.torn.com/profiles.php?XID=${m.id}`}
              target="_blank" rel="noopener noreferrer"
              
              className="text-torn-blue hover:underline inline-flex items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              View Profile {"\u2197"}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export { getReadiness };
export type { Readiness };
