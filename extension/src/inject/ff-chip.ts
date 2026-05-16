// FFScouter parity — Phase 1B.
//
// Renders a single FF (fair-fight) chip on profile / attack / roster rows
// when the backend's /api/ff/{id} answers with `source === "formula"`.
//
// Why fallback-only:
//   - When the backend has a fresh spy estimate, the existing spy chip
//     already shows the strictly-better information (actual stats, not a
//     formula approximation). Stacking an FF chip on top would be noise.
//   - The FF chip's job is to fill the gap: "no fresh spy data, but here's
//     a calibrated guess + which stat to counter with".
//
// Backend signal:
//   - `source === "spy"`     → skip (spy chip wins)
//   - `source === "formula"` → render
//
// The chip is feature-flag gated (`flags.ff_score`). When the flag is off
// `fetchFF` returns null (503 path), so even bypassing the flag check would
// no-op — defence in depth.
//
// Style: tiny inline pill, no Shadow DOM. Three sibling overlays already
// drop pills next to profile anchors using the same pattern (see
// faction-roster-overlay.ts `[data-tm-faction-roster-badge] .pill`); the
// FF chip mirrors that look so it sits cleanly alongside.

import { fetchFF, type FFScore } from '../lib/api';
import { getAuth } from '../lib/auth';
import { getFeatureFlags } from '../env';
import { escapeHtml } from '../lib/format';

const FF_CHIP_ATTR = 'data-tm-ff-chip';
const FF_STYLES_ID = 'tm-companion-ff-chip-styles';

const STYLES = `
  [${FF_CHIP_ATTR}] {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    margin: 0 4px;
    font: 600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    border-radius: 10px;
    background: rgba(110,118,129,0.16);
    color: #c9d1d9;
    border: 1px solid rgba(255,255,255,0.08);
    white-space: nowrap;
    cursor: help;
    line-height: 1.4;
    vertical-align: middle;
  }
  [${FF_CHIP_ATTR}] .ff-label { color: #8b949e; font-weight: 500; }
  [${FF_CHIP_ATTR}] .ff-score { color: #f0f6fc; font-variant-numeric: tabular-nums; }
  [${FF_CHIP_ATTR}].ff-low  .ff-score { color: #56d364; }   /* easier (<1.5) */
  [${FF_CHIP_ATTR}].ff-mid  .ff-score { color: #e8b339; }   /* moderate     */
  [${FF_CHIP_ATTR}].ff-high .ff-score { color: #f85149; }   /* hard (>=3.0) */
  [${FF_CHIP_ATTR}] .ff-dom { color: #79b8ff; }
`;

function ensureStyles(): void {
  if (document.getElementById(FF_STYLES_ID)) return;
  const style = document.createElement('style');
  style.id = FF_STYLES_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

const DOM_HINTS: Record<FFScore['dom_stat'], string> = {
  STR: 'STR — counter with a SPD/DEX build',
  DEF: 'DEF — high HP/armour, expect to chip through',
  SPD: 'SPD — counter with DEX or stack hits',
  DEX: 'DEX — counter with a STR weapon',
};

function humanizeAgo(seconds: number): string {
  if (seconds < 0) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function tierClass(score: number): string {
  if (score < 1.5) return 'ff-low';
  if (score < 3.0) return 'ff-mid';
  return 'ff-high';
}

function buildChip(result: FFScore): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.setAttribute(FF_CHIP_ATTR, '1');
  chip.classList.add(tierClass(result.score));
  const ago = humanizeAgo(Math.max(0, Math.floor(Date.now() / 1000) - result.computed_at));
  chip.title =
    `FFScouter-style estimate (no fresh spy data)\n` +
    `Dominant stat: ${DOM_HINTS[result.dom_stat]}\n` +
    `Source: TM Hub FF formula (battle stats / level)\n` +
    `Updated ${ago}`;
  chip.innerHTML =
    `<span class="ff-label">FF</span>` +
    `<span class="ff-score">${result.score.toFixed(1)}</span>` +
    `<span class="ff-dom">· ${escapeHtml(result.dom_stat)}-heavy (no spy)</span>`;
  return chip;
}

/** Render an FF fallback chip into *host* for *playerId* — only if the
 *  feature flag is on AND the backend returned a formula-source score
 *  (i.e. no fresh spy estimate exists).
 *
 *  Idempotent: if a chip is already inside the host with the same player id
 *  we leave it alone. Multiple call sites (profile, attack, roster) all
 *  share this function — each one is responsible for choosing the right
 *  host element for its layout.
 */
export async function maybeRenderFFChip(
  host: HTMLElement,
  playerId: number,
): Promise<void> {
  if (!getFeatureFlags().ff_score) return;
  const auth = getAuth();
  if (!auth) return;

  // Skip if we've already painted a chip for this player into this host.
  const existing = host.querySelector(`[${FF_CHIP_ATTR}][data-tm-ff-pid="${playerId}"]`);
  if (existing) return;

  const result = await fetchFF(auth, playerId);
  if (result === null) return;
  // Fallback-only: when fresh spy data exists, the spy chip is strictly
  // better. Defer to it.
  if (result.source !== 'formula') return;

  ensureStyles();
  const chip = buildChip(result);
  chip.setAttribute('data-tm-ff-pid', String(playerId));
  host.appendChild(chip);
}
