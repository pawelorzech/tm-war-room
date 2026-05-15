export interface LastAction {
  status: string;
  timestamp: number;
  relative: string;
}

export interface MemberStatus {
  description: string;
  details: string | null;
  state: string;
  color: string;
  until: number | null;
}

export interface FactionMember {
  id: number;
  name: string;
  level: number;
  days_in_faction: number;
  last_action: LastAction;
  status: MemberStatus;
  position: string;
  is_on_wall: boolean;
  is_revivable: boolean;
  is_in_oc: boolean;
  revive_setting: string;
}

export interface WarFaction {
  id: number;
  name: string;
  score: number;
  chain: number;
}

export interface WarStatus {
  war_id: number | null;
  start: number | null;
  end: number | null;
  target: number | null;
  winner: number | null;
  factions: WarFaction[];
}

export interface WarProgress {
  war_id: number;
  start: number;
  end: number | null;
  target: number;
  our_score: number;
  their_score: number;
  our_name: string;
  their_name: string;
  our_id: number;
  their_id: number;
  our_pct: number;
  their_pct: number;
}

export interface PersonalStats {
  xanax_taken: number;
  refills: number;
  stat_enhancers_used: number;
  attacks_won: number;
  attacks_lost: number;
  defends_won: number;
  defends_lost: number;
  networth: number;
  highest_beaten: number;
  best_damage: number;
  best_kill_streak: number;
  damage_done: number;
}

export interface EnemyMember extends FactionMember {
  personal_stats: PersonalStats | null;
  threat_score: number;
  threat_label: string;
  attack_url: string;
  profile_url: string;
  stats_url: string;
}

export interface FactionInfo {
  id: number;
  name: string;
  tag: string;
  respect: number;
  members_count: number;
  rank_name: string;
  rank_level: number;
  best_chain: number;
  wins: number;
}

export interface OverviewResponse {
  members: FactionMember[];
  war: WarStatus | null;
  war_progress: WarProgress | null;
  chain: { current: number; max: number; modifier: number } | null;
  cached_at: number;
}

export interface DetailResponse {
  yata_down: boolean;
  members: Record<string, {
    energy: number;
    max_energy: number | null;
    drug_cd: number;
    refill: boolean;
    source: string;
  }>;
  cached_at: number;
}

export interface EnemyResponse {
  faction: FactionInfo | null;
  members: EnemyMember[];
  threat_mode: string;
  threat_baseline: string | null;
  cached_at: number;
}

export interface WarOffLimits {
  war_id: number;
  player_id: number;
  player_name: string;
  set_by: number;
  set_by_name: string;
  reason: string;
  created_at: string;
  updated_at: string;
}

export interface WarOffLimitsResponse {
  war_id: number;
  entries: WarOffLimits[];
  count: number;
}
