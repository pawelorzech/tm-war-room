"use client";

import type { WarCard as WarCardPayload } from "@/types/chat";

function fmtRemaining(secs: number): string {
  if (secs <= 0) return "Ended";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

interface Props {
  card: WarCardPayload;
}

export function WarCard({ card }: Props) {
  const lead = card.score_us - card.score_them;
  const leadClass = lead > 0 ? "text-torn-green" : lead < 0 ? "text-torn-red" : "text-text-muted";
  return (
    <a
      href={card.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex flex-col max-w-full px-2 py-1.5 rounded-md border border-border bg-bg-elevated hover:bg-bg-surface transition-colors min-w-0 leading-tight"
    >
      <div className="flex items-center gap-1 text-sm">
        <span className="text-[10px] px-1 rounded bg-torn-red/10 text-torn-red shrink-0 uppercase">
          {card.ended ? "RW ended" : "RW live"}
        </span>
        <span className="font-medium text-text-primary truncate">
          vs {card.opponent_name || "Opponent"}
        </span>
      </div>
      <div className="text-[11px]">
        <span className={leadClass}>
          {card.score_us.toLocaleString()} – {card.score_them.toLocaleString()}
        </span>
        {card.target_score > 0 && (
          <span className="text-text-muted"> · target {card.target_score.toLocaleString()}</span>
        )}
        {!card.ended && card.time_remaining_s > 0 && (
          <span className="text-text-muted"> · {fmtRemaining(card.time_remaining_s)}</span>
        )}
      </div>
    </a>
  );
}
