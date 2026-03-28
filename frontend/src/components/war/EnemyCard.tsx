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

export function EnemyCard({ member: m, hasBaseline }: EnemyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const now = Math.floor(Date.now() / 1000);

  const ok =
    m.last_action.status !== "Offline" && m.status.state === "Okay";
  const dotColor = ok
    ? "bg-green-500"
    : m.status.state === "Hospital"
      ? "bg-yellow-500"
      : "bg-red-500";

  // State
  let stateNode: React.ReactNode;
  if (m.status.state === "Hospital") {
    const left = m.status.until ? fmtCD(m.status.until - now) : "";
    stateNode = (
      <span className="text-torn-yellow">
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
  const threatNode = hasBaseline ? (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium border ${
        THREAT_COLORS[m.threat_label] || THREAT_COLORS.unknown
      }`}
    >
      {m.threat_label} {m.threat_score}
    </span>
  ) : (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium border cursor-pointer ${THREAT_COLORS.unknown}`}
    >
      add key
    </span>
  );

  const ps = m.personal_stats;

  return (
    <div
      className={`bg-bg-surface border rounded-lg p-3 cursor-pointer transition-all ${
        expanded ? "border-border" : "border-border"
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Row 1 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
          <span className="font-medium text-text-primary truncate">
            {m.name}
          </span>
          <span className="text-xs text-text-muted">{m.level}</span>
        </div>
        {threatNode}
      </div>

      {/* Row 2 */}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs">{stateNode}</span>
        <a
          href={m.attack_url}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-xs px-3 py-1 rounded font-medium transition-colors ${
            m.status.state === "Hospital"
              ? "bg-bg-elevated text-text-muted border border-border"
              : "bg-torn-green/20 text-torn-green border border-torn-green/30 hover:bg-torn-green/30"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          Attack
        </a>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border text-xs text-text-secondary">
          {ps ? (
            <div className="grid grid-cols-2 gap-1">
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
          <div className="flex gap-3 mt-2 pt-2 border-t border-border">
            <a
              href={m.stats_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-torn-blue hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Stats {"\u2197"}
            </a>
            <a
              href={m.profile_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-torn-blue hover:underline"
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
