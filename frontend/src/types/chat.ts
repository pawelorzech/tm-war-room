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
  type: "message" | "thread_message" | "typing" | "delete" | "edit" | "pin" | "thread";
  payload: Record<string, unknown>;
}

export interface UnreadCounts {
  channels: Record<number, number>;
  total: number;
}
