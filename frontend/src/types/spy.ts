export interface SpyEstimate {
  player_id: number;
  player_name: string | null;
  strength: number;
  defense: number;
  speed: number;
  dexterity: number;
  total: number;
  confidence: 'exact' | 'estimate' | 'stale' | 'unknown';
  source: string;
  reported_at: string | null;
  age_days: number | null;
  level?: number;
}

export interface SpyFactionResponse {
  faction: { id: number; name: string; tag: string } | null;
  members: SpyEstimate[];
  known_count: number;
  total_count: number;
}
