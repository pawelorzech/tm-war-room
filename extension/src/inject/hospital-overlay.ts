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
  fetchKnownSpies,
  getCachedFeatureFlags,
} from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { decorateRows } from '../lib/row-decorator';
import type { WarOffLimits, Target } from '../types';
import type { SpyEstimate as SpyEstimateDisplay, Bucket } from '../lib/spy-display';
import { bucketStyle, formatTotalRange, bucketCaption } from '../lib/spy-display';
import { escapeHtml } from '../lib/format';
import { pillBase } from '../lib/card-styles';
import { renderClaimButton } from './claim-button';

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
let spyCache: Cache<Map<number, SpyEstimateDisplay>> = null;

/** Test-only — reset all module-level caches between unit tests. */
export function _resetHospitalCacheForTests(): void {
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

const STYLES = pillBase('hospital') + `
  [data-tm-hospital-badge] .pill-mate {
    background: rgba(63,185,80,0.18);
    color: #3fb950;
  }
  [data-tm-hospital-badge] .pill-enemy {
    background: rgba(248,81,73,0.20);
    color: #f85149;
  }
  [data-tm-hospital-badge] .pill-offlimits {
    background: rgba(248,81,73,0.22);
    color: #f85149;
  }
  [data-tm-hospital-badge] .pill-target {
    background: rgba(139,92,246,0.18);
    color: #a78bfa;
  }
  [data-tm-hospital-badge] .pill-spy {
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(0,0,0,0.25);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  [data-tm-hospital-badge] .pill-spy.tm-bucket-verified    { color: #56d364; border-color: #3fb950; }
  [data-tm-hospital-badge] .pill-spy.tm-bucket-estimate    { color: #e8b339; border-color: #d29922; }
  [data-tm-hospital-badge] .pill-spy.tm-bucket-rough_guess { color: #f5a05a; border-color: #f5a05a; }
  [data-tm-hospital-badge] .pill-spy.tm-bucket-endgame     { color: #ff7b72; border-color: #b62324; background: rgba(182,35,36,0.18); }
  [data-tm-hospital-badge] .pill-spy.tm-off-limits {
    text-decoration: line-through;
    border-color: #f85149;
    color: #f85149;
    opacity: 0.85;
  }
  [data-tm-hospital-badge] .pill-spy .spy-bucket-label {
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 9px;
    font-weight: 700;
  }
  /* Mobile: drop the caption text below 599px — chip + range stay visible. */
  @media (max-width: 599px) {
    [data-tm-hospital-badge] .pill-spy .spy-caption { display: none; }
  }
`;

function buildSpyPill(spy: SpyEstimateDisplay, offLimits: WarOffLimits | null): HTMLElement {
  const pill = document.createElement('span');
  pill.classList.add('pill', 'pill-spy');
  const bucket: Bucket = spy.bucket ?? 'rough_guess';
  pill.classList.add(`tm-bucket-${bucket}`);
  const style = bucketStyle(bucket);
  const rangeText = formatTotalRange(spy.total, spy.total_range, bucket);
  const caption = bucketCaption(spy);
  const range = rangeText ? `<span class="spy-range">${escapeHtml(rangeText)}</span>` : '';
  const cap = caption ? `<span class="spy-caption">${escapeHtml(caption)}</span>` : '';
  pill.innerHTML = `<span class="spy-bucket-label">${escapeHtml(style.badgeText)}</span> ${range} ${cap}`.trim();
  if (offLimits) {
    pill.classList.add('tm-off-limits');
    pill.setAttribute(
      'title',
      `WAR OFF-LIMITS — ${offLimits.reason || 'medded/dipped'} (flagged by ${offLimits.set_by_name || 'faction'})`,
    );
  } else {
    pill.setAttribute('title', caption);
  }
  return pill;
}


export async function applyHospitalOverlay(opts: { warId: number | null }): Promise<void> {
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
      if (data.tm_mate) {
        row.style.backgroundColor = 'rgba(63,185,80,0.10)';
      } else if (data.war_enemy) {
        row.style.backgroundColor = 'rgba(248,81,73,0.10)';
      }
      row.style.transition = 'background-color 0.2s ease-out';

      const badge = document.createElement('span');
      if (data.tm_mate) badge.insertAdjacentHTML('beforeend', `<span class="pill pill-mate">TM mate</span>`);
      if (data.war_enemy) badge.insertAdjacentHTML('beforeend', `<span class="pill pill-enemy">war enemy</span>`);
      if (data.off_limits) badge.insertAdjacentHTML('beforeend', `<span class="pill pill-offlimits">🚫 OFF-LIMITS</span>`);
      if (data.target) {
        const tag = data.target.tag ? ` ${escapeHtml(data.target.tag)}` : '';
        badge.insertAdjacentHTML('beforeend', `<span class="pill pill-target">🎯 target${tag}</span>`);
      }
      if (data.spy) {
        badge.appendChild(buildSpyPill(data.spy, data.off_limits));
      }
      if (badge.children.length > 0) appendBadge(badge);

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
