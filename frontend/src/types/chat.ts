export interface Channel {
  id: number;
  name: string;
  description: string;
  type: "chat" | "forum";
  position: number;
  admin_only: number;
  write_restricted: number;
  created_at: number;
  created_by: number;
  unread?: number;
}

export interface Reactor {
  id: number;
  name: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  players: Reactor[];
}

export interface EntityRef {
  kind: "player" | "item" | "faction" | "rankedwar";
  raw: string;
  id: number | null;
  span: [number, number];
}

export type StatusIcon =
  | "circle"
  | "plane"
  | "heart-pulse"
  | "lock"
  | "shield-alert"
  | "skull";

export interface PlayerCard {
  kind: "player";
  id: number;
  name: string;
  level: number;
  faction_tag: string;
  faction_name?: string;
  status_text: string;
  status_full?: string;
  status_short?: string;
  status_icon?: StatusIcon;
  status_color: "green" | "red" | "blue" | "gray";
  last_action_text: string;
  last_action_seconds?: number | null;
  attack_url: string;
  profile_url: string;
}

export interface ItemCard {
  kind: "item";
  id: number;
  name: string;
  image: string;
  market_low: number;
  type: string;
  circulation: number;
  market_url: string;
  wiki_url: string;
}

export interface FactionCard {
  kind: "faction";
  id: number;
  name: string;
  tag: string;
  members_count: number;
  respect: number;
  rank_name: string;
  url: string;
}

export interface WarCard {
  kind: "rankedwar";
  id: number;
  ended: boolean;
  score_us: number;
  score_them: number;
  opponent_name: string;
  opponent_id: number;
  us_name: string;
  target_score: number;
  time_remaining_s: number;
  url: string;
}

export type EntityCard = PlayerCard | ItemCard | FactionCard | WarCard;

export interface Message {
  id: number;
  channel_id: number;
  thread_id: number | null;
  player_id: number;
  player_name: string;
  content: string;
  bot_id: number | null;
  mentions: number[];
  pinned: number;
  deleted: number;
  created_at: number;
  edited_at: number | null;
  reactions?: Reaction[];
  entities?: EntityRef[];
  ephemeral?: boolean;
  render?: Record<string, unknown> | null;
  _optimistic?: boolean;
}

export interface Thread {
  id: number;
  channel_id: number;
  title: string;
  player_id: number;
  player_name: string;
  pinned: number;
  locked: number;
  created_at: number;
  last_message_at: number;
}

export interface Bot {
  id: number;
  name: string;
  avatar: string;
  allowed_channels: string;
  created_by: number;
  active: number;
  created_at: number;
}

export interface ChatWSMessage {
  type:
    | "message"
    | "thread_message"
    | "typing"
    | "delete"
    | "edit"
    | "pin"
    | "thread"
    | "reaction_add"
    | "reaction_remove";
  payload: Record<string, unknown>;
}

export interface UnreadCounts {
  channels: Record<number, number>;
  total: number;
}
