import React from "react";
import { fmtCD } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { MemberActivityPanel } from "@/components/intel/MemberActivityPanel";
import { getReadiness } from "./MemberCard";
import type { Readiness } from "./MemberCard";
import type { FactionMember, DetailResponse } from "@/types/war";
import type { FeatureFlags } from "@/hooks/useFeatureFlags";

interface MemberTableRowProps {
  m: FactionMember;
  d: DetailResponse["members"][string] | undefined;
  now: number;
  warActive: boolean;
  isExpanded: boolean;
  toggleExpanded: (id: number) => void;
  copyBounty: (name: string, id: number) => void;
  hasRowDetail: boolean;
  TABLE_COLSPAN: number;
  flags: FeatureFlags;
  DOT_GLOW: Record<Readiness, string>;
}

export const MemberTableRow = React.memo(function MemberTableRow({
  m,
  d,
  now,
  warActive,
  isExpanded,
  toggleExpanded,
  copyBounty,
  hasRowDetail,
  TABLE_COLSPAN,
  flags,
  DOT_GLOW,
}: MemberTableRowProps) {
  const r = getReadiness(m, d);

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
        {d.energy ?? "—"}E{" "}
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
      <span className="text-text-muted">—</span>
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
      <span className="text-text-muted">—</span>
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
      .replace("Traveling to ", "→ ")
      .replace("Returning to Torn from ", "← ")
      .replace("In ", "• ");
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
        {"⚠️"} ALL
      </span>
    );
  } else {
    reviveNode = (
      <span className="text-text-muted">—</span>
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
              {"📋"}
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
            <span className="text-torn-green">✓</span>
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </td>
      </tr>
      {isExpanded && hasRowDetail && (
        <tr className="bg-bg-elevated/30">
          <td colSpan={TABLE_COLSPAN} className="py-3 px-4">
            <div className="space-y-3 max-w-3xl">
              {flags.activity && <MemberActivityPanel playerId={m.id} />}
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );
});
