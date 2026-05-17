export interface SpyEstimate {
  player_id: number;
  player_name: string | null;
  // Per-stat is null when bucket === 'rough_guess' — backend nulls them
  // explicitly because the heuristic only knows the total, not the split.
  strength: number | null;
  defense: number | null;
  speed: number | null;
  dexterity: number | null;
  total: number;
  confidence: 'exact' | 'estimate' | 'stale' | 'unknown';
  source: string;
  reported_at: string | null;
  age_days: number | null;
  level?: number;

  // Display-layer fields (server-computed via api.services.spy_display.bucket_and_range):
  bucket?: 'verified' | 'estimate' | 'rough_guess';
  total_range?: [number, number];
  range_width_pct?: number;
  heuristic_confidence?: 'medium' | 'low' | 'very low' | null;
}

export interface SpyFactionInfo {
  id?: number;
  name: string;
  tag: string;
}

export interface SpyFactionResponse {
  faction: SpyFactionInfo | null;
  members: SpyEstimate[];
  known_count: number;
  total_count: number;
}

export interface SpySubmitResponse {
  status: string;
  estimate: SpyEstimate;
}
