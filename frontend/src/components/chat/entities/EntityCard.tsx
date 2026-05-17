"use client";

import type { EntityCard as EntityCardPayload } from "@/types/chat";
import { PlayerCard } from "./PlayerCard";
import { ItemCard } from "./ItemCard";
import { FactionCard } from "./FactionCard";
import { WarCard } from "./WarCard";

interface Props {
  card: EntityCardPayload;
}

/** Discriminated-union renderer for chat entity cards.
 *  Compact mode = 2 lines. Cards render on a 220px-wide compact track so
 *  several can sit side-by-side in a row when a message has multiple links. */
export function EntityCard({ card }: Props) {
  switch (card.kind) {
    case "player":
      return <PlayerCard card={card} />;
    case "item":
      return <ItemCard card={card} />;
    case "faction":
      return <FactionCard card={card} />;
    case "rankedwar":
      return <WarCard card={card} />;
    default:
      return null;
  }
}
