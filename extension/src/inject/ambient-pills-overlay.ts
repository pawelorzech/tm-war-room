// Ambient pills — sprinkle TM Hub intel on any Torn page where players appear.
//
// On /messages.php, /forums.php, /friendlist.php, /searchresults.php (any page
// without a dedicated overlay), every profile XID anchor we have data on gets
// pills: 🎯 target tag, 🚫 OFF-LIMITS, 👁 stakeout, spy total + age.
//
// Quiet by design: no row tints, no decoration on players we know nothing
// about — keeps the page from looking like a Christmas tree. Only pills.

import {
  ApiError,
  fetchKnownSpies,
  fetchOffLimits,
  fetchTargets,
  fetchStakeouts,
} from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { decorateRows } from '../lib/row-decorator';
import type { SpyEstimate, WarOffLimits, Target, Stakeout } from '../types';
import { escapeHtml, formatTotal } from '../lib/format';

interface AmbientRow {
  off_limits: WarOffLimits | null;
  target: Target | null;
  stakeout: Stakeout | null;
  spy: SpyEstimate | null;
}

const TTL_MS = 60_000;
type Cache<T> = { ts: number; data: T } | null;

let spiesCache: Cache<Map<number, SpyEstimate>> = null;
const offLimitsCache = new Map<number, { ts: number; data: Map<number, WarOffLimits> }>();
let targetsCache: Cache<Map<number, Target>> = null;
let stakeoutsCache: Cache<Map<number, Stakeout>> = null;

async function getKnownSpies(): Promise<Map<number, SpyEstimate>> {
  if (spiesCache && Date.now() - spiesCache.ts < TTL_MS) return spiesCache.data;
  const auth = getAuth();
  if (!auth) return new Map();
  try {
    const resp = await fetchKnownSpies(auth);
    const map = new Map<number, SpyEstimate>();
    for (const e of resp.estimates) map.set(e.player_id, e);
    spiesCache = { ts: Date.now(), data: map };
    return map;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) clearAuth();
    return new Map();
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

async function getStakeouts(): Promise<Map<number, Stakeout>> {
  if (stakeoutsCache && Date.now() - stakeoutsCache.ts < TTL_MS) return stakeoutsCache.data;
  const auth = getAuth();
  if (!auth) return new Map();
  try {
    const resp = await fetchStakeouts(auth);
    const map = new Map<number, Stakeout>();
    for (const s of resp.stakeouts) map.set(s.player_id, s);
    stakeoutsCache = { ts: Date.now(), data: map };
    return map;
  } catch {
    return new Map();
  }
}

async function buildMap(warId: number | null): Promise<Map<number, AmbientRow>> {
  const [spies, off, targets, stakeouts] = await Promise.all([
    getKnownSpies(),
    warId ? getOffLimits(warId) : Promise.resolve(new Map<number, WarOffLimits>()),
    getTargets(),
    getStakeouts(),
  ]);

  const known = new Set<number>([
    ...spies.keys(),
    ...off.keys(),
    ...targets.keys(),
    ...stakeouts.keys(),
  ]);
  const out = new Map<number, AmbientRow>();
  for (const pid of known) {
    out.set(pid, {
      off_limits: off.get(pid) ?? null,
      target: targets.get(pid) ?? null,
      stakeout: stakeouts.get(pid) ?? null,
      spy: spies.get(pid) ?? null,
    });
  }
  return out;
}

const STYLES = `
  [data-tm-ambient-badge] {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    padding: 2px 6px;
    margin: 2px 4px 2px 4px;
    font-size: 10px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    border-radius: 8px;
    background: rgba(22, 27, 34, 0.85);
    border: 1px solid rgba(255,255,255,0.1);
    color: #c9d1d9;
    white-space: nowrap;
    vertical-align: middle;
  }
  [data-tm-ambient-badge] .pill {
    padding: 1px 5px;
    border-radius: 6px;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  [data-tm-ambient-badge] .pill-offlimits {
    background: rgba(248,81,73,0.22);
    color: #f85149;
  }
  [data-tm-ambient-badge] .pill-target {
    background: rgba(139,92,246,0.18);
    color: #a78bfa;
  }
  [data-tm-ambient-badge] .pill-stakeout {
    background: rgba(96,165,250,0.18);
    color: #60a5fa;
  }
  [data-tm-ambient-badge] .pill-spy {
    background: rgba(63,185,80,0.16);
    color: #3fb950;
  }
  [data-tm-ambient-badge] .pill-spy-stale {
    background: rgba(210,153,34,0.16);
    color: #d29922;
  }
`;



export async function applyAmbientPillsOverlay(opts: { warId: number | null }): Promise<void> {
  await decorateRows<AmbientRow>({
    featureId: 'ambient',
    buildMap: () => buildMap(opts.warId),
    styles: STYLES,
    stateKey: (d) =>
      [
        d.off_limits ? '1' : '0',
        d.target ? (d.target.tag ?? '1') : '0',
        d.stakeout ? '1' : '0',
        d.spy ? `${d.spy.total}|${d.spy.age_days}` : '0',
      ].join('|'),
    render: ({ data, appendBadge }) => {
      const pills: string[] = [];

      if (data.off_limits) {
        pills.push(`<span class="pill pill-offlimits">🚫 OFF-LIMITS</span>`);
      }
      if (data.target) {
        const tag = data.target.tag ? ` ${escapeHtml(data.target.tag)}` : '';
        pills.push(`<span class="pill pill-target">🎯${tag}</span>`);
      }
      if (data.stakeout) {
        pills.push(`<span class="pill pill-stakeout">👁</span>`);
      }
      if (data.spy && data.spy.total > 0) {
        const stale = data.spy.age_days >= 14;
        const cls = stale ? 'pill-spy-stale' : 'pill-spy';
        pills.push(
          `<span class="pill ${cls}">${escapeHtml(formatTotal(data.spy.total))}·${data.spy.age_days}d</span>`,
        );
      }

      if (pills.length === 0) return;

      const badge = document.createElement('span');
      badge.innerHTML = pills.join('');
      appendBadge(badge);
    },
  });
}
