"use client";

import { memo } from "react";
import { fmtCD, fmtNum } from "@/lib/format";
import type { EnemyMember, WarOffLimits } from "@/types/war";

interface EnemyTableRowProps {
  member: EnemyMember;
  hasBaseline: boolean;
  entry: WarOffLimits | null;
  isMyEntry: boolean;
  isAdmin: boolean;
  canFlag: boolean;
  onRequestFlag: (member: EnemyMember) => void;
  onRequestEdit: (entry: WarOffLimits, member: EnemyMember) => void;
  onRequestRemove: (entry: WarOffLimits) => void;
  onAttackBlocked: (member: EnemyMember, entry: WarOffLimits) => void;
}

const THREAT_COLORS: Record<string, string> = {
  easy: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/60 dark:text-green-400 dark:border-green-700/40",
  medium: "bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-900/60 dark:text-yellow-400 dark:border-yellow-700/40",
  hard: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/60 dark:text-red-400 dark:border-red-700/40",
  avoid: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/60 dark:text-purple-400 dark:border-purple-700/40",
  unknown: "bg-bg-elevated text-text-muted border-border",
};

const THREAT_GLOW: Record<string, string> = {
  easy: "0 0 8px rgba(74, 222, 128, 0.15)",
  medium: "0 0 8px rgba(250, 204, 21, 0.15)",
  hard: "0 0 8px rgba(248, 113, 113, 0.15)",
  avoid: "0 0 8px rgba(192, 132, 252, 0.2)",
  unknown: "none",
};

export const EnemyTableRow = memo(function EnemyTableRow({
  member: m,
  hasBaseline,
  entry,
  isMyEntry,
  isAdmin,
  canFlag,
  onRequestFlag,
  onRequestEdit,
  onRequestRemove,
  onAttackBlocked,
}: EnemyTableRowProps) {
  const now = Math.floor(Date.now() / 1000);
  const ok = m.last_action.status !== "Offline" && m.status.state === "Okay";
  const isHosp = m.status.state === "Hospital";
  const st = m.status.state !== "Okay" ? m.status.state : m.last_action.status;
  const ps = m.personal_stats;
  const xr = ps ? `${fmtNum(ps.xanax_taken)}/${fmtNum(ps.refills)}` : "—";
  const aw = ps ? fmtNum(ps.attacks_won) : "—";
  const hospTime = isHosp && m.status.until ? ` (${fmtCD(m.status.until - now)})` : "";
  const dotColor = ok
    ? "bg-green-500 text-green-500"
    : isHosp
      ? "bg-yellow-500 text-yellow-500"
      : "bg-red-500 text-red-500";

  const tip = ps
    ? `Score: ${m.threat_score}/100\nXanax: ${ps.xanax_taken.toLocaleString()}\nRefills: ${ps.refills.toLocaleString()}\nSEs: ${ps.stat_enhancers_used}\nAtk won: ${ps.attacks_won.toLocaleString()}\nDef won: ${ps.defends_won.toLocaleString()}\nNW: $${fmtNum(ps.networth)}\nBest beaten: Lv${ps.highest_beaten}`
    : "No TornStats data";

  const threatLabel = m.threat_label || "unknown";
  const threatCell = hasBaseline ? (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-semibold border ${
        THREAT_COLORS[threatLabel] || THREAT_COLORS.unknown
      }`}
      title={tip}
      style={{ boxShadow: THREAT_GLOW[threatLabel] || THREAT_GLOW.unknown }}
    >
      {m.threat_label} {m.threat_score}
    </span>
  ) : (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-medium border cursor-pointer ${THREAT_COLORS.unknown}`}
      title="Register your API key to see threat levels"
    >
      add key
    </span>
  );

  const canEditEntry = entry && (isMyEntry || isAdmin);

  return (
    <tr
      className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors group ${
        entry ? "bg-torn-red/[0.04]" : ""
      }`}
    >
      <td className="py-2 px-2">
        <span
          className={`w-2.5 h-2.5 rounded-full inline-block ${dotColor}`}
          style={ok || isHosp ? { boxShadow: "0 0 6px currentColor" } : undefined}
        />
      </td>
      <td className="py-2 px-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <a
            href={m.profile_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-primary hover:text-torn-green transition-colors"
          >
            {m.name}
          </a>
          {entry ? (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold border bg-torn-red/15 text-torn-red border-torn-red/40"
              title={`Off-limits by ${entry.set_by_name}${entry.reason ? `: ${entry.reason}` : ""}`}
            >
              {"🚫"} {entry.set_by_name}
            </span>
          ) : null}
        </div>
      </td>
      <td className="py-2 px-2 text-text-muted">{m.level}</td>
      <td className="py-2 px-2">{threatCell}</td>
      <td className="py-2 px-2">
        {isHosp ? (
          <span className="text-torn-yellow font-mono text-xs">
            {st}
            {hospTime}
          </span>
        ) : ok ? (
          <span className="text-torn-green">{st}</span>
        ) : (
          <span className="text-text-muted">{st}</span>
        )}
      </td>
      <td className="py-2 px-2 text-text-muted">{m.last_action.relative}</td>
      <td className="py-2 px-2 text-text-muted font-mono text-xs">{xr}</td>
      <td className="py-2 px-2 text-text-muted font-mono text-xs">{aw}</td>
      <td className="py-2 px-2">
        <div className="flex gap-1.5 items-center">
          <a
            href={m.attack_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-xs px-2.5 py-1 rounded-md font-semibold transition-all active:scale-95 ${
              isHosp
                ? "bg-bg-elevated text-text-muted border border-border"
                : entry
                  ? "bg-torn-red/15 text-torn-red border border-torn-red/40 hover:bg-torn-red/25"
                  : "bg-torn-green/20 text-torn-green border border-torn-green/30 hover:bg-torn-green/30 hover:shadow-[0_0_12px_rgba(63,185,80,0.15)]"
            }`}
            onClick={(e) => {
              if (entry) {
                e.preventDefault();
                onAttackBlocked(m, entry);
              }
            }}
          >
            {isHosp ? "Hosp" : "Attack"}
          </a>
          <a
            href={m.stats_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2.5 py-1 rounded-md bg-bg-elevated text-text-secondary border border-border hover:text-text-primary hover:border-border transition-colors"
          >
            Stats
          </a>
          {canFlag && !entry ? (
            <button
              type="button"
              onClick={() => onRequestFlag(m)}
              className="text-xs px-2 py-1 rounded-md bg-bg-elevated text-text-muted border border-border hover:text-torn-red hover:border-torn-red/40 transition-colors"
              title="Flag as off-limits"
            >
              {"🚫"}
            </button>
          ) : null}
          {canEditEntry && entry ? (
            <>
              <button
                type="button"
                onClick={() => onRequestEdit(entry, m)}
                className="text-xs px-2 py-1 rounded-md bg-bg-elevated text-text-muted border border-border hover:text-text-primary transition-colors"
                title="Edit off-limit reason"
              >
                {"✎"}
              </button>
              <button
                type="button"
                onClick={() => onRequestRemove(entry)}
                className="text-xs px-2 py-1 rounded-md bg-bg-elevated text-text-muted border border-border hover:text-torn-red hover:border-torn-red/40 transition-colors"
                title="Remove off-limit"
              >
                {"✕"}
              </button>
            </>
          ) : null}
        </div>
      </td>
    </tr>
  );
});
