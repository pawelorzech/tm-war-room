// TM Hub intel card on enemy profile + attack pages.
//
// Combines three pieces of TM Hub data that help you decide whether to
// attack (or save) a player:
//   1. Spy estimate (str/def/spd/dex + total + how stale + source)
//   2. Your personal target list status (tag, difficulty, notes)
//   3. Faction-shared stakeout flag (who's watching this player)
//
// Each subsection is independent — missing data just hides that row,
// the card still renders with whatever's available. Empty (no intel at
// all) = no card.

import {
  ApiError,
  fetchSpyEstimate,
  fetchTargets,
  fetchStakeouts,
} from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { PROFILE_ANCHOR_SELECTORS } from '../lib/torn-pages';
import { applyBaseStyles, ensureHost } from '../lib/shadow';
import type { SpyEstimate, Stakeout, Target } from '../types';

const HUB_ORIGIN: string =
  (typeof process !== 'undefined' && process.env && (process.env as Record<string, string>).TM_HUB_ORIGIN) ||
  'https://hub.tri.ovh';

const INTEL_TTL_MS = 10 * 60_000; // 10 min cache per player

interface CachedIntel {
  ts: number;
  spy: SpyEstimate | null;
  target: Target | null;
  stakeout: Stakeout | null;
}

const _intelCache = new Map<number, CachedIntel>();
let _targetsCache: { ts: number; map: Map<number, Target> } | null = null;
let _stakeoutsCache: { ts: number; map: Map<number, Stakeout> } | null = null;
const LIST_TTL_MS = 5 * 60_000;

async function getTargetsMap(): Promise<Map<number, Target>> {
  if (_targetsCache && Date.now() - _targetsCache.ts < LIST_TTL_MS) {
    return _targetsCache.map;
  }
  const auth = getAuth();
  if (!auth) return new Map();
  try {
    const r = await fetchTargets(auth);
    const map = new Map<number, Target>();
    for (const t of r.targets) map.set(t.player_id, t);
    _targetsCache = { ts: Date.now(), map };
    return map;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) clearAuth();
    return new Map();
  }
}

async function getStakeoutsMap(): Promise<Map<number, Stakeout>> {
  if (_stakeoutsCache && Date.now() - _stakeoutsCache.ts < LIST_TTL_MS) {
    return _stakeoutsCache.map;
  }
  const auth = getAuth();
  if (!auth) return new Map();
  try {
    const r = await fetchStakeouts(auth);
    const map = new Map<number, Stakeout>();
    for (const s of r.stakeouts) map.set(s.player_id, s);
    _stakeoutsCache = { ts: Date.now(), map };
    return map;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) clearAuth();
    return new Map();
  }
}

async function getIntel(playerId: number): Promise<CachedIntel> {
  const cached = _intelCache.get(playerId);
  if (cached && Date.now() - cached.ts < INTEL_TTL_MS) return cached;

  const auth = getAuth();
  if (!auth) {
    const empty: CachedIntel = { ts: Date.now(), spy: null, target: null, stakeout: null };
    return empty;
  }

  const [targets, stakeouts, spy] = await Promise.all([
    getTargetsMap(),
    getStakeoutsMap(),
    fetchSpyEstimate(auth, playerId).catch((err) => {
      // 404 = no spy data, normal case. Other errors propagate to caller.
      if (err instanceof ApiError && err.status === 404) return null;
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) clearAuth();
      return null;
    }),
  ]);

  const intel: CachedIntel = {
    ts: Date.now(),
    spy,
    target: targets.get(playerId) || null,
    stakeout: stakeouts.get(playerId) || null,
  };
  _intelCache.set(playerId, intel);
  return intel;
}

const HOST_KIND = 'profile-intel';

