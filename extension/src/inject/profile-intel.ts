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
  flagOffLimits,
  saveTarget,
  removeTarget,
  addStakeout,
  removeStakeout,
} from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { PROFILE_ANCHOR_SELECTORS } from '../lib/torn-pages';
import { applyBaseStyles, ensureHost } from '../lib/shadow';
import { showFormModal } from '../lib/modal';
import { showToast } from '../lib/notifications';
import type { SpyEstimate, Stakeout, Target, WarOffLimits } from '../types';

export interface ProfileIntelContext {
  warId: number | null;
  offLimits: WarOffLimits | null;
  playerName?: string;
}

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
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #21262d;
  }
  .action-btn {
    background: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .action-btn:hover { background: #30363d; border-color: #58a6ff; color: #f0f6fc; }
  .action-btn.danger { color: #f85149; border-color: #f85149; }
  .action-btn.danger:hover { background: rgba(248,81,73,0.1); }
  .action-btn:disabled { opacity: 0.5; cursor: wait; }
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

function detectPlayerNameFromDom(): string | null {
  // Best-effort: Torn profile pages set <title>Player Name | Torn</title>.
  const title = document.title.split('|')[0].trim();
  if (title && title.toLowerCase() !== 'profile' && title.toLowerCase() !== 'torn') {
    return title;
  }
  // Fallback: <h4 class="user-information-name"> or similar — Torn changes
  // these constantly so we accept a null answer and ask the user instead.
  const candidates = ['.user-information-name', '#profileroot h4', '.profile-name'];
  for (const sel of candidates) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }
  return null;
}

function actionsRow(
  _playerId: number,
  ctx: ProfileIntelContext,
  intel: CachedIntel,
): string {
  const buttons: string[] = [];
  // OFF-LIMITS: only show "Flag" when in an active war and not already flagged.
  if (ctx.warId && !ctx.offLimits) {
    buttons.push(`<button class="action-btn" data-act="flag-off">🚫 Flag off-limits</button>`);
  }
  // Target list toggle.
  if (intel.target) {
    buttons.push(`<button class="action-btn" data-act="edit-target">🎯 Edit target</button>`);
  } else {
    buttons.push(`<button class="action-btn" data-act="save-target">🎯 Save to targets</button>`);
  }
  // Stakeout toggle.
  if (intel.stakeout) {
    buttons.push(`<button class="action-btn danger" data-act="remove-stakeout">🔍 Stop watching</button>`);
  } else {
    buttons.push(`<button class="action-btn" data-act="add-stakeout">🔍 Watch (stakeout)</button>`);
  }
  if (buttons.length === 0) return '';
  return `<div class="actions">${buttons.join('')}</div>`;
}

function bindActions(
  shadow: ShadowRoot,
  playerId: number,
  ctx: ProfileIntelContext,
  intel: CachedIntel,
  rerender: () => void,
): void {
  const auth = getAuth();
  if (!auth) return;

  const resolveName = (): string =>
    ctx.playerName ||
    intel.spy?.player_name ||
    intel.target?.player_name ||
    intel.stakeout?.player_name ||
    detectPlayerNameFromDom() ||
    `#${playerId}`;

  shadow.querySelector('[data-act="flag-off"]')?.addEventListener('click', async () => {
    if (!ctx.warId) return;
    const result = await showFormModal({
      title: '🚫 Flag off-limits',
      description:
        'Mark this player as off-limits for the current war. Faction members will see a warning before attacking.',
      fields: [
        {
          name: 'reason',
          label: 'Reason (optional)',
          type: 'textarea',
          placeholder: 'e.g. med-out for chain leader, dip with [Bombla]',
        },
      ],
      submitLabel: 'Flag',
    });
    if (!result || result.kind !== 'submit') return;
    try {
      await flagOffLimits(auth, ctx.warId, {
        player_id: playerId,
        player_name: resolveName(),
        reason: result.values.reason || '',
      });
      showToast({
        title: 'Flagged off-limits',
        body: `${resolveName()} is now off-limits faction-wide.`,
        icon: '🚫',
        tone: 'info',
      });
      // Bust local caches AND broadcast so the main refresh loop reloads
      // the off-limits map — the OFF-LIMITS badge needs to appear without
      // waiting for the 30s poll cycle.
      _intelCache.delete(playerId);
      window.dispatchEvent(new CustomEvent('tm-companion-refresh'));
      rerender();
    } catch (err) {
      showToast({
        title: 'Could not flag',
        body: err instanceof ApiError && err.status === 409 ? 'Already flagged.' : 'Backend error.',
        icon: '⚠️',
        tone: 'warn',
      });
    }
  });

  shadow.querySelector('[data-act="save-target"]')?.addEventListener('click', async () => {
    const result = await showFormModal({
      title: '🎯 Save to your targets',
      description: 'Persists with a tag + optional notes. Visible only to you.',
      fields: [
        { name: 'tag', label: 'Tag', placeholder: 'e.g. farm, war-enemy, avoid' },
        {
          name: 'difficulty',
          label: 'Difficulty',
          type: 'select',
          options: [
            { value: '', label: '(unknown)' },
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ],
          initialValue: '',
        },
        { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Optional context' },
      ],
      submitLabel: 'Save',
    });
    if (!result || result.kind !== 'submit') return;
    try {
      await saveTarget(auth, {
        player_id: playerId,
        player_name: resolveName(),
        tag: result.values.tag || undefined,
        difficulty: result.values.difficulty || undefined,
        notes: result.values.notes || undefined,
      });
      showToast({ title: 'Saved to targets', body: resolveName(), icon: '🎯', tone: 'info' });
      _targetsCache = null;
      _intelCache.delete(playerId);
      rerender();
    } catch {
      showToast({ title: 'Could not save target', body: 'Backend error.', icon: '⚠️', tone: 'warn' });
    }
  });

  shadow.querySelector('[data-act="edit-target"]')?.addEventListener('click', async () => {
    const t = intel.target!;
    const result = await showFormModal({
      title: '🎯 Edit target',
      fields: [
        { name: 'tag', label: 'Tag', initialValue: t.tag || '' },
        {
          name: 'difficulty',
          label: 'Difficulty',
          type: 'select',
          options: [
            { value: '', label: '(unknown)' },
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ],
          initialValue: t.difficulty || '',
        },
        { name: 'notes', label: 'Notes', type: 'textarea', initialValue: t.notes || '' },
      ],
      submitLabel: 'Save',
      destructiveAction: { label: 'Remove from targets', value: 'remove' },
    });
    if (!result) return;
    try {
      if (result.kind === 'destructive') {
        await removeTarget(auth, playerId);
        showToast({ title: 'Removed from targets', body: resolveName(), icon: '🎯', tone: 'info' });
      } else {
        // PATCH not exposed, re-save acts as upsert via POST (server uses PK).
        await saveTarget(auth, {
          player_id: playerId,
          player_name: resolveName(),
          tag: result.values.tag || undefined,
          difficulty: result.values.difficulty || undefined,
          notes: result.values.notes || undefined,
        });
        showToast({ title: 'Target updated', body: resolveName(), icon: '🎯', tone: 'info' });
      }
      _targetsCache = null;
      _intelCache.delete(playerId);
      rerender();
    } catch {
      showToast({ title: 'Could not update target', body: 'Backend error.', icon: '⚠️', tone: 'warn' });
    }
  });

  shadow.querySelector('[data-act="add-stakeout"]')?.addEventListener('click', async () => {
    const result = await showFormModal({
      title: '🔍 Watch (stakeout)',
      description: 'Adds the player to the faction-wide stakeout list.',
      fields: [
        { name: 'notes', label: 'Notes (optional)', type: 'textarea', placeholder: 'Why are we watching this one?' },
      ],
      submitLabel: 'Watch',
    });
    if (!result || result.kind !== 'submit') return;
    try {
      await addStakeout(auth, {
        player_id: playerId,
        player_name: resolveName(),
        notes: result.values.notes || '',
      });
      showToast({ title: 'Added to stakeout', body: resolveName(), icon: '🔍', tone: 'info' });
      _stakeoutsCache = null;
      _intelCache.delete(playerId);
      rerender();
    } catch {
      showToast({ title: 'Could not add stakeout', body: 'Backend error.', icon: '⚠️', tone: 'warn' });
    }
  });

  shadow.querySelector('[data-act="remove-stakeout"]')?.addEventListener('click', async () => {
    if (!confirm('Remove from faction stakeout list?')) return;
    try {
      await removeStakeout(auth, playerId);
      showToast({ title: 'Stopped watching', body: resolveName(), icon: '🔍', tone: 'info' });
      _stakeoutsCache = null;
      _intelCache.delete(playerId);
      rerender();
    } catch {
      showToast({ title: 'Could not remove', body: 'Backend error.', icon: '⚠️', tone: 'warn' });
    }
  });
}

export async function renderProfileIntel(
  playerId: number,
  ctx: ProfileIntelContext = { warId: null, offLimits: null },
): Promise<void> {
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
  const hasActions = ctx.warId || true; // always show some action (save target / watch)

  if (!spy && !target && !stakeout && !hasActions) {
    existing?.remove();
    return;
  }

  const { host, shadow } = ensureHost('profile-intel');
  applyBaseStyles(shadow);

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
    ${actionsRow(playerId, ctx, intel)}
  `;
  shadow.appendChild(card);

  bindActions(shadow, playerId, ctx, intel, () => {
    void renderProfileIntel(playerId, ctx);
  });

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
