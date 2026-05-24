"use client";

import { useEffect, useRef, useState, memo } from "react";
import { fmtCD, fmtNum } from "@/lib/format";
import type { EnemyMember, WarOffLimits } from "@/types/war";

interface EnemyCardProps {
  member: EnemyMember;
  hasBaseline: boolean;
  offLimits?: WarOffLimits | null;
  canFlag?: boolean;
  isMyEntry?: boolean;
  isAdmin?: boolean;
  onRequestFlag?: (member: EnemyMember) => void;
  onRequestEdit?: (entry: WarOffLimits, member: EnemyMember) => void;
  onRequestRemove?: (entry: WarOffLimits) => void;
  onAttackBlocked?: (member: EnemyMember, entry: WarOffLimits) => void;
}

const THREAT_COLORS: Record<string, string> = {
  easy: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/60 dark:text-green-400 dark:border-green-700/40",
  medium: "bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-900/60 dark:text-yellow-400 dark:border-yellow-700/40",
  hard: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/60 dark:text-red-400 dark:border-red-700/40",
  avoid: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/60 dark:text-purple-400 dark:border-purple-700/40",
  unknown: "bg-bg-elevated text-text-muted border-border",
};

const THREAT_GLOW: Record<string, string> = {
  easy: "0 0 8px rgba(74, 222, 128, 0.2)",
  medium: "0 0 8px rgba(250, 204, 21, 0.2)",
  hard: "0 0 8px rgba(248, 113, 113, 0.2)",
  avoid: "0 0 8px rgba(192, 132, 252, 0.25)",
  unknown: "none",
};

export const EnemyCard = memo(function EnemyCard({
  member: m,
  hasBaseline,
  offLimits,
  canFlag = false,
  isMyEntry = false,
  isAdmin = false,
  onRequestFlag,
  onRequestEdit,
  onRequestRemove,
  onAttackBlocked,
}: EnemyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const now = Math.floor(Date.now() / 1000);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const ok =
    m.last_action.status !== "Offline" && m.status.state === "Okay";
  const isHosp = m.status.state === "Hospital";
  const dotColor = ok
    ? "bg-green-500 text-green-500"
    : isHosp
      ? "bg-yellow-500 text-yellow-500"
      : "bg-red-500 text-red-500";

  let stateNode: React.ReactNode;
  if (isHosp) {
    const left = m.status.until ? fmtCD(m.status.until - now) : "";
    stateNode = (
      <span className="text-torn-yellow font-mono text-[11px]">
        {"🏥"} {left}
      </span>
    );
  } else if (m.status.state === "Okay") {
    stateNode = (
      <span className="text-torn-green">{m.last_action.status}</span>
    );
  } else {
    stateNode = <span className="text-text-muted">{m.status.state}</span>;
  }

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

  const handleAttackClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (offLimits && onAttackBlocked) {
      e.preventDefault();
      onAttackBlocked(m, offLimits);
    }
  };

  const canEditOffLimit = offLimits && (isMyEntry || isAdmin);
  const showMenu = canFlag || canEditOffLimit;

  return (
    <div
      className={`bg-bg-surface border rounded-lg p-3 cursor-pointer transition-all duration-200 active:scale-[0.99] ${
        expanded ? "border-border bg-bg-elevated/30" : "border-border hover:border-border-light"
      } ${offLimits ? "ring-1 ring-torn-red/30" : ""}`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Row 1 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`}
            style={ok ? { boxShadow: "0 0 6px currentColor" } : undefined}
          />
          <span className="font-medium text-text-primary truncate">
            {m.name}
          </span>
          <span className="text-xs text-text-muted">{m.level}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {offLimits ? (
            <span
              className="rounded-md px-2 py-0.5 text-xs font-semibold border bg-torn-red/15 text-torn-red border-torn-red/40"
              title={`Off-limits by ${offLimits.set_by_name}${offLimits.reason ? `: ${offLimits.reason}` : ""}`}
            >
              {"\u{1F6AB}"} Off-limits
            </span>
          ) : null}
          {threatNode}
        </div>
      </div>

      {/* Off-limits reason inline */}
      {offLimits && offLimits.reason ? (
        <div className="mt-1.5 text-xs text-text-muted italic line-clamp-2">
          {offLimits.set_by_name}: {offLimits.reason}
        </div>
      ) : null}

      {/* Row 2 */}
      <div className="flex items-center justify-between mt-2 gap-2">
        <span className="text-xs">{stateNode}</span>
        <div className="flex items-center gap-1">
          <a
            href={m.attack_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-xs px-4 py-1.5 rounded-md font-semibold transition-all active:scale-95 ${
              isHosp
                ? "bg-bg-elevated text-text-muted border border-border"
                : offLimits
                  ? "bg-torn-red/15 text-torn-red border border-torn-red/40 hover:bg-torn-red/25"
                  : "bg-torn-green/20 text-torn-green border border-torn-green/30 hover:bg-torn-green/30 hover:shadow-[0_0_12px_rgba(63,185,80,0.2)]"
            }`}
            onClick={handleAttackClick}
          >
            {isHosp ? "In Hosp" : "Attack"}
          </a>
          {showMenu ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="More actions"
                className="text-xs px-2 py-1.5 rounded-md font-semibold bg-bg-elevated border border-border text-text-secondary hover:text-text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
              >
                {"⋯"}
              </button>
              {menuOpen ? (
                <div
                  className="absolute right-0 top-full mt-1 z-20 min-w-[180px] bg-bg-card border border-border rounded-md shadow-lg py-1"
                  onClick={(e) => e.stopPropagation()}
                  role="menu"
                >
                  {canFlag && !offLimits ? (
                    <button
                      role="menuitem"
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-bg-elevated"
                      onClick={() => {
                        setMenuOpen(false);
                        onRequestFlag?.(m);
                      }}
                    >
                      Flag as off-limits
                    </button>
                  ) : null}
                  {canEditOffLimit && offLimits ? (
                    <>
                      <button
                        role="menuitem"
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-bg-elevated"
                        onClick={() => {
                          setMenuOpen(false);
                          // Prevent inline arrow function in parent
                          onRequestEdit?.(offLimits, m);
                        }}
                      >
                        Edit reason
                      </button>
                      <button
                        role="menuitem"
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-xs text-torn-red hover:bg-bg-elevated"
                        onClick={() => {
                          setMenuOpen(false);
                          onRequestRemove?.(offLimits);
                        }}
                      >
                        Remove off-limit
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
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
              Stats {"↗"}
            </a>
            <a
              href={m.profile_url}
              target="_blank" rel="noopener noreferrer"
              className="text-torn-blue hover:underline inline-flex items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              Profile {"↗"}
            </a>
          </div>
        </div>
      )}
    </div>
  );
});
