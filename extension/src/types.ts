// Types mirroring backend response shapes the userscript consumes.
// Keep these in sync with TM Hub frontend/src/types/war.ts.

export interface CurrentWar {
  war_id: number | null;
  opponent_faction_id: number | null;
  opponent_name?: string | null;
  start: number | null;
  end: number | null;
}

export interface WarOffLimits {
  war_id: number;
  player_id: number;
  player_name: string;
  set_by: number;
  set_by_name: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface WarOffLimitsResponse {
  war_id: number;
  entries: WarOffLimits[];
  count: number;
}

export interface ExtensionTokenResponse {
  ext_token: string;
  player_id: number;
  player_name: string;
  expires_hours: number;
}

export interface CompanionAuth {
  token: string;
  player_id: number;
  player_name?: string;
  expires_at?: number;
}

export interface NotificationItem {
  id: number;
  title: string;
  body: string;
  url?: string | null;
  icon?: string | null;
  created_at?: string;
}

export interface NotificationsUnread {
  notifications: NotificationItem[];
  count: number;
}

export interface MentionPreview {
  id: number;
  channel_id: number;
  channel_name: string;
  author_name: string;
  content: string;
  created_at: string;
}

export interface MentionsRecentResponse {
  mentions: MentionPreview[];
  count: number;
}
