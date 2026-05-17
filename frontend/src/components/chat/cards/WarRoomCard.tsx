"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

type WarCard = Awaited<ReturnType<typeof api.chatWarRoomCard>>;

const REFRESH_MS = 30_000;

function fmtRemaining(secs: number): string {
  if (secs <= 0) return "Ended";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Live ranked-war card pinned above the message list on #war-room.
 *
 *  Hides itself when there's no active war (so the chat looks normal on
 *  the 99% of days that aren't war). Refreshes every 30s while mounted —
 *  parent only mounts it on the war-room channel so it polls only when
 *  it's visible. */
export function WarRoomCard() {
  const [card, setCard] = useState<WarCard | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchCard = () => {
      api.chatWarRoomCard()
        .then(r => { if (!cancelled) setCard(r); })
        .catch(() => { if (!cancelled) setCard(null); });
    };
    fetchCard();
    const t = setInterval(fetchCard, REFRESH_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (!card || !card.active) return null;

  const lead = (card.score_us ?? 0) - (card.score_them ?? 0);
  const leadClass = lead > 0 ? "text-torn-green" : lead < 0 ? "text-torn-red" : "text-text-muted";

  return (
    <div className="border-b border-torn-red/40 bg-torn-red/5 px-3 py-2 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-torn-red text-white font-bold uppercase shrink-0">
          RW Live
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary truncate">
              vs {card.opponent_name || "Opponent"}
            </span>
            <span className={`text-sm font-mono ${leadClass}`}>
              {(card.score_us ?? 0).toLocaleString()} – {(card.score_them ?? 0).toLocaleString()}
            </span>
            {card.target_score ? (
              <span className="text-[11px] text-text-muted">
                / {card.target_score.toLocaleString()}
              </span>
            ) : null}
            <span className="text-[11px] text-text-muted">
              · {fmtRemaining(card.time_remaining_s ?? 0)} left
            </span>
          </div>
        </div>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="text-text-muted hover:text-text-primary text-xs px-1"
          aria-label={collapsed ? "Expand war card" : "Collapse war card"}
        >
          {collapsed ? "▾" : "▴"}
        </button>
      </div>

      {!collapsed && card.top_targets && card.top_targets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="text-[10px] text-text-muted uppercase tracking-wide self-center mr-1">
            Easiest now:
          </span>
          {card.top_targets.map(t => (
            <a
              key={t.id}
              href={t.attack_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-torn-red/40 bg-bg-elevated hover:bg-torn-red/10 transition-colors text-[11px]"
              title={`L${t.level} · ${t.threat_label} · ${t.status_text}`}
            >
              <span className="text-text-primary truncate max-w-[110px]">{t.name}</span>
              <span className="text-text-muted">L{t.level}</span>
            </a>
          ))}
        </div>
      )}
      {!collapsed && (!card.top_targets || card.top_targets.length === 0) && (
        <div className="mt-1 text-[11px] text-text-muted italic">
          No attackable enemies right now (all in hospital / offline).
        </div>
      )}
    </div>
  );
}