const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 10px 12px;
    margin: 8px 0;
    color: #c9d1d9;
    font-size: 12px;
    line-height: 1.45;
  }
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .card-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    color: #58a6ff;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .card-link {
    color: #6e7681;
    font-size: 11px;
    text-decoration: none;
  }
  .card-link:hover { color: #58a6ff; text-decoration: underline; }
  .row {
    display: flex;
    gap: 8px;
    padding: 4px 0;
    border-top: 1px solid #21262d;
  }
  .row:first-child { border-top: 0; padding-top: 0; }
  .row .icon { font-size: 14px; flex-shrink: 0; width: 18px; text-align: center; }
  .row .body { flex: 1; min-width: 0; }
  .row .label { color: #f0f6fc; font-weight: 600; }
  .row .meta { color: #8b949e; font-size: 11px; }
  .row .note { color: #c9d1d9; font-style: italic; margin-top: 2px; }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-top: 4px;
  }
  .stat {
    background: #0d1117;
    border-radius: 4px;
    padding: 4px 6px;
    text-align: center;
  }
  .stat-key { color: #6e7681; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat-val { color: #f0f6fc; font-weight: 600; font-size: 12px; }
  .tag-pill {
    display: inline-block;
    background: #21262d;
    color: #c9d1d9;
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 10px;
    margin-right: 4px;
  }
  .tag-pill.difficulty-easy { background: rgba(63,185,80,0.2); color: #3fb950; }
  .tag-pill.difficulty-medium { background: rgba(210,153,34,0.2); color: #d29922; }
  .tag-pill.difficulty-hard { background: rgba(248,81,73,0.2); color: #f85149; }
`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtBigNumber(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(Math.round(n));
}

function fmtAge(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return '1 day old';
  if (days < 30) return `${days} days old`;
  if (days < 60) return `~1 month old`;
  return `${Math.floor(days / 30)} months old`;
}

function spyRow(spy: SpyEstimate): string {
  return `
    <div class="row">
      <span class="icon">⚔️</span>
      <div class="body">
        <div class="label">Spy estimate · ${fmtBigNumber(spy.total)} total</div>
        <div class="meta">${escapeHtml(spy.source)} · ${escapeHtml(spy.confidence)} · ${escapeHtml(fmtAge(spy.age_days))}</div>
        <div class="stat-grid">
          <div class="stat"><div class="stat-key">STR</div><div class="stat-val">${fmtBigNumber(spy.strength)}</div></div>
          <div class="stat"><div class="stat-key">DEF</div><div class="stat-val">${fmtBigNumber(spy.defense)}</div></div>
          <div class="stat"><div class="stat-key">SPD</div><div class="stat-val">${fmtBigNumber(spy.speed)}</div></div>
          <div class="stat"><div class="stat-key">DEX</div><div class="stat-val">${fmtBigNumber(spy.dexterity)}</div></div>
        </div>
      </div>
    </div>
  `;
}

function targetRow(t: Target): string {
  const tag = t.tag ? `<span class="tag-pill">${escapeHtml(t.tag)}</span>` : '';
  const difficulty = t.difficulty
    ? `<span class="tag-pill difficulty-${escapeHtml(t.difficulty)}">${escapeHtml(t.difficulty)}</span>`
    : '';
  const notes = t.notes ? `<div class="note">"${escapeHtml(t.notes)}"</div>` : '';
  return `
    <div class="row">
      <span class="icon">🎯</span>
      <div class="body">
        <div class="label">In your targets list</div>
        <div class="meta">${tag}${difficulty}</div>
        ${notes}
      </div>
    </div>
  `;
}

function stakeoutRow(s: Stakeout): string {
  const who = s.added_by_name ? ` · added by ${escapeHtml(s.added_by_name)}` : '';
  const notes = s.notes ? `<div class="note">"${escapeHtml(s.notes)}"</div>` : '';
  return `
    <div class="row">
      <span class="icon">🔍</span>
      <div class="body">
        <div class="label">On faction stakeout list</div>
        <div class="meta">Watched${who}</div>
        ${notes}
      </div>
    </div>
  `;
}

export async function renderProfileIntel(playerId: number): Promise<void> {
  const existing = document.querySelector('[data-tm-companion="profile-intel"]');

  const auth = getAuth();
  if (!auth) {
    existing?.remove();
    return;
  }

  let intel: CachedIntel;
  try {
    intel = await getIntel(playerId);
  } catch {
    existing?.remove();
    return;
  }

  const { spy, target, stakeout } = intel;
  if (!spy && !target && !stakeout) {
    existing?.remove();
    return;
  }

  const { host, shadow } = ensureHost('profile-intel');
  applyBaseStyles(shadow);

  // Re-render — single card so we wipe and rebuild.
  shadow.querySelectorAll('.card, style[data-tm-intel]').forEach((n) => n.remove());

  const style = document.createElement('style');
  style.setAttribute('data-tm-intel', '1');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-header">
      <div class="card-title">⚡ TM Hub intel</div>
      <a class="card-link" href="${HUB_ORIGIN}/spy/${playerId}" target="_blank">Open in TM Hub →</a>
    </div>
    ${spy ? spyRow(spy) : ''}
    ${target ? targetRow(target) : ''}
    ${stakeout ? stakeoutRow(stakeout) : ''}
  `;
  shadow.appendChild(card);

  // Anchor under the OFF-LIMITS badge if present, else under profile.
  if (!host.parentElement) {
    const offLimitsHost = document.querySelector('[data-tm-companion="profile-badge"]');
    if (offLimitsHost && offLimitsHost.parentElement) {
      offLimitsHost.parentElement.insertBefore(host, offLimitsHost.nextSibling);
      return;
    }
    for (const sel of PROFILE_ANCHOR_SELECTORS) {
      const anchor = document.querySelector(sel);
      if (anchor) {
        anchor.insertBefore(host, anchor.firstChild);
        return;
      }
    }
    document.body.insertBefore(host, document.body.firstChild);
  }
}

void HOST_KIND;
