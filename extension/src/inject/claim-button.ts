// Reusable "🎯 Claim / Release" button.
//
// Renders in three states:
//   1. Idle           → "🎯 Claim"
//   2. Claimed by me  → "🎯 Release (m:ss left)"
//   3. Claimed by ?   → "🎯 Claimed by NAME (m:ss left)"  (disabled)
//
// The button does not poll on its own. It subscribes to claim-bus, which is
// fed by the single streamClaims() loop owned by claim-banner.

import { getCachedFeatureFlags, postClaim, releaseClaim, ApiError } from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import {
  getActiveClaim,
  subscribe as subscribeClaimBus,
  applyCreated,
  applyReleased,
} from '../lib/claim-bus';
import { showToast } from '../lib/notifications';
import { escapeHtml } from '../lib/format';

const BUTTON_ATTR = 'data-tm-claim-button';

// Inline styles per-button — cheap (one node per row), and keeps the button
// resilient to Torn page CSS without needing a shadow root.
const BTN_STYLE_BASE =
  'display:inline-flex;align-items:center;gap:4px;padding:2px 8px;margin-left:6px;' +
  'border-radius:10px;border:1px solid #30363d;background:rgba(22,27,34,0.85);' +
  'color:#c9d1d9;font:600 11px -apple-system,BlinkMacSystemFont,sans-serif;' +
  'cursor:pointer;line-height:1.4;vertical-align:middle;';
const BTN_STYLE_OWN =
  'border-color:#3fb950;color:#3fb950;background:rgba(63,185,80,0.10);';
const BTN_STYLE_OTHER =
  'border-color:#d29922;color:#d29922;background:rgba(210,153,34,0.10);cursor:default;';

interface RenderOpts {
  host: HTMLElement;
  targetId: number;
  targetName: string;
  variant?: 'inline' | 'block';
}

/**
 * Render a claim button into the given host element. Safe to call repeatedly
 * on the same host (idempotent — replaces a prior button rather than stacking).
 *
 * No-op when:
 *   - hit_calling feature flag is off
 *   - targetId equals the current player_id (can't claim yourself)
 *   - user is not authenticated
 */
export function renderClaimButton(opts: RenderOpts): void {
  const flags = getCachedFeatureFlags();
  if (!flags.hit_calling) return;

  const auth = getAuth();
  if (!auth) return;
  if (auth.player_id === opts.targetId) return;

  // Replace any prior render so re-runs of the host overlay don't stack.
  opts.host.querySelectorAll(`[${BUTTON_ATTR}]`).forEach((n) => n.remove());

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute(BUTTON_ATTR, String(opts.targetId));
  if (opts.variant === 'block') {
    btn.style.cssText = BTN_STYLE_BASE + 'display:block;margin:6px 0 0;width:fit-content;';
  } else {
    btn.style.cssText = BTN_STYLE_BASE;
  }
  opts.host.appendChild(btn);

  // Initial paint + countdown ticker + bus subscription.
  let unsubscribe: (() => void) | null = null;
  let tickHandle: ReturnType<typeof setInterval> | null = null;
  const cleanup = () => {
    if (unsubscribe) unsubscribe();
    if (tickHandle) clearInterval(tickHandle);
  };

  const paint = () => {
    // isConnected works across shadow boundaries — document.body.contains
    // would falsely report `false` for buttons living in a shadow tree.
    if (!btn.isConnected) {
      cleanup();
      return;
    }
    const claim = getActiveClaim(opts.targetId);
    const me = getAuth();
    if (!me) {
      cleanup();
      btn.remove();
      return;
    }
    if (!claim) {
      btn.style.cssText =
        (opts.variant === 'block'
          ? BTN_STYLE_BASE + 'display:block;margin:6px 0 0;width:fit-content;'
          : BTN_STYLE_BASE);
      btn.disabled = false;
      btn.innerHTML = '🎯 Claim';
      btn.title =
        `Claim ${opts.targetName} for 15 minutes\n` +
        `Source: TM Hub claims service (faction-wide, auto-expires at 15:00)`;
      return;
    }
    const secondsLeft = Math.max(0, claim.expires_at - Math.floor(Date.now() / 1000));
    const mmss = formatMmSs(secondsLeft);
    const ownsIt = claim.claimer_id === me.player_id;
    if (ownsIt) {
      btn.style.cssText =
        (opts.variant === 'block'
          ? BTN_STYLE_BASE + 'display:block;margin:6px 0 0;width:fit-content;' + BTN_STYLE_OWN
          : BTN_STYLE_BASE + BTN_STYLE_OWN);
      btn.disabled = false;
      btn.innerHTML = `🎯 Release (${escapeHtml(mmss)} left)`;
      btn.title = 'Cancel your claim (Source: TM Hub claims service)';
    } else {
      btn.style.cssText =
        (opts.variant === 'block'
          ? BTN_STYLE_BASE + 'display:block;margin:6px 0 0;width:fit-content;' + BTN_STYLE_OTHER
          : BTN_STYLE_BASE + BTN_STYLE_OTHER);
      btn.disabled = true;
      const who = claim.claimer_name || `[${claim.claimer_id}]`;
      btn.innerHTML = `🎯 Claimed by ${escapeHtml(who)} (${escapeHtml(mmss)})`;
      btn.title =
        `${who} claimed this target — wait or pick another\n` +
        `Source: TM Hub claims service (faction-wide, 15-min TTL)`;
    }
  };

  btn.addEventListener('click', () => void onClick(btn, opts, paint));

  paint();
  // Re-paint every second so the countdown stays current. The interval is
  // cheap because paint() short-circuits when the button has been detached.
  tickHandle = setInterval(paint, 1_000);
  unsubscribe = subscribeClaimBus(paint);
}

async function onClick(
  btn: HTMLButtonElement,
  opts: RenderOpts,
  paint: () => void,
): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  const existing = getActiveClaim(opts.targetId);
  const ownsIt = existing && existing.claimer_id === auth.player_id;
  btn.disabled = true;
  try {
    if (ownsIt) {
      const ok = await releaseClaim(auth, opts.targetId);
      if (ok && existing) applyReleased(existing);
    } else {
      const result = await postClaim(auth, opts.targetId);
      if (result.ok) {
        applyCreated(result.claim);
      } else {
        const who = result.conflict_with.claimer_name || `[${result.conflict_with.claimer_id}]`;
        const left = Math.max(
          0,
          result.conflict_with.expires_at - Math.floor(Date.now() / 1000),
        );
        showToast({
          id: `claim-conflict:${opts.targetId}`,
          title: 'Already claimed',
          body: `${who} is on ${opts.targetName} (${formatMmSs(left)} left).`,
          icon: '🎯',
          tone: 'warn',
          ttlMs: 5000,
        });
        // Make sure the bus reflects the conflicting row so our button paints
        // the "claimed by ?" state immediately, without waiting for the next
        // poll tick.
        applyCreated(result.conflict_with);
      }
    }
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      clearAuth();
    }
    showToast({
      id: `claim-err:${opts.targetId}:${Date.now()}`,
      title: 'Claim failed',
      body: 'Could not reach TM Hub — try again in a moment.',
      icon: '⚠️',
      tone: 'warn',
      ttlMs: 4000,
    });
  } finally {
    paint();
  }
}

function formatMmSs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
