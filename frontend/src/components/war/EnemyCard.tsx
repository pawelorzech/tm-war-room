"use client";

import { useState } from "react";
import { fmtCD, fmtNum } from "@/lib/format";
import type { EnemyMember } from "@/types/war";

interface EnemyCardProps {
  member: EnemyMember;
  hasBaseline: boolean;
}

const THREAT_COLORS: Record<string, string> = {
  easy: "bg-green-900/60 text-green-400 border-green-700/40",
  medium: "bg-yellow-900/60 text-yellow-400 border-yellow-700/40",
  hard: "bg-red-900/60 text-red-400 border-red-700/40",
  avoid: "bg-purple-900/60 text-purple-400 border-purple-700/40",
  unknown: "bg-bg-elevated text-text-muted border-border",
};

const THREAT_GLOW: Record<string, string> = {
  easy: "0 0 8px rgba(74, 222, 128, 0.2)",
  medium: "0 0 8px rgba(250, 204, 21, 0.2)",
  hard: "0 0 8px rgba(248, 113, 113, 0.2)",
  avoid: "0 0 8px rgba(192, 132, 252, 0.25)",
  unknown: "none",
};

export function EnemyCard({ member: m, hasBaseline }: EnemyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const now = Math.floor(Date.now() / 1000);

  const ok =
    m.last_action.status !== "Offline" && m.status.state === "Okay";
  const isHosp = m.status.state === "Hospital";
  const dotColor = ok
    ? "bg-green-500 text-green-500"
    : isHosp
      ? "bg-yellow-500 text-yellow-500"
      : "bg-red-500 text-red-500";

  // State
  let stateNode: React.ReactNode;
  if (isHosp) {
    const left = m.status.until ? fmtCD(m.status.until - now) : "";
    stateNode = (
      <span className="text-torn-yellow font-mono text-[11px]">
        {"\uD83C\uDFE5"} {left}
      </span>
    );
  } else if (m.status.state === "Okay") {
    stateNode = (
      <span className="text-torn-green">{m.last_action.status}</span>
    );
  } else {
    stateNode = <span className="text-text-muted">{m.status.state}</span>;
  }

  // Threat badge
  const threatLabel = m.threat_label || "unknown";
  const threatNode = hasBaseline ? (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-semibold border ${
        THREAT_COLORS[threatLabel] || THREAT_COLORS.unknown
      }`}
      style={{ boxShadow: THREAT_GLOW[threatLabel] || THREAT_GLOW.unknown }}
    >
      {m.threat_label} {m.threat_score}
    </span>
  ) : (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-medium border cursor-pointer ${THREAT_COLORS.unknown}`}
    >
      add key
    </span>
  );

  const ps = m.personal_stats;

  return (
    <div
      className={`bg-bg-surface border rounded-lg p-3 cursor-pointer transition-all duration-200 active:scale-[0.99] ${
        expanded ? "border-border bg-bg-elevated/30" : "border-border hover:border-border-light"
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Row 1 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`}
            style={ok ? { boxShadow: "0 0 6px currentColor" } : undefined}
          />
          <span className="font-medium text-text-primary truncate">
            {m.name}
          </span>
          <span className="text-xs text-text-muted">{m.level}</span>
        </div>
        {threatNode}
      </div>

      {/* Row 2 */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs">{stateNode}</span>
        <a
          href={m.attack_url}
          target="_blank" rel="noopener noreferrer"
          
          className={`text-xs px-4 py-1.5 rounded-md font-semibold transition-all active:scale-95 ${
            isHosp
              ? "bg-bg-elevated text-text-muted border border-border"
              : "bg-torn-green/20 text-torn-green border border-torn-green/30 hover:bg-torn-green/30 hover:shadow-[0_0_12px_rgba(63,185,80,0.2)]"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {isHosp ? "In Hosp" : "Attack"}
        </a>
      </div>

      {/* Expanded */}
      {expanded && (
        <div
          className="mt-3 pt-3 border-t border-border text-xs text-text-secondary"
          style={{ animation: "tm-expand 0.25s ease-out" }}
        >
          {ps ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <div>
                <span className="text-text-muted">Xanax:</span>{" "}
                {ps.xanax_taken.toLocaleString()}
              </div>
              <div>
                <span className="text-text-muted">Refills:</span>{" "}
                {ps.refills.toLocaleString()}
              </div>
              <div>
                <span className="text-text-muted">SEs:</span>{" "}
                {ps.stat_enhancers_used}
              </div>
              <div>
                <span className="text-text-muted">Atk won:</span>{" "}
                {ps.attacks_won.toLocaleString()}
              </div>
              <div>
                <span className="text-text-muted">Def won:</span>{" "}
                {ps.defends_won.toLocaleString()}
              </div>
              <div>
                <span className="text-text-muted">Best streak:</span>{" "}
                {ps.best_kill_streak}
              </div>
              <div>
                <span className="text-text-muted">NW:</span> $
                {fmtNum(ps.networth)}
              </div>
              <div>
                <span className="text-text-muted">Best beaten:</span> Lv{" "}
                {ps.highest_beaten}
              </div>
              <div>
                <span className="text-text-muted">Last action:</span>{" "}
                {m.last_action.relative}
              </div>
              <div>
                <span className="text-text-muted">Damage:</span>{" "}
                {fmtNum(ps.best_damage)}
              </div>
            </div>
          ) : (
            <div className="text-text-muted mb-1">
              No TornStats data available
            </div>
          )}
          <div className="flex gap-4 mt-2.5 pt-2.5 border-t border-border">
            <a
              href={m.stats_url}
              target="_blank" rel="noopener noreferrer"
              
              className="text-torn-blue hover:underline inline-flex items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              Stats {"\u2197"}
            </a>
            <a
              href={m.profile_url}
              target="_blank" rel="noopener noreferrer"
              
              className="text-torn-blue hover:underline inline-flex items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              Profile {"\u2197"}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
