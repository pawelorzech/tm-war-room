// Most-active-window chip — surfaces the 4-hour UTC window the target player
// is statistically most likely to be online. Renders on /profile.php only.
//
// Phase 3B: data comes from /api/activity/{player_id} (14-day heatmap),
// gated by the `activity` feature flag. As a side effect, opening any
// profile while the flag is on enrolls the target for continuous tracking —
// this is what builds the dataset organically for outsiders the faction is
// scoping. Faction members are already tracked by the scheduler.
//
// Architecture
// ------------
// The function signature takes a *host* HTMLElement. We treat it as a
// placement hint (the chip is rendered into its own Shadow DOM host and
// inserted right after `host` in the DOM so it sits with the other profile
// overlay cards). When `host` has no parent (e.g. profile-badge returned
// early because there's no off-limits flag) we fall back to the standard
// PROFILE_ANCHOR_SELECTORS placement used by every other profile overlay.

import { ApiError, fetchActivity, enrollActivityTracking, fetchFeatureFlags } from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { applyBaseStyles, ensureHost } from '../lib/shadow';
import { PROFILE_ANCHOR_SELECTORS } from '../lib/torn-pages';
import { attachToProfileStack } from '../lib/profile-stack';
import { cardBase } from '../lib/card-styles';
import { escapeHtml } from '../lib/format';

const HOST_KIND = 'activity-chip';
const ACCENT = '#79b8ff';

const STYLES = `
${cardBase(ACCENT)}
.card { padding: 8px 12px; }
.row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.icon { font-size: 14px; line-height: 1; }
.label {
  color: #8b949e;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.window {
  color: #f0f6fc;
  font-weight: 700;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.help {
  margin-left: auto;
  color: #6e7681;
  font-size: 11px;
  cursor: help;
  border-bottom: 1px dotted #6e7681;
}
`;

function clearChip(): void {
  document.querySelector(`[data-tm-companion="${HOST_KIND}"]`)?.remove();
}

function placeHost(host: HTMLElement, anchor: HTMLElement): void {
  if (host.parentElement) return;
  // Prefer the pre-mounted profile-stack so the chip lands inside reserved
  // space instead of triggering a layout shift on async mount.
  if (attachToProfileStack(host)) return;
  // If the placement-hint anchor is in the DOM, drop the chip right after it
  // so it visually clusters with profile-badge / profile-intel.
  if (anchor.parentElement) {
    anchor.parentElement.insertBefore(host, anchor.nextSibling);
    return;
  }
  // Otherwise: fall back to the standard profile anchor selectors.
  for (const sel of PROFILE_ANCHOR_SELECTORS) {
    const target = document.querySelector(sel);
    if (target) {
      target.insertBefore(host, target.firstChild);
      return;
    }
  }
  // Last resort: top of body.
  document.body.insertBefore(host, document.body.firstChild);
}

export async function maybeRenderActivityChip(
  anchor: HTMLElement,
  playerId: number,
): Promise<void> {
  // Feature-flag gate. Until the backend flips ENABLE_ACTIVITY=1 in prod the
  // endpoint returns 503 and we never enroll. Cheap public read, 60s cached.
  let flags;
  try {
    flags = await fetchFeatureFlags();
  } catch {
    clearChip();
    return;
  }
  if (!flags.activity) {
    clearChip();
    return;
  }

  const auth = getAuth();
  if (!auth) {
    clearChip();
    return;
  }

  // Fire-and-forget enrollment so outsider profile views build the dataset.
  // Backend rate-limits 30/min per caller and silently no-ops on faction
  // members, so calling on every render is safe.
  enrollActivityTracking(auth, playerId);

  let activity;
  try {
    activity = await fetchActivity(auth, playerId);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) clearAuth();
    clearChip();
    return;
  }
  if (!activity) {
    clearChip();
    return;
  }

  // Empty dataset (all-zero bins) — backend still returns "00:00-04:00 UTC"
  // because the window picker resolves ties to the earliest hour. Detect by
  // summing the matrix; show nothing rather than misleading "most active 00".
  let total = 0;
  for (const day of activity.bins) for (const v of day) total += v;
  if (total <= 0) {
    clearChip();
    return;
  }

  const { host, shadow } = ensureHost(HOST_KIND);
  applyBaseStyles(shadow);

  shadow.querySelectorAll('.card, style[data-tm-activity-chip]').forEach((n) => n.remove());

  const style = document.createElement('style');
  style.setAttribute('data-tm-activity-chip', '1');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const tooltip = 'Based on 14-day online history. Data source: TM Hub scheduler (5min sampling).';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="row">
      <span class="icon">⏰</span>
      <span class="label">Most active</span>
      <span class="window">${escapeHtml(activity.most_active_window)}</span>
      <span class="help" title="${escapeHtml(tooltip)}">?</span>
    </div>
  `;
  shadow.appendChild(card);

  placeHost(host, anchor);
}

void HOST_KIND;
