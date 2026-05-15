// Injects an OFF-LIMITS card on /profile.php?XID=<id> when the player is
// flagged in the current war's war_off_limits list.
//
// Strategy: query the page for a profile-area anchor and insert our Shadow
// DOM host before the first child. If anchor is missing we silently skip —
// better to render nothing than to break the page.

import type { WarOffLimits } from '../types';
import { PROFILE_ANCHOR_SELECTORS } from '../lib/torn-pages';
import { applyBaseStyles, ensureHost } from '../lib/shadow';

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
