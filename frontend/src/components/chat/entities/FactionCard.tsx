"use client";

import type { FactionCard as FactionCardPayload } from "@/types/chat";

interface Props {
  card: FactionCardPayload;
}

export function FactionCard({ card }: Props) {
  return (
    <a
      href={card.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex flex-col max-w-full px-2 py-1.5 rounded-md border border-border bg-bg-elevated hover:bg-bg-surface transition-colors min-w-0 leading-tight"
    >
      <div className="flex items-center gap-1 text-sm">
        {card.tag && (
          <span className="text-[10px] px-1 rounded bg-torn-green/10 text-torn-green shrink-0">
            {card.tag}
          </span>
        )}
        <span className="font-medium text-text-primary truncate">{card.name}</span>
      </div>
      <div className="text-[11px] text-text-muted">
        {card.members_count > 0 && <>👥 {card.members_count}</>}
        {card.respect > 0 && <> · {card.respect.toLocaleString()} respect</>}
        {card.rank_name && <> · {card.rank_name}</>}
      </div>
    </a>
  );
}
