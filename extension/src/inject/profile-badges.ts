// Injects an OFF-LIMITS card on /profile.php?XID=<id> when the player is
// flagged in the current war's war_off_limits list.
//
// Strategy: query the page for a profile-area anchor and insert our Shadow
// DOM host before the first child. If anchor is missing we silently skip —
// better to render nothing than to break the page.

import type { WarOffLimits } from '../types';
import { PROFILE_ANCHOR_SELECTORS } from '../lib/torn-pages';
import { applyBaseStyles, ensureHost } from '../lib/shadow';
import { escapeHtml } from '../lib/format';
import { getCachedFeatureFlags } from '../lib/api';
import { renderClaimButton } from './claim-button';

export function renderProfileBadge(off: WarOffLimits | null): void {
  // Remove any previous badge first (target may have changed, or flag cleared).
  const existing = document.querySelector('[data-tm-companion="profile-badge"]');
  if (existing && !off) {
    existing.remove();
    return;
  }
  if (!off) return;

  const { host, shadow } = ensureHost('profile-badge');
  applyBaseStyles(shadow);

  // Wipe and re-render content (cheap — single card).
  shadow.querySelectorAll('.card').forEach((n) => n.remove());

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <span class="icon">🚫</span>
    <div>
      <div class="title">OFF-LIMITS — set by ${escapeHtml(off.set_by_name)}</div>
      ${off.reason ? `<div class="reason">"${escapeHtml(off.reason)}"</div>` : ''}
      <div class="meta">From TM Hub · do not attack without checking with the faction</div>
    </div>
  `;
  shadow.appendChild(card);

  // Place host above the profile content.
  if (!host.parentElement) {
    for (const sel of PROFILE_ANCHOR_SELECTORS) {
      const anchor = document.querySelector(sel);
      if (anchor) {
        anchor.insertBefore(host, anchor.firstChild);
        return;
      }
    }
    // Last resort — pin to top of body.
    document.body.insertBefore(host, document.body.firstChild);
  }
}

/**
 * Claim-button-only host for the profile owner. Independent of OFF-LIMITS so
 * it shows up on every profile when hit_calling is on. Renders a single
 * compact card with the claim button.
 */
export function renderProfileClaimButton(targetId: number, targetName: string): void {
  if (!getCachedFeatureFlags().hit_calling) return;
  // Strip any prior host (target may have changed across SPA nav).
  const prior = document.querySelector('[data-tm-companion="profile-claim"]');
  if (prior) prior.remove();

  const { host, shadow } = ensureHost('profile-claim');
  applyBaseStyles(shadow);

  // Anchor above the profile content alongside the OFF-LIMITS card (when present).
  if (!host.parentElement) {
    let placed = false;
    for (const sel of PROFILE_ANCHOR_SELECTORS) {
      const anchor = document.querySelector(sel);
      if (anchor) {
        anchor.insertBefore(host, anchor.firstChild);
        placed = true;
        break;
      }
    }
    if (!placed) document.body.insertBefore(host, document.body.firstChild);
  }

  // The button itself lives inside a slot in the shadow root — claim-button
  // attaches via inline styles, no shadow-aware CSS needed.
  shadow.querySelectorAll('[data-tm-claim-host]').forEach((n) => n.remove());
  const slot = document.createElement('div');
  slot.setAttribute('data-tm-claim-host', '1');
  slot.style.cssText =
    'display:flex;align-items:center;gap:8px;padding:8px 12px;margin:8px 0;' +
    'background:#161b22;border:1px solid #30363d;border-left:3px solid #58a6ff;' +
    'border-radius:8px;color:#c9d1d9;font:600 12px -apple-system,BlinkMacSystemFont,sans-serif;';
  slot.innerHTML = '<span>Hit-call:</span>';
  shadow.appendChild(slot);
  renderClaimButton({ host: slot, targetId, targetName });
}

