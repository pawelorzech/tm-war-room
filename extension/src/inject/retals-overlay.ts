// Retal queue intel overlay.
//
// On /factions.php?step=retals we mark every retal row with TM Hub
// context: OFF-LIMITS flag (don't go for that retal — they're medded
// out or in dip), saved target tag, and a "spy known: 12.4M total"
// pill when we have a stat estimate. This is the v1 simple version —
// no per-attacker threat scoring yet; just markers + raw spy total.

import {
  ApiError,
  fetchKnownSpies,
  fetchOffLimits,
  fetchTargets,
} from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { decorateRows } from '../lib/row-decorator';
import type { SpyEstimate, WarOffLimits, Target } from '../types';

interface RetalRow {
  off_limits: WarOffLimits | null;
  target: Target | null;
  spy: SpyEstimate | null;
}

const TTL_MS = 60_000;
type Cache<T> = { ts: number; data: T } | null;

let spiesCache: Cache<Map<number, SpyEstimate>> = null;
const offLimitsCache = new Map<number, { ts: number; data: Map<number, WarOffLimits> }>();
let targetsCache: Cache<Map<number, Target>> = null;

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

async function buildMap(warId: number | null): Promise<Map<number, RetalRow>> {
  const [spies, off, targets] = await Promise.all([
    getKnownSpies(),
    warId ? getOffLimits(warId) : Promise.resolve(new Map<number, WarOffLimits>()),
    getTargets(),
  ]);

  // Only decorate players we have at least one signal for — keeps the
  // page quiet when most attackers are randoms we know nothing about.
  const out = new Map<number, RetalRow>();
  const known = new Set<number>([...spies.keys(), ...off.keys(), ...targets.keys()]);
  for (const pid of known) {
    out.set(pid, {
      off_limits: off.get(pid) ?? null,
      target: targets.get(pid) ?? null,
      spy: spies.get(pid) ?? null,
    });
  }
  return out;
}

const STYLES = `
  [data-tm-retals-badge] {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    padding: 2px 6px;
    margin: 4px 0;
    font-size: 11px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    border-radius: 10px;
    background: rgba(22, 27, 34, 0.85);
    border: 1px solid rgba(255,255,255,0.1);
    color: #c9d1d9;
    white-space: nowrap;
  }
  [data-tm-retals-badge] .pill {
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  [data-tm-retals-badge] .pill-offlimits {
    background: rgba(248,81,73,0.22);
    color: #f85149;
  }
  [data-tm-retals-badge] .pill-target {
    background: rgba(139,92,246,0.18);
    color: #a78bfa;
  }
  [data-tm-retals-badge] .pill-spy {
    background: rgba(63,185,80,0.16);
    color: #3fb950;
  }
  [data-tm-retals-badge] .pill-spy-stale {
    background: rgba(210,153,34,0.16);
    color: #d29922;
  }
`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTotal(total: number): string {
  if (total >= 1_000_000_000) return `${(total / 1_000_000_000).toFixed(2)}B`;
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M`;
  if (total >= 1_000) return `${(total / 1_000).toFixed(0)}K`;
  return String(total);
}

export async function applyRetalsOverlay(opts: { warId: number | null }): Promise<void> {
  await decorateRows<RetalRow>({
    featureId: 'retals',
    buildMap: () => buildMap(opts.warId),
    styles: STYLES,
    stateKey: (d) =>
      [
        d.off_limits ? '1' : '0',
        d.target ? (d.target.tag ?? '1') : '0',
        d.spy ? `${d.spy.total}|${d.spy.age_days}` : '0',
      ].join('|'),
    render: ({ data, appendBadge }) => {
      const pills: string[] = [];

      if (data.off_limits) {
        pills.push(`<span class="pill pill-offlimits">🚫 OFF-LIMITS</span>`);
      }

      if (data.target) {
        const tag = data.target.tag ? ` ${escapeHtml(data.target.tag)}` : '';
        pills.push(`<span class="pill pill-target">🎯 target${tag}</span>`);
      }

      if (data.spy && data.spy.total > 0) {
        const stale = data.spy.age_days >= 14;
        const cls = stale ? 'pill-spy-stale' : 'pill-spy';
        const ageLabel = data.spy.age_days < 7 ? `${data.spy.age_days}d` : `${data.spy.age_days}d stale`;
        pills.push(
          `<span class="pill ${cls}">spy ${escapeHtml(formatTotal(data.spy.total))} · ${escapeHtml(ageLabel)}</span>`,
        );
      }

      if (pills.length === 0) return;

      const badge = document.createElement('span');
      badge.innerHTML = pills.join('');
      appendBadge(badge);
    },
  });
}
