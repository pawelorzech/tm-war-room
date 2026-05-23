// Jail list intel overlay.
//
// On /jailview.php (and /page.php?sid=jailView, /loader.php?sid=jail) we mark
// every row in the jail list with TM Hub context so the user can scan the page
// and instantly see: TM faction mate (don't bust unless asked), current war
// enemy (good bust candidate to keep them in jail), OFF-LIMITS (don't touch),
// and saved targets (bust opportunity).
//
// Same data signals as hospital-overlay — kept as a parallel module rather
// than refactored into one shared overlay because each page has its own
// per-row class set the helper needs to detect, and folding both kinds into a
// single overlay would couple their data lifetimes too tightly. Cache structs
// are module-local so each list page keeps its own freshness.

import {
  ApiError,
  fetchKeys,
  fetchEnemy,
  fetchOffLimits,
  fetchTargets,
  fetchKnownSpies,
} from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { decorateRows } from '../lib/row-decorator';
import type { WarOffLimits, Target } from '../types';
import type { SpyEstimate as SpyEstimateDisplay } from '../lib/spy-display';
import { buildSpyChip, pickStripeRole, stripeBoxShadow } from '../lib/spy-chip';

interface JailRow {
  tm_mate: boolean;
  war_enemy: boolean;
  off_limits: WarOffLimits | null;
  target: Target | null;
  spy: SpyEstimateDisplay | null;
}

const TTL_MS = 60_000;
type Cache<T> = { ts: number; data: T } | null;

let keysCache: Cache<Set<number>> = null;
let enemyCache: Cache<Set<number>> = null;
const offLimitsCache = new Map<number, { ts: number; data: Map<number, WarOffLimits> }>();
let targetsCache: Cache<Map<number, Target>> = null;
let spyCache: Cache<Map<number, SpyEstimateDisplay>> = null;

/** Test-only — reset all module-level caches between unit tests. */
export function _resetJailCacheForTests(): void {
  keysCache = null;
  enemyCache = null;
  offLimitsCache.clear();
  targetsCache = null;
  spyCache = null;
}

async function getKeys(): Promise<Set<number>> {
  if (keysCache && Date.now() - keysCache.ts < TTL_MS) return keysCache.data;
  const auth = getAuth();
  if (!auth) return new Set();
  try {
    const resp = await fetchKeys(auth);
    const set = new Set<number>();
    for (const k of resp.keys) set.add(k.player_id);
    keysCache = { ts: Date.now(), data: set };
    return set;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) clearAuth();
    return new Set();
  }
}

async function getEnemy(): Promise<Set<number>> {
  if (enemyCache && Date.now() - enemyCache.ts < TTL_MS) return enemyCache.data;
  const auth = getAuth();
  if (!auth) return new Set();
  try {
    const resp = await fetchEnemy(auth);
    const set = new Set<number>();
    for (const m of resp.members) set.add(m.id);
    enemyCache = { ts: Date.now(), data: set };
    return set;
  } catch {
    return new Set();
  }
}

async function getOffLimits(warId: number): Promise<Map<number, WarOffLimits>> {
  const cached = offLimitsCache.get(warId);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.data;
  const auth = getAuth();
  if (!auth) return new Map();
  try {
    const resp = await fetchOffLimits(auth, warId);
    const map = new Map<number, WarOffLimits>();
    for (const e of resp.entries) map.set(e.player_id, e);
    offLimitsCache.set(warId, { ts: Date.now(), data: map });
    return map;
  } catch {
    return new Map();
  }
}

async function getTargets(): Promise<Map<number, Target>> {
  if (targetsCache && Date.now() - targetsCache.ts < TTL_MS) return targetsCache.data;
  const auth = getAuth();
  if (!auth) return new Map();
  try {
    const resp = await fetchTargets(auth);
    const map = new Map<number, Target>();
    for (const t of resp.targets) map.set(t.player_id, t);
    targetsCache = { ts: Date.now(), data: map };
    return map;
  } catch {
    return new Map();
  }
}

