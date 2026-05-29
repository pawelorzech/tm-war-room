// Hospital list intel overlay.
//
// On /hospitalview.php (and /page.php?sid=hospitalView) we mark every row in
// the hospital list with TM Hub context so the user can scan the page and
// instantly see: who is a TM faction mate (don't attack), who is a current
// war enemy (consider attacking), who is OFF-LIMITS (don't attack — medded
// out / dip), and who is a saved target.
//
// Mechanics shared via lib/row-decorator.ts.

import {
  ApiError,
  fetchKeys,
  fetchEnemy,
  fetchOffLimits,
  fetchTargets,
  fetchStakeouts,
  fetchKnownSpies,
  getCachedFeatureFlags,
} from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { decorateRows } from '../lib/row-decorator';
import type { WarOffLimits, Target } from '../types';
import type { SpyEstimate as SpyEstimateDisplay } from '../lib/spy-display';
import { buildSpyChip, pickStripeRole, stripeBoxShadow } from '../lib/spy-chip';
import { renderClaimButton } from './claim-button';
import { detectReleased } from './hospital-release';
import { showToast } from '../lib/notifications';
import { escapeHtml } from '../lib/format';

interface HospitalRow {
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
let stakeoutsCache: Cache<Set<number>> = null;
let spyCache: Cache<Map<number, SpyEstimateDisplay>> = null;

// Hospital-out alert state: the watched players we saw hospitalized on the
// previous overlay run. Compared against the current list each tick so we can
// fire a one-click attack toast the moment a target/stakeout leaves hospital.
let prevWatchedHospitalized = new Set<number>();

/** Test-only — reset all module-level caches between unit tests. */
export function _resetHospitalCacheForTests(): void {
  keysCache = null;
  enemyCache = null;
  offLimitsCache.clear();
  targetsCache = null;
  stakeoutsCache = null;
  spyCache = null;
}

/** Test-only — reset the hospital-out release tracking state. */
export function _resetHospitalReleaseForTests(): void {
  prevWatchedHospitalized = new Set<number>();
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

async function getStakeouts(): Promise<Set<number>> {
  if (stakeoutsCache && Date.now() - stakeoutsCache.ts < TTL_MS) return stakeoutsCache.data;
  const auth = getAuth();
  if (!auth) return new Set();
  try {
    const resp = await fetchStakeouts(auth);
    const set = new Set<number>();
    for (const s of resp.stakeouts) set.add(s.player_id);
    stakeoutsCache = { ts: Date.now(), data: set };
    return set;
  } catch {
    return new Set();
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

async function buildMap(warId: number | null): Promise<Map<number, HospitalRow>> {
  const [mates, enemies, off, targets, spies] = await Promise.all([
    getKeys(),
    getEnemy(),
    warId ? getOffLimits(warId) : Promise.resolve(new Map<number, WarOffLimits>()),
    getTargets(),
    getKnownSpies(),
  ]);

  // Only decorate players that have at least one signal. Hospital lists
  // can be ~100 rows; we don't want to attach badges to randoms.
  const out = new Map<number, HospitalRow>();
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

// Visual contract (replaces the loud multi-pill chrome shipped through v0.39):
//   1. Role stripe — 4px inset boxShadow on the row's left edge. Single colour
//      per row picked by `pickStripeRole` (mate > off-limits > enemy > target).
//      Uses boxShadow rather than border-left so the row content doesn't shift.
//   2. Compact spy chip — appended after the player name link ONLY when we have
//      a spy estimate. The chip text is short ("4.78B verified"), the full
//      attribution (source, freshness, off-limits reason) lives in the title
//      tooltip. Style scoped to `.spy-chip` so hospital + jail share CSS.
//
// We dropped the role pills (TM mate / war enemy / OFF-LIMITS / 🎯 target) and
// the full-row background tint that v0.39 painted: the stripe already carries
// the role at-a-glance, and the tinted background dominated the page.
const STYLES = `
  .spy-chip[data-tm-hospital-badge] {
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
  .spy-chip[data-tm-hospital-badge].tm-bucket-verified    { color: #56d364; border-color: #3fb950; }
  .spy-chip[data-tm-hospital-badge].tm-bucket-estimate    { color: #e8b339; border-color: #d29922; }
  .spy-chip[data-tm-hospital-badge].tm-bucket-rough_guess { color: #f5a05a; border-color: #f5a05a; }
  .spy-chip[data-tm-hospital-badge].tm-bucket-endgame     { color: #ff7b72; border-color: #b62324; background: rgba(182,35,36,0.18); }
  .spy-chip[data-tm-hospital-badge].tm-off-limits {
    text-decoration: line-through;
    border-color: #f85149;
    color: #f85149;
    opacity: 0.85;
  }
`;


// Player ids currently in the hospital list DOM. Scoped to #mainContainer and
// to actual list rows (LI/TR or hospital-class ancestor) — the same anti-leak
// rule row-decorator uses — so the viewer's own profile anchor in the left
// "Information" sidebar is never counted as hospitalized.
function collectHospitalizedIds(): Set<number> {
  const scope = document.getElementById('mainContainer') ?? document;
  const ids = new Set<number>();
  scope.querySelectorAll<HTMLAnchorElement>('a[href*="XID="]').forEach((anchor) => {
    const m = anchor.href.match(/XID=(\d+)/);
    if (!m) return;
    // Walk up to a list-row container; skip anchors that aren't inside one.
    let el: HTMLElement | null = anchor;
    for (let i = 0; el && i < 6; i += 1) {
      const cls = typeof el.className === 'string' ? el.className : '';
      if (el.tagName === 'LI' || el.tagName === 'TR' || /hospital|jail/i.test(cls)) {
        ids.add(parseInt(m[1], 10));
        return;
      }
      el = el.parentElement;
    }
  });
  return ids;
}

// Toast a one-click attack link for a watched player who just left hospital.
// Uses the house toast: a titleHtml anchor with target=_top so the click
// navigates the top frame straight into the attack loader (the toast's own
// click handler defers to <a> children, giving true one-click behaviour).
function toastReleased(id: number): void {
  const url = `https://www.torn.com/loader.php?sid=attack&user2ID=${id}`;
  showToast({
    id: `hosp-release-${id}`,
    title: 'Target out of hospital',
    titleHtml: `<a href="${escapeHtml(url)}" target="_top">⚔️ Mug ${escapeHtml(String(id))} — out of hospital</a>`,
    body: 'A watched player just left the hospital. Be first to mug them.',
    icon: '🏥',
    tone: 'mention',
    url,
  });
}

// Compute watched (targets ∪ stakeouts), diff against the previous tick, and
// toast every watched player who just left the hospital. Kept separate from
// the decorateRows pipeline so it can't disturb the existing visual contract.
async function runHospitalReleaseAlert(): Promise<void> {
  const [targets, stakeouts] = await Promise.all([getTargets(), getStakeouts()]);
  const watched = new Set<number>([...targets.keys(), ...stakeouts]);

  const nowHospitalized = collectHospitalizedIds();
  const released = detectReleased(prevWatchedHospitalized, nowHospitalized, watched);
  for (const id of released) toastReleased(id);

  // Only track watched players' hospitalization going forward.
  const nextPrev = new Set<number>();
  for (const id of nowHospitalized) {
    if (watched.has(id)) nextPrev.add(id);
  }
  prevWatchedHospitalized = nextPrev;
}

export async function applyHospitalOverlay(opts: { warId: number | null }): Promise<void> {
  await runHospitalReleaseAlert();

  await decorateRows<HospitalRow>({
    featureId: 'hospital',
    buildMap: () => buildMap(opts.warId),
    styles: STYLES,
    // Spy bucket + total_range fingerprint widens the stateKey so async spy
    // arrivals re-paint correctly.
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
    render: ({ row, data, anchor, appendBadge }) => {
      const stripe = stripeBoxShadow(pickStripeRole(data));
      if (stripe) row.style.boxShadow = stripe;

      if (data.spy) {
        appendBadge(buildSpyChip(data.spy, data.off_limits));
      }

      // Hit-claim button: only paint for war enemies that aren't off-limits.
      // Off-limits already telegraphs "don't shoot", and claiming a faction
      // mate makes no sense. No-op when hit_calling flag is off.
      if (
        getCachedFeatureFlags().hit_calling &&
        data.war_enemy &&
        !data.off_limits &&
        !data.tm_mate
      ) {
        const m = anchor.href.match(/XID=(\d+)/);
        const pid = m ? parseInt(m[1], 10) : 0;
        if (pid > 0) {
          const slot = document.createElement('span');
          slot.setAttribute('data-tm-hospital-claim-slot', String(pid));
          anchor.insertAdjacentElement('afterend', slot);
          renderClaimButton({
            host: slot,
            targetId: pid,
            targetName: anchor.textContent?.trim() || String(pid),
          });
        }
      }
    },
  });
}
