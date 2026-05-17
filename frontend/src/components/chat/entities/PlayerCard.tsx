"use client";

import type { PlayerCard as PlayerCardPayload } from "@/types/chat";
import { Avatar } from "@/components/ui/Avatar";
import { StatusIcon } from "./StatusIcon";

const STATUS_CLASS: Record<PlayerCardPayload["status_color"], string> = {
  green: "bg-torn-green/15 text-torn-green",
  red: "bg-torn-red/15 text-torn-red",
  blue: "bg-torn-blue/15 text-torn-blue",
  gray: "bg-text-muted/15 text-text-muted",
};

function compactAge(seconds: number | null | undefined, fallback: string): string {
  if (seconds == null || seconds < 0) return fallback;
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 365) return `${d}d`;
  return fallback;
}

interface Props {
  card: PlayerCardPayload;
}

export function PlayerCard({ card }: Props) {
  const statusShort = card.status_short || card.status_text;
  const statusFull = card.status_full || card.status_text;
  const icon = card.status_icon || "circle";
  const ageShort = compactAge(card.last_action_seconds, card.last_action_text || "");
  const factionTitle = card.faction_name || "Faction tag";

  return (
    <div className="flex flex-wrap items-stretch w-full max-w-md rounded-md border border-border bg-bg-elevated overflow-hidden">
      <a
        href={card.profile_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-1 min-w-0 items-center gap-2 px-2 py-1.5 hover:bg-bg-surface transition-colors"
      >
        <Avatar playerId={card.id} name={card.name} size="sm" />
        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-sm leading-tight">
            <span className="font-medium text-text-primary truncate">{card.name}</span>
            <span className="text-[10px] text-text-muted shrink-0">L{card.level}</span>
            {card.faction_tag && (
              <span
                className="text-[10px] px-1 rounded bg-text-muted/15 text-text-muted shrink-0"
                title={factionTitle}
              >
                [{card.faction_tag}]
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] leading-tight min-w-0">
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${STATUS_CLASS[card.status_color]}`}
              title={statusFull}
            >
              <StatusIcon icon={icon} className="h-3 w-3 shrink-0" />
              <span className="truncate">{statusShort}</span>
            </span>
            {ageShort && (
              <span className="text-text-muted shrink-0" title={card.last_action_text}>
                · {ageShort}
              </span>
            )}
          </div>
        </div>
      </a>
      <a
        href={card.attack_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center min-h-[44px] min-w-[64px] px-3 text-xs font-medium text-torn-red border-l border-border hover:bg-torn-red/10 active:bg-torn-red/20 transition-colors"
        title={`Attack ${card.name}`}
      >
        Attack
      </a>
    </div>
  );
}
