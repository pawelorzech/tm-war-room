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
  author_id: number;
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

export interface FactionSpyMember {
  player_id: number;
  player_name: string;
  strength: number;
  defense: number;
  speed: number;
  dexterity: number;
  total: number;
  confidence: 'exact' | 'estimate' | 'unknown' | string;
  source: string;
  reported_at: string | null;
  age_days: number | null;
  level: number;
}

export interface FactionSpiesResponse {
  faction: unknown | null;
  members: FactionSpyMember[];
  known_count: number;
  total_count: number;
}

export interface TmKey {
  player_id: number;
  name: string;
}

export interface KeysResponse {
  keys: TmKey[];
}

export interface EnemyMember {
  id: number;
  name: string;
  level?: number;
  threat_label?: string;
}

export interface EnemyResponse {
  faction: unknown | null;
  members: EnemyMember[];
  threat_mode?: string;
  threat_baseline?: string | null;
  cached_at?: number;
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

export interface StockHolding {
  stock_id: number;
  name: string;
  acronym: string;
  total_shares: number;
  current_price: number;
  current_value: number;
  cost_basis: number;
  profit: number;
  profit_pct: number;
  benefit_ready: boolean;
  benefit_progress: number;
  benefit_frequency: number;
  dividend_ready: boolean;
  dividend_progress: number;
  dividend_frequency: number;
}

export interface StockPortfolioResponse {
  holdings: StockHolding[];
  count: number;
  total_value: number;
  total_cost: number;
  total_profit: number;
  total_profit_pct: number;
}

export interface StockRoiRecommendation {
  stock_id: number;
  acronym: string;
  name: string;
  benefit_desc: string;
  increment: number;
  shares_required: number;
  shares_this_block: number;
  cost_total: number;
  cost_this_block: number;
  payout_value: number;
  payout_freq_days: number;
  daily_value: number;
  days_to_breakeven: number;
  roi_annual_pct: number;
  marginal_payback_days: number;
  marginal_roi_pct: number;
  owned_shares: number;
  shares_needed: number;
  cost_remaining: number;
  is_active: boolean;
  price_is_live: boolean;
}

export interface StockRoiResponse {
  recommendations: StockRoiRecommendation[];
  count: number;
}

export interface ArmouryCompetition {
  id: number;
  name: string;
  category: string;
  status: string;
  start_ts: number;
  end_ts: number;
  prize_text?: string | null;
  items?: string | null;
}

export interface ArmouryCompetitionsResponse {
  competitions: ArmouryCompetition[];
  count: number;
}

export interface ArmouryLeaderboardRow {
  rank: number;
  player_id: number;
  player_name: string;
  total: number;
  deposits: number;
  last_deposit: number | null;
}

export interface ArmouryLeaderboardResponse {
  competition: ArmouryCompetition;
  leaderboard: ArmouryLeaderboardRow[];
  total_deposited: number;
  participants: number;
}

export interface KnownSpiesResponse {
  estimates: SpyEstimate[];
  count: number;
}

export interface TravelItem {
  name: string;
  item_id: number;
  abroad_cost: number;
  market_value: number;
  quantity: number;
  source: string;
  profit: number;
}

export interface TravelCountry {
  id: string;
  name: string;
  flag?: string;
  travel_min?: number;
  items: TravelItem[];
  last_update: number;
  data_source: 'yata' | 'none' | string;
  best_profit: number;
}

export interface TravelResponse {
  countries: TravelCountry[];
  count: number;
}

export interface MarketPriceItem {
  id: number;
  name: string;
  type: string;
  market_value: number;
  buy_price: number;
  sell_price: number;
  circulation: number;
  profit_buy_sell: number;
  profit_margin_pct: number;
  is_shop: boolean;
  country_slug: string | null;
  country_name: string | null;
  country_flag: string | null;
}

export interface MarketPricesResponse {
  items: MarketPriceItem[];
  count: number;
}

export interface OcParticipant {
  player_id: number;
  player_name: string;
  role: string;
  checkpoint_pass_rate: number;
  planning_complete: boolean;
}

export interface OcCrime {
  id: number;
  name: string;
  status: string;
  difficulty: string;
  initiated_at: number;
  executed_at: number;
  ready_at: number;
  success: boolean | null;
  money_gain: number;
  respect_gain: number;
  participants: OcParticipant[];
  participant_count: number;
}

export interface OcResponse {
  crimes: OcCrime[];
  count: number;
  category: string;
}

// ── Hit claims (Phase 4) ────────────────────────────────────

export interface ClaimRow {
  target_id: number;
  claimer_id: number;
  claimer_name: string | null;
  claimed_at: number;
  expires_at: number;
  status: 'active' | 'released' | 'hit' | 'expired';
  note: string | null;
}

export interface ClaimActiveResponse {
  claims: ClaimRow[];
  cached_at: number;
}
