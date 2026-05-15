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

export interface ChatChannel {
  id: number;
  name: string;
  description?: string | null;
  type?: string;
  position?: number;
  admin_only?: boolean | number;
  write_restricted?: boolean | number;
}

export interface ChatMessage {
  id: number;
  channel_id: number;
  thread_id: number | null;
  player_id: number;
  player_name: string;
  content: string;
  bot_id?: number | null;
  mentions: number[];
  pinned: number;
  deleted: number;
  created_at: number;
  edited_at?: number | null;
}

export interface ChatUnreadResponse {
  channels: Record<string, number>;
  total: number;
}

export interface SpyEstimate {
  player_id: number;
  player_name: string;
  strength: number;
  defense: number;
  speed: number;
  dexterity: number;
  total: number;
  confidence: 'exact' | 'estimate' | 'unknown' | string;
  source: string;
  reported_at: string;
  age_days: number;
}

export interface Target {
  player_id: number;
  player_name: string;
  tag?: string | null;
  notes?: string | null;
  difficulty?: string | null;
  added_by?: number;
  added_by_name?: string;
}

export interface TargetsResponse {
  targets: Target[];
  count: number;
  tags: string[];
}

export interface Stakeout {
  player_id: number;
  player_name: string;
  notes?: string | null;
  added_by?: number;
  added_by_name?: string;
}

export interface StakeoutsResponse {
  stakeouts: Stakeout[];
  count: number;
}

export type ThreatLabel = 'trivial' | 'easy' | 'moderate' | 'dangerous' | 'lethal' | 'unknown';
export type ThreatSource = 'spy' | 'estimated' | 'none';

export interface BountyItem {
  target_id: number;
  target_name?: string;
  target_level?: number;
  reward: number;
  reason?: string;
  threat_score: number;
  threat_label: ThreatLabel;
  threat_source: ThreatSource;
  estimated_total?: number | null;
  target_status?: string;
}

export interface BountiesResponse {
  bounties: BountyItem[];
  count: number;
  total_value: number;
  threat_mode?: string;
}

export interface LootReservation {
  player_id: number;
  player_name: string;
  target_level: number;
}

export interface LootNpc {
  id: number;
  name: string;
  status: string;
  hosp_out: number | null;
  level: number;
  next_level_at: number | null;
  level_times: Record<string, number>;
  updated: number;
  reservations: LootReservation[];
}

export interface LootResponse {
  npcs: LootNpc[];
  count: number;
  fetched_at: number;
}
