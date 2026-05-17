export interface SpyEstimate {
  player_id: number;
  player_name: string | null;
  // Per-stat is null when bucket === 'rough_guess' or 'endgame' — the heuristic
  // only knows the total (or refuses to publish a number at all for endgame),
  // not the split, so the backend nulls them rather than fabricating a 4-way.
  strength: number | null;
  defense: number | null;
  speed: number | null;
  dexterity: number | null;
  total: number;
  // 'low' is what the backend emits for endgame players (we can't be confident
  // about a number we deliberately don't publish).
  confidence: 'exact' | 'estimate' | 'stale' | 'unknown' | 'low';
  source: string;
  reported_at: string | null;
  age_days: number | null;
  level?: number;
  // v2 profile.rank string (e.g. 'Invincible', 'Heroic'). Optional — only set
  // when the spy router could resolve it and the bucket is 'endgame'.
  rank?: string | null;

  // Display-layer fields (server-computed via api.services.spy_display.bucket_and_range):
  bucket?: 'verified' | 'estimate' | 'rough_guess' | 'endgame';
  // For 'endgame' the backend ships range as { low: null, high: null }, which
  // we deliberately ignore client-side — endgame is intentionally numberless.
  total_range?: [number, number];
  range_width_pct?: number;
  heuristic_confidence?: 'medium' | 'low' | 'very low' | null;
  // Backend-supplied warning sentence for the endgame bucket. The display
  // helpers fall back to a hardcoded string when this is missing.
  caption?: string | null;
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
