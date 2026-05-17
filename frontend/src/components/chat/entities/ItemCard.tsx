"use client";

import type { ItemCard as ItemCardPayload } from "@/types/chat";

function fmtMoney(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v}`;
}

interface Props {
  card: ItemCardPayload;
}

export function ItemCard({ card }: Props) {
  return (
    <a
      href={card.market_url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 max-w-full px-2 py-1.5 rounded-md border border-border bg-bg-elevated hover:bg-bg-surface transition-colors min-w-0"
    >
      <img
        src={card.image}
        alt=""
        width={28}
        height={28}
        className="shrink-0 object-contain"
        loading="lazy"
      />
      <div className="min-w-0 flex flex-col leading-tight">
        <div className="flex items-center gap-1 text-sm">
          <span className="font-medium text-text-primary truncate">{card.name}</span>
          {card.type && (
            <span className="text-[10px] text-text-muted shrink-0">· {card.type}</span>
          )}
        </div>
        <div className="text-[11px] text-torn-green">
          {card.market_low > 0 ? `Market ${fmtMoney(card.market_low)}` : "Not on market"}
          {card.circulation > 0 && (
            <span className="text-text-muted ml-1">· {card.circulation.toLocaleString()} in circ</span>
          )}
        </div>
      </div>
    </a>
  );
}
