"use client";

import type { PlayerCard as PlayerCardPayload } from "@/types/chat";
import { Avatar } from "@/components/ui/Avatar";

const STATUS_CLASS: Record<PlayerCardPayload["status_color"], string> = {
  green: "bg-torn-green/20 text-torn-green",
  red: "bg-torn-red/20 text-torn-red",
  blue: "bg-torn-blue/20 text-torn-blue",
  gray: "bg-text-muted/20 text-text-muted",
};

interface Props {
  card: PlayerCardPayload;
}

export function PlayerCard({ card }: Props) {
  return (
    <div className="inline-flex items-stretch max-w-full rounded-md border border-border bg-bg-elevated overflow-hidden">
      <a
        href={card.profile_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-2 py-1.5 hover:bg-bg-surface transition-colors min-w-0"
      >
        <Avatar playerId={card.id} name={card.name} size="sm" />
        <div className="min-w-0 flex flex-col">
          <div className="flex items-center gap-1 text-sm leading-tight">
            <span className="font-medium text-text-primary truncate">{card.name}</span>
            <span className="text-[10px] text-text-muted shrink-0">L{card.level}</span>
            {card.faction_tag && (
              <span className="text-[10px] px-1 rounded bg-torn-green/10 text-torn-green truncate">
                {card.faction_tag}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px] leading-tight">
            <span className={`px-1 rounded ${STATUS_CLASS[card.status_color]}`}>
              {card.status_text}
            </span>
            {card.last_action_text && (
              <span className="text-text-muted truncate">· {card.last_action_text}</span>
            )}
          </div>
        </div>
      </a>
      <a
        href={card.attack_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center px-2 text-[11px] font-medium text-torn-red border-l border-border hover:bg-torn-red/10 transition-colors"
        title={`Attack ${card.name}`}
      >
        Attack
      </a>
    </div>
  );
}
