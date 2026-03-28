export interface SpyEstimate {
  player_id: number;
  player_name: string | null;
  strength: number;
  defense: number;
  speed: number;
  dexterity: number;
  total: number;
  confidence: 'exact' | 'estimate' | 'stale';
  source: string;
  reported_at: string;
  age_days: number;
}
