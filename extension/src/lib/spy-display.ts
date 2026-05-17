/**
 * Display helpers for spy estimates — bucket classification, range string,
 * per-stat grid.
 *
 * IMPORTANT: this file is duplicated VERBATIM into frontend/src/lib/spy-display.ts
 * because the companion (esbuild bundle) and the Next.js frontend can't
 * share a single source file (no monorepo path mapping). Following the
 * existing format.ts precedent. Keep both copies in sync — the canonical
 * tests live in extension/src/lib/spy-display.test.ts.
 */

export type Bucket = 'verified' | 'estimate' | 'rough_guess' | 'endgame';

// Minimal subset of the API's SpyEstimate that this module touches.
export interface SpyEstimate {
  player_id: number;
  player_name: string | null;
  strength: number | null;
  defense: number | null;
  speed: number | null;
  dexterity: number | null;
  total: number;
  confidence: 'exact' | 'estimate' | 'stale' | 'unknown' | 'low';
  source: string;
  reported_at: string | null;
  age_days: number | null;
  level?: number;
  rank?: string | null;
  bucket?: Bucket;
  total_range?: [number, number] | [null, null];
  range_width_pct?: number;
  heuristic_confidence?: 'medium' | 'low' | 'very low' | null;
  // Endgame bucket carries the human caption from the API; fallback string is
  // used when the field is missing (older backend or wire-format drift).
  caption?: string | null;
}

export interface BucketDisplay {
  badgeText: string;
  color: 'green' | 'yellow' | 'orange' | 'red';
  borderColor: string;
  badgeBg: string;
  badgeFg: string;
}

const STYLE: Record<Bucket, BucketDisplay> = {
  verified: {
    badgeText: 'VERIFIED SPY',
    color: 'green',
    borderColor: '#3fb950',
    badgeBg: 'rgba(63,185,80,0.18)',
    badgeFg: '#56d364',
  },
  estimate: {
    badgeText: 'ESTIMATE',
    color: 'yellow',
    borderColor: '#d29922',
    badgeBg: 'rgba(210,153,34,0.18)',
    badgeFg: '#e8b339',
  },
  rough_guess: {
    badgeText: 'ROUGH GUESS',
    color: 'orange',
    borderColor: '#f5a05a',
    badgeBg: 'rgba(245,160,90,0.18)',
    badgeFg: '#f5a05a',
  },
  // Endgame: Invincible/Heroic/Elite/Legendary players whose real stats sit
  // in trillions — the linear estimator structurally cannot produce that
  // number, so we deliberately render NO range. Burgundy / red palette is
  // the "back off, get a real spy" visual signal.
  endgame: {
    badgeText: 'ENDGAME PLAYER',
    color: 'red',
    borderColor: '#b62324',
    badgeBg: 'rgba(182,35,36,0.22)',
    badgeFg: '#ff7b72',
  },
};

export function bucketStyle(bucket: Bucket): BucketDisplay {
  return STYLE[bucket];
}

function fmtBig(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(Math.round(n));
}

// One-decimal compact for range endpoints — "4.5B" reads nicer than "4.50B"
// inside a range pair.
function fmtRangeEndpoint(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '?';
  if (n >= 1_000_000_000) {
    const v = n / 1_000_000_000;
    return (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)) + 'B';
  }
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(0)) + 'M';
  }
  if (n >= 1_000) return Math.round(n / 1_000) + 'k';
  return String(Math.round(n));
}

export function formatTotalRange(
  total: number,
  range: [number, number] | [null, null] | undefined,
  bucket: Bucket,
): string {
  // Endgame: no numeric estimate is honest, the linear model can't produce
  // T-scale. Caller is expected to skip the hero-number row entirely; we
  // return an empty string so any accidental render is at least silent.
  if (bucket === 'endgame') return '';
  if (bucket === 'verified') {
    if (total <= 0) return '—';
    return total.toLocaleString('en-US');
  }
  if (!range) {
    return fmtBig(total);
  }
  const [low, high] = range;
  if (low == null || high == null) return '? — ?';
  if (low === 0 && high === 0) return '? — ?';
  return `${fmtRangeEndpoint(low)} — ${fmtRangeEndpoint(high)}`;
}

export interface PerStatGrid {
  str: string;
  def: string;
  spd: string;
  dex: string;
}

export function formatPerStat(spy: SpyEstimate): PerStatGrid | null {
  // Endgame + rough_guess: no per-stat grid (we don't have the numbers).
  if (spy.bucket === 'rough_guess' || spy.bucket === 'endgame') return null;
  const { strength, defense, speed, dexterity } = spy;
  if (strength == null || defense == null || speed == null || dexterity == null) {
    return null;
  }
  const prefix = spy.bucket === 'estimate' ? '~' : '';
  return {
    str: prefix + fmtBig(strength),
    def: prefix + fmtBig(defense),
    spd: prefix + fmtBig(speed),
    dex: prefix + fmtBig(dexterity),
  };
}

// Hardcoded fallback when API omits the caption field on an endgame payload.
// Keep in sync with `api/services/spy_display.py` (Phase 1, Plan §C trigger).
const ENDGAME_FALLBACK_CAPTION =
  'Endgame player — stats T-scale, no estimate available. Get a spy.';

export function bucketCaption(spy: SpyEstimate): string {
  if (spy.bucket === 'endgame') {
    // Server-supplied caption is authoritative; fall back to the hardcoded
    // string when the field is missing (older backend / payload drift).
    const fromApi = typeof spy.caption === 'string' ? spy.caption.trim() : '';
    return fromApi || ENDGAME_FALLBACK_CAPTION;
  }
  if (spy.bucket === 'rough_guess') {
    const bits: string[] = [];
    if (spy.level) bits.push(`level ${spy.level}`);
    if (spy.heuristic_confidence) bits.push(`${spy.heuristic_confidence} confidence`);
    const tail = bits.length ? ` (${bits.join(', ')})` : '';
    return `Rough estimate from public stats${tail}.`;
  }
  const age = spy.age_days != null ? `${spy.age_days} days old` : 'unknown age';
  return `${age} · ${spy.source}`;
}
