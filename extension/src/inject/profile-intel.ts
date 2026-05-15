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
  removeOffLimits,
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

import { HUB_ORIGIN } from '../env';

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
    padding: 12px;
    margin: 8px 0;
    color: #c9d1d9;
    font-size: 13px;
    line-height: 1.5;
  }

  /* Header: title + link, both nowrap so they never break vertically */
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }
  .card-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    color: #58a6ff;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    white-space: nowrap;
  }
  .card-link {
    color: #6e7681;
    font-size: 12px;
    text-decoration: none;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .card-link:hover { color: #58a6ff; }
  .card-link .link-icon { font-size: 14px; }
  /* Mobile: hide the text portion of the link, show only the arrow icon. */
  @media (max-width: 480px) {
    .card-link .link-text { display: none; }
  }

  /* Spy block: hero total + meta tags + stat grid + inline rows */
  .spy-total {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 6px;
  }
  .spy-total .icon { font-size: 16px; }
  .spy-total .value {
    font-size: 18px;
    font-weight: 700;
    color: #f0f6fc;
    font-variant-numeric: tabular-nums;
  }
  .spy-total .label {
    font-size: 11px;
    color: #8b949e;
    text-transform: lowercase;
  }
  .spy-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
    font-size: 11px;
  }
  .meta-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 10px;
    background: #21262d;
    color: #c9d1d9;
    font-size: 11px;
    font-weight: 500;
  }
  .meta-tag.source { background: rgba(88,166,255,0.12); color: #79b8ff; }
  .meta-tag.confidence-exact { background: rgba(63,185,80,0.18); color: #56d364; }
  .meta-tag.confidence-estimate { background: rgba(210,153,34,0.18); color: #e8b339; }
  .meta-tag.confidence-unknown { background: #21262d; color: #8b949e; }
  .meta-tag.age-fresh { background: rgba(63,185,80,0.18); color: #56d364; }
  .meta-tag.age-stale { background: rgba(210,153,34,0.18); color: #e8b339; }
  .meta-tag.age-old { background: rgba(248,81,73,0.18); color: #f85149; }

  /* Stat grid: 2 cols mobile, 4 cols desktop */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }
  @media (min-width: 481px) {
    .stat-grid { grid-template-columns: repeat(4, 1fr); }
  }
  .stat {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .stat-key {
    color: #6e7681;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .stat-val {
    color: #f0f6fc;
    font-weight: 700;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  /* Inline target / stakeout rows inside spy body */
  .inline-rows {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
  }
  @media (min-width: 481px) {
    .inline-rows { flex-direction: row; gap: 16px; flex-wrap: wrap; }
  }
  .inline-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    color: #c9d1d9;
  }
  .inline-row .row-icon { font-size: 13px; }
  .inline-note { color: #c9d1d9; font-style: italic; font-size: 11px; }
  .inline-secondary { color: #8b949e; font-size: 11px; }

  /* Tags for target tag/difficulty */
  .tag-pill {
    display: inline-block;
    background: #21262d;
    color: #c9d1d9;
    padding: 1px 7px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 500;
  }
  .tag-pill.difficulty-easy { background: rgba(63,185,80,0.18); color: #56d364; }
  .tag-pill.difficulty-medium { background: rgba(210,153,34,0.18); color: #e8b339; }
  .tag-pill.difficulty-hard { background: rgba(248,81,73,0.18); color: #f85149; }

  /* Actions: primary CTA + secondary grid (mobile col, desktop row) */
  .actions {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid #21262d;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  @media (min-width: 481px) {
    .actions { flex-direction: row; align-items: stretch; }
  }
  .action-primary { width: 100%; }
  @media (min-width: 481px) {
    .action-primary { width: auto; flex: 1; }
  }
  .action-secondary-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  @media (min-width: 481px) {
    .action-secondary-grid { display: flex; flex: 1; }
    .action-secondary-grid .action-btn { flex: 1; }
  }

  .action-btn {
    background: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
    border-radius: 6px;
    padding: 0 12px;
    height: 36px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    white-space: nowrap;
  }
  .action-btn:hover {
    background: #30363d;
    border-color: #58a6ff;
    color: #f0f6fc;
  }
  .action-btn:disabled { opacity: 0.5; cursor: wait; }

  /* Primary CTA (Save to targets): blue accent, taller */
  .action-btn.primary {
    border-color: #58a6ff;
    color: #f0f6fc;
    background: rgba(88,166,255,0.08);
    height: 40px;
    font-size: 13px;
  }
  .action-btn.primary:hover {
    background: rgba(88,166,255,0.18);
  }

  /* Active state (Saved / Watching / Off-limits already set): green */
  .action-btn.active {
    color: #56d364;
    border-color: rgba(63,185,80,0.5);
    background: rgba(63,185,80,0.10);
  }
  /* Active hover: red — signals tap=undo */
  .action-btn.active:hover {
    color: #f85149;
    border-color: rgba(248,81,73,0.5);
    background: rgba(248,81,73,0.08);
  }
  .action-btn .check { font-weight: 700; }
  .action-btn .hint {
    font-size: 10px;
    font-weight: 500;
    opacity: 0.75;
    margin-left: 4px;
  }
  /* On mobile, hide the hint to save space */
  @media (max-width: 480px) {
    .action-btn .hint { display: none; }
  }
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

function ageClass(days: number): string {
  if (days <= 1) return 'age-fresh';
  if (days <= 7) return 'age-stale';
  return 'age-old';
}

function spyMetaTags(spy: SpyEstimate): string {
  const source = `<span class="meta-tag source">●&nbsp;${escapeHtml(spy.source)}</span>`;
  const age = `<span class="meta-tag ${ageClass(spy.age_days)}">⏱&nbsp;${escapeHtml(fmtAge(spy.age_days))}</span>`;
  const confidence = `<span class="meta-tag confidence-${escapeHtml(spy.confidence)}">◇&nbsp;${escapeHtml(spy.confidence)}</span>`;
  return `<div class="spy-meta">${source}${age}${confidence}</div>`;
}

function targetInline(t: Target): string {
  const tag = t.tag ? `<span class="tag-pill">${escapeHtml(t.tag)}</span>` : '';
  const difficulty = t.difficulty
    ? `<span class="tag-pill difficulty-${escapeHtml(t.difficulty)}">${escapeHtml(t.difficulty)}</span>`
    : '';
  const notes = t.notes ? `<span class="inline-note">"${escapeHtml(t.notes)}"</span>` : '';
  return `
    <div class="inline-row">
      <span class="row-icon">🎯</span>${tag}${difficulty}${notes}
    </div>
  `;
}

function stakeoutInline(s: Stakeout): string {
  const who = s.added_by_name ? ` · added by ${escapeHtml(s.added_by_name)}` : '';
  const notes = s.notes ? ` · "${escapeHtml(s.notes)}"` : '';
  return `
    <div class="inline-row">
      <span class="row-icon">🔍</span>
      <span class="inline-secondary">Watched${who}${notes}</span>
    </div>
  `;
}

function spyBlock(spy: SpyEstimate, target: Target | null, stakeout: Stakeout | null): string {
  const inlines: string[] = [];
  if (target) inlines.push(targetInline(target));
  if (stakeout) inlines.push(stakeoutInline(stakeout));
  const inlineRows = inlines.length ? `<div class="inline-rows">${inlines.join('')}</div>` : '';
  return `
    <div class="spy-total">
      <span class="icon">⚔️</span>
      <span class="value">${fmtBigNumber(spy.total)}</span>
      <span class="label">total estimate</span>
    </div>
    ${spyMetaTags(spy)}
    <div class="stat-grid">
      <div class="stat"><div class="stat-key">STR</div><div class="stat-val">${fmtBigNumber(spy.strength)}</div></div>
      <div class="stat"><div class="stat-key">DEF</div><div class="stat-val">${fmtBigNumber(spy.defense)}</div></div>
      <div class="stat"><div class="stat-key">SPD</div><div class="stat-val">${fmtBigNumber(spy.speed)}</div></div>
      <div class="stat"><div class="stat-key">DEX</div><div class="stat-val">${fmtBigNumber(spy.dexterity)}</div></div>
    </div>
    ${inlineRows}
  `;
}

/* Fallback block when no spy data — still show target/stakeout so user can act. */
function noSpyBlock(target: Target | null, stakeout: Stakeout | null): string {
  const inlines: string[] = [];
  if (target) inlines.push(targetInline(target));
  if (stakeout) inlines.push(stakeoutInline(stakeout));
  const inlineRows = inlines.length ? `<div class="inline-rows">${inlines.join('')}</div>` : '';
  return `
    <div class="spy-total">
      <span class="icon">⚔️</span>
      <span class="label" style="font-style: italic;">No spy estimate available</span>
    </div>
    ${inlineRows}
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
  // Primary action: target toggle (Save ↔ Saved/remove).
  const primary = intel.target
    ? `<button class="action-btn active action-primary" data-act="remove-target"><span class="check">✓</span>&nbsp;🎯&nbsp;Saved<span class="hint">tap to remove</span></button>`
    : `<button class="action-btn primary action-primary" data-act="save-target">🎯&nbsp;Save to targets</button>`;

  // Secondary actions: watch toggle + (in war) flag toggle.
  const watchBtn = intel.stakeout
    ? `<button class="action-btn active" data-act="remove-stakeout"><span class="check">✓</span>&nbsp;🔍&nbsp;Watching</button>`
    : `<button class="action-btn" data-act="add-stakeout">🔍&nbsp;Watch</button>`;

  const secondary: string[] = [watchBtn];
  if (ctx.warId) {
    const flagBtn = ctx.offLimits
      ? `<button class="action-btn active" data-act="unflag-off"><span class="check">✓</span>&nbsp;🚫&nbsp;Off-limits</button>`
      : `<button class="action-btn" data-act="flag-off">🚫&nbsp;Flag off-limits</button>`;
    secondary.push(flagBtn);
  }

  return `
    <div class="actions">
      ${primary}
      <div class="action-secondary-grid">${secondary.join('')}</div>
    </div>
  `;
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

  shadow.querySelector('[data-act="unflag-off"]')?.addEventListener('click', async () => {
    if (!ctx.warId) return;
    if (!confirm(`Unflag ${resolveName()} as off-limits?`)) return;
    try {
      await removeOffLimits(auth, ctx.warId, playerId);
      showToast({
        title: 'Unflagged',
        body: `${resolveName()} is no longer off-limits.`,
        icon: '🚫',
        tone: 'info',
      });
      _intelCache.delete(playerId);
      window.dispatchEvent(new CustomEvent('tm-companion-refresh'));
      rerender();
    } catch {
      showToast({
        title: 'Could not unflag',
        body: 'Backend error.',
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

  shadow.querySelector('[data-act="remove-target"]')?.addEventListener('click', async () => {
    if (!confirm(`Remove ${resolveName()} from your targets?`)) return;
    try {
      await removeTarget(auth, playerId);
      showToast({ title: 'Removed from targets', body: resolveName(), icon: '🎯', tone: 'info' });
      _targetsCache = null;
      _intelCache.delete(playerId);
      rerender();
    } catch {
      showToast({ title: 'Could not remove target', body: 'Backend error.', icon: '⚠️', tone: 'warn' });
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
      <div class="card-title">⚡ TM HUB INTEL</div>
      <a class="card-link" href="${HUB_ORIGIN}/spy?id=${playerId}" target="_blank">
        <span class="link-icon">↗</span><span class="link-text">Open in TM Hub</span>
      </a>
    </div>
    ${spy ? spyBlock(spy, target, stakeout) : noSpyBlock(target, stakeout)}
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
