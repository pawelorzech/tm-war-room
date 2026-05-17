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
import { attachToProfileStack } from '../lib/profile-stack';
import { showFormModal } from '../lib/modal';
import { showToast } from '../lib/notifications';
import type { SpyEstimate, Stakeout, Target, WarOffLimits } from '../types';
import {
  bucketStyle,
  formatTotalRange,
  formatPerStat,
  bucketCaption,
  type SpyEstimate as SpyEstimateDisplay,
} from '../lib/spy-display';

export interface ProfileIntelContext {
  warId: number | null;
  offLimits: WarOffLimits | null;
  playerName?: string;
}

import { HUB_ORIGIN } from '../env';
import { escapeHtml } from '../lib/format';

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
  /* .intel-card (not .card) — avoids collision with BASE_STYLES in lib/shadow.ts
     which sets .card { display: flex } for the other attack/bounty overlays. */
  .intel-card {
    display: block;
    container-type: inline-size;
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
  .intel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }
  .intel-title {
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
  .intel-link {
    color: #6e7681;
    font-size: 12px;
    text-decoration: none;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .intel-link:hover { color: #58a6ff; }
  .intel-link .link-icon { font-size: 14px; }
  /* Narrow container: hide the text portion of the link, show only the arrow icon. */
  .intel-link .link-text { display: none; }
  @container (min-width: 481px) {
    .intel-link .link-text { display: inline; }
  }

  /* Spy block: bucket badge + hero total/range + stat grid */
  .spy-card {
    border-left: 3px solid var(--bucket-color, #30363d);
    padding-left: 8px;
    margin-bottom: 6px;
  }
  .spy-card.spy-bucket-verified { --bucket-color: #3fb950; }
  .spy-card.spy-bucket-estimate { --bucket-color: #d29922; }
  .spy-card.spy-bucket-rough_guess { --bucket-color: #f5a05a; }

  .bucket-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .bucket-badge.color-green { background: rgba(63,185,80,0.18); color: #56d364; }
  .bucket-badge.color-yellow { background: rgba(210,153,34,0.18); color: #e8b339; }
  .bucket-badge.color-orange { background: rgba(245,160,90,0.18); color: #f5a05a; }

  .spy-total {
    display: flex; align-items: baseline; gap: 6px;
    margin-bottom: 4px;
  }
  .spy-total .icon { font-size: 16px; }
  .spy-total .value {
    font-size: 18px; font-weight: 700;
    color: #c9d1d9;
    font-variant-numeric: tabular-nums;
  }
  .spy-total .label {
    font-size: 11px; color: #8b949e;
  }

  .spy-caption {
    font-size: 11px; color: #8b949e;
    margin: 2px 0 4px;
  }

  /* Stat grid: 2 cols default (narrow), 4 cols when container is wide enough */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }
  @container (min-width: 481px) {
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
  @container (min-width: 481px) {
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

  /* Actions: primary CTA + secondary grid (column when narrow, row when wide) */
  .actions {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid #21262d;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .action-primary { width: 100%; }
  .action-pair { display: flex; gap: 6px; }
  .action-pair .action-btn { flex: 1; }
  .action-secondary-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  @container (min-width: 481px) {
    .actions { flex-direction: row; align-items: stretch; }
    .action-primary { width: auto; flex: 1; }
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
    display: none;
  }
  /* Show hint only when container is wide enough */
  @container (min-width: 481px) {
    .action-btn .hint { display: inline; }
  }
`;


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
  // Local SpyEstimate (from ../types) widens `confidence` to plain string and
  // doesn't declare the new bucket fields yet (out of scope for Task 5).
  // The backend always attaches `bucket` / `total_range` etc, so this cast is
  // safe at runtime — spy-display tolerates missing fields with sensible
  // defaults.
  const s = spy as unknown as SpyEstimateDisplay;
  const bucket = s.bucket ?? 'estimate';
  const style = bucketStyle(bucket);
  const totalText = formatTotalRange(s.total, s.total_range, bucket);
  const perStat = formatPerStat(s);
  const caption = escapeHtml(bucketCaption(s));

  const grid = perStat
    ? `
    <div class="stat-grid">
      <div class="stat"><div class="stat-key">STR</div><div class="stat-val">${escapeHtml(perStat.str)}</div></div>
      <div class="stat"><div class="stat-key">DEF</div><div class="stat-val">${escapeHtml(perStat.def)}</div></div>
      <div class="stat"><div class="stat-key">SPD</div><div class="stat-val">${escapeHtml(perStat.spd)}</div></div>
      <div class="stat"><div class="stat-key">DEX</div><div class="stat-val">${escapeHtml(perStat.dex)}</div></div>
    </div>`
    : '';

  const inlines: string[] = [];
  if (target) inlines.push(targetInline(target));
  if (stakeout) inlines.push(stakeoutInline(stakeout));
  const inlineRows = inlines.length ? `<div class="inline-rows">${inlines.join('')}</div>` : '';

  const label = bucket === 'rough_guess' ? 'rough estimate' : 'total estimate';

  return `
    <div class="spy-card spy-bucket-${escapeHtml(bucket)}">
      <div class="bucket-badge color-${escapeHtml(style.color)}">${escapeHtml(style.badgeText)}</div>
      <div class="spy-total">
        <span class="icon">⚔️</span>
        <span class="value">${escapeHtml(totalText)}</span>
        <span class="label">${escapeHtml(label)}</span>
      </div>
      <div class="spy-caption">${caption}</div>
      ${grid}
      ${inlineRows}
    </div>
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
  // Primary action: target toggle. When unsaved, one big "Save to targets"
  // button. When already saved, split into two side-by-side actions — Edit
  // (re-opens the modal pre-filled with current tag/difficulty/notes so you
  // can adjust without retyping) and Remove (confirm + delete). Replaces the
  // earlier single "tap to remove" button which forced a save-from-scratch
  // workflow whenever you wanted to tweak a tag.
  const primary = intel.target
    ? `<div class="action-pair action-primary">
         <button class="action-btn active" data-act="edit-target">✏️&nbsp;Edit target</button>
         <button class="action-btn" data-act="remove-target">🗑&nbsp;Remove</button>
       </div>`
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

  // Save and Edit share the modal — the only difference is whether the
  // fields start blank or pre-populated with the existing target's values.
  const openTargetForm = async (mode: 'save' | 'edit'): Promise<void> => {
    const existing = mode === 'edit' ? intel.target : null;
    const result = await showFormModal({
      title: mode === 'edit' ? '✏️ Edit target' : '🎯 Save to your targets',
      description:
        mode === 'edit'
          ? 'Update tag, difficulty, or notes. Only you see these.'
          : 'Persists with a tag + optional notes. Visible only to you.',
      fields: [
        {
          name: 'tag',
          label: 'Tag',
          placeholder: 'e.g. farm, war-enemy, avoid',
          initialValue: existing?.tag ?? '',
        },
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
          initialValue: existing?.difficulty ?? '',
        },
        {
          name: 'notes',
          label: 'Notes',
          type: 'textarea',
          placeholder: 'Optional context',
          initialValue: existing?.notes ?? '',
        },
      ],
      submitLabel: mode === 'edit' ? 'Update' : 'Save',
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
      showToast({
        title: mode === 'edit' ? 'Target updated' : 'Saved to targets',
        body: resolveName(),
        icon: '🎯',
        tone: 'info',
      });
      _targetsCache = null;
      _intelCache.delete(playerId);
      rerender();
    } catch {
      showToast({ title: 'Could not save target', body: 'Backend error.', icon: '⚠️', tone: 'warn' });
    }
  };

  shadow.querySelector('[data-act="save-target"]')?.addEventListener('click', () => {
    void openTargetForm('save');
  });

  shadow.querySelector('[data-act="edit-target"]')?.addEventListener('click', () => {
    void openTargetForm('edit');
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

  shadow.querySelectorAll('.intel-card, style[data-tm-intel]').forEach((n) => n.remove());

  const style = document.createElement('style');
  style.setAttribute('data-tm-intel', '1');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const card = document.createElement('div');
  card.className = 'intel-card';
  card.innerHTML = `
    <div class="intel-header">
      <div class="intel-title">⚡ TM HUB INTEL</div>
      <a class="intel-link" href="${HUB_ORIGIN}/spy?id=${playerId}" target="_blank">
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
    if (attachToProfileStack(host)) return;
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
