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
} from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { decorateRows } from '../lib/row-decorator';
import type { WarOffLimits, Target } from '../types';
import { escapeHtml } from '../lib/format';
import { pillBase } from '../lib/card-styles';

interface JailRow {
  tm_mate: boolean;
  war_enemy: boolean;
  off_limits: WarOffLimits | null;
  target: Target | null;
}

const TTL_MS = 60_000;
type Cache<T> = { ts: number; data: T } | null;

let keysCache: Cache<Set<number>> = null;
let enemyCache: Cache<Set<number>> = null;
const offLimitsCache = new Map<number, { ts: number; data: Map<number, WarOffLimits> }>();
let targetsCache: Cache<Map<number, Target>> = null;

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

async function buildMap(warId: number | null): Promise<Map<number, JailRow>> {
  const [mates, enemies, off, targets] = await Promise.all([
    getKeys(),
    getEnemy(),
    warId ? getOffLimits(warId) : Promise.resolve(new Map<number, WarOffLimits>()),
    getTargets(),
  ]);

  // Decorate only players with at least one signal. Jail list runs ~100 rows;
  // we don't paint randoms.
  const out = new Map<number, JailRow>();
  const known = new Set<number>([...mates, ...enemies, ...off.keys(), ...targets.keys()]);
  for (const pid of known) {
    out.set(pid, {
      tm_mate: mates.has(pid),
      war_enemy: enemies.has(pid),
      off_limits: off.get(pid) ?? null,
      target: targets.get(pid) ?? null,
    });
  }
  return out;
}

const STYLES = pillBase('jail') + `
  [data-tm-jail-badge] .pill-mate {
    background: rgba(63,185,80,0.18);
    color: #3fb950;
  }
  [data-tm-jail-badge] .pill-enemy {
    background: rgba(248,81,73,0.20);
    color: #f85149;
  }
  [data-tm-jail-badge] .pill-offlimits {
    background: rgba(248,81,73,0.22);
    color: #f85149;
  }
  [data-tm-jail-badge] .pill-target {
    background: rgba(139,92,246,0.18);
    color: #a78bfa;
  }
`;


export async function applyJailOverlay(opts: { warId: number | null }): Promise<void> {
  await decorateRows<JailRow>({
    featureId: 'jail',
    buildMap: () => buildMap(opts.warId),
    styles: STYLES,
    stateKey: (d) =>
      [
        d.tm_mate ? '1' : '0',
        d.war_enemy ? '1' : '0',
        d.off_limits ? '1' : '0',
        d.target ? (d.target.tag ?? '1') : '0',
      ].join('|'),
    render: ({ row, data, appendBadge }) => {
      if (data.tm_mate) {
        row.style.backgroundColor = 'rgba(63,185,80,0.10)';
      } else if (data.war_enemy) {
        row.style.backgroundColor = 'rgba(248,81,73,0.10)';
      }
      row.style.transition = 'background-color 0.2s ease-out';

      const pills: string[] = [];
      if (data.tm_mate) pills.push(`<span class="pill pill-mate">TM mate</span>`);
      if (data.war_enemy) pills.push(`<span class="pill pill-enemy">war enemy</span>`);
      if (data.off_limits) pills.push(`<span class="pill pill-offlimits">🚫 OFF-LIMITS</span>`);
      if (data.target) {
        const tag = data.target.tag ? ` ${escapeHtml(data.target.tag)}` : '';
        pills.push(`<span class="pill pill-target">🎯 target${tag}</span>`);
      }
      if (pills.length === 0) return;

      const badge = document.createElement('span');
      badge.innerHTML = pills.join('');
      appendBadge(badge);
    },
  });
}
