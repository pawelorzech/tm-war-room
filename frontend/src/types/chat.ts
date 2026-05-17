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
