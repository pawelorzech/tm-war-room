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
import { maybeRenderFlightPill } from './flight-pill';

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

// Flight pill — appended alongside the OFF-LIMITS badge on profile pages.
// Lives in its own light-DOM host so it shows up even when the player is NOT
// off-limits (the OFF-LIMITS host is removed in that case).
const FLIGHT_HOST_ATTR = 'data-tm-companion-flight';

export async function renderProfileFlightPill(playerId: number): Promise<void> {
  let host = document.querySelector<HTMLElement>(`[${FLIGHT_HOST_ATTR}]`);
  if (!host) {
    host = document.createElement('div');
    host.setAttribute(FLIGHT_HOST_ATTR, '1');
    host.style.margin = '6px 0';
    for (const sel of PROFILE_ANCHOR_SELECTORS) {
      const anchor = document.querySelector(sel);
      if (anchor) {
        anchor.insertBefore(host, anchor.firstChild);
        break;
      }
    }
    if (!host.parentElement) document.body.insertBefore(host, document.body.firstChild);
  }
  await maybeRenderFlightPill(host, playerId);
  // Remove the host entirely when no pill rendered, so the profile header
  // doesn't keep an empty 6px gap on non-airborne players.
  if (!host.firstElementChild) host.remove();
}