async function getKnownSpies(): Promise<Map<number, SpyEstimateDisplay>> {
  if (spyCache && Date.now() - spyCache.ts < TTL_MS) return spyCache.data;
  const auth = getAuth();
  if (!auth) return new Map();
  try {
    const resp = await fetchKnownSpies(auth);
    const map = new Map<number, SpyEstimateDisplay>();
    for (const e of resp.estimates as unknown as SpyEstimateDisplay[]) {
      map.set(e.player_id, e);
    }
    spyCache = { ts: Date.now(), data: map };
    return map;
  } catch {
    return new Map();
  }
}

async function buildMap(warId: number | null): Promise<Map<number, JailRow>> {
  const [mates, enemies, off, targets, spies] = await Promise.all([
    getKeys(),
    getEnemy(),
    warId ? getOffLimits(warId) : Promise.resolve(new Map<number, WarOffLimits>()),
    getTargets(),
    getKnownSpies(),
  ]);

  // Decorate only players with at least one signal. Jail list runs ~100 rows;
  // we don't paint randoms.
  const out = new Map<number, JailRow>();
  const known = new Set<number>([
    ...mates,
    ...enemies,
    ...off.keys(),
    ...targets.keys(),
    ...spies.keys(),
  ]);
  for (const pid of known) {
    out.set(pid, {
      tm_mate: mates.has(pid),
      war_enemy: enemies.has(pid),
      off_limits: off.get(pid) ?? null,
      target: targets.get(pid) ?? null,
      spy: spies.get(pid) ?? null,
    });
  }
  return out;
}

// See hospital-overlay.ts for the visual contract — jail mirrors hospital so
// players see the same role stripe + compact spy chip across both list pages.
const STYLES = `
  .spy-chip[data-tm-jail-badge] {
    display: inline-flex;
    align-items: center;
    margin-left: 6px;
    padding: 1px 6px;
    border-radius: 8px;
    font: 600 10px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    letter-spacing: 0.02em;
    text-transform: lowercase;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(0,0,0,0.25);
    color: #c9d1d9;
    white-space: nowrap;
    vertical-align: middle;
  }
  .spy-chip[data-tm-jail-badge].tm-bucket-verified    { color: #56d364; border-color: #3fb950; }
  .spy-chip[data-tm-jail-badge].tm-bucket-estimate    { color: #e8b339; border-color: #d29922; }
  .spy-chip[data-tm-jail-badge].tm-bucket-rough_guess { color: #f5a05a; border-color: #f5a05a; }
  .spy-chip[data-tm-jail-badge].tm-bucket-endgame     { color: #ff7b72; border-color: #b62324; background: rgba(182,35,36,0.18); }
  .spy-chip[data-tm-jail-badge].tm-off-limits {
    text-decoration: line-through;
    border-color: #f85149;
    color: #f85149;
    opacity: 0.85;
  }
`;


export async function applyJailOverlay(opts: { warId: number | null }): Promise<void> {
  await decorateRows<JailRow>({
    featureId: 'jail',
    buildMap: () => buildMap(opts.warId),
    styles: STYLES,
    anchorSelector: 'a[href*="XID="]',
    stateKey: (d) =>
      [
        d.tm_mate ? '1' : '0',
        d.war_enemy ? '1' : '0',
        d.off_limits ? '1' : '0',
        d.target ? (d.target.tag ?? '1') : '0',
        d.spy?.bucket ?? '0',
        d.spy?.total_range?.[0] ?? '',
        d.spy?.total_range?.[1] ?? '',
        d.spy?.range_width_pct ?? '',
      ].join('|'),
    render: ({ row, data, appendBadge }) => {
      const stripe = stripeBoxShadow(pickStripeRole(data));
      if (stripe) row.style.boxShadow = stripe;

      if (data.spy) {
        appendBadge(buildSpyChip(data.spy, data.off_limits));
      }
    },
  });
}
