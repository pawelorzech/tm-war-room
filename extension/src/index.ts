// TM Hub Companion — userscript entry point.
//
// Flow on every torn.com page load (and SPA-like navigation):
//   1. Match current URL → decide which inject to run
//   2. Ensure we have an auth token (else show a single connect prompt)
//   3. Fetch current war_id (cached 60s) and off-limits map (cached 30s)
//   4. If the page target player is in the off-limits map, render UI
//
// Polling cadence is deliberately conservative — TM Hub caches data on the
// server, but each tab on torn.com runs its own userscript instance, so
// hot paths still need to be cheap.

import { fetchCurrentWar, fetchOffLimits, ApiError } from './lib/api';
import { getAuth, installAuthListener, clearAuth } from './lib/auth';
import { matchPage, watchUrlChanges } from './lib/torn-pages';
import { renderProfileBadge } from './inject/profile-badges';
import { renderAttackOverlay } from './inject/attack-overlay';
import { applyBaseStyles, ensureHost } from './lib/shadow';
import { startNotificationToasts } from './inject/notification-toasts';
import { startHeartbeat } from './inject/heartbeat';
import { startSettingsButton } from './inject/settings-button';
import { startMentionAlerts } from './inject/mention-alerts';
import { ensureNativePermission } from './lib/notifications';
import type { CompanionAuth, WarOffLimits } from './types';

const HUB_ORIGIN: string =
  (typeof process !== 'undefined' && process.env && (process.env as Record<string, string>).TM_HUB_ORIGIN) ||
  'https://hub.tri.ovh';

// Caches — keyed by absolute timestamps for expiry checking.
let warIdCache: { value: number | null; until: number } = { value: null, until: 0 };
let offLimitsCache: { byPlayer: Map<number, WarOffLimits>; until: number } | null = null;
const WAR_TTL_MS = 60_000;
const OFFLIMITS_TTL_MS = 30_000;

async function getWarId(auth: CompanionAuth): Promise<number | null> {
  if (Date.now() < warIdCache.until) return warIdCache.value;
  try {
    const war = await fetchCurrentWar(auth);
    warIdCache = { value: war.war_id, until: Date.now() + WAR_TTL_MS };
    return war.war_id;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      clearAuth();
      promptConnect();
    }
    warIdCache = { value: null, until: Date.now() + 10_000 }; // short retry
    return null;
  }
}

async function getOffLimitsMap(auth: CompanionAuth, warId: number): Promise<Map<number, WarOffLimits>> {
  if (offLimitsCache && Date.now() < offLimitsCache.until) return offLimitsCache.byPlayer;
  try {
    const resp = await fetchOffLimits(auth, warId);
    const map = new Map<number, WarOffLimits>();
    for (const entry of resp.entries) map.set(entry.player_id, entry);
    offLimitsCache = { byPlayer: map, until: Date.now() + OFFLIMITS_TTL_MS };
    return map;
  } catch {
    offLimitsCache = { byPlayer: new Map(), until: Date.now() + 10_000 };
    return offLimitsCache.byPlayer;
  }
}

async function refresh(): Promise<void> {
  const match = matchPage();
  if (match.kind === 'unknown' || !match.player_id) {
    renderProfileBadge(null);
    return;
  }

  const auth = getAuth();
  if (!auth) {
    promptConnect();
    return;
  }

  const warId = await getWarId(auth);
  if (!warId) {
    renderProfileBadge(null);
    return;
  }

  const map = await getOffLimitsMap(auth, warId);
  const off = map.get(match.player_id) || null;

  if (match.kind === 'profile') {
    renderProfileBadge(off);
  } else if (match.kind === 'attack') {
    renderAttackOverlay(off);
  }
}

// One-time "connect to TM Hub" banner shown when no token is present.
//
// IMPORTANT: we open the auth page with window.open() rather than a plain
// `<a target="_blank">` link. Modern browsers null out `window.opener` for
// cross-origin _blank links (and `rel="noopener"` does it explicitly), which
// would break the postMessage handoff back to this tab. Programmatic
// window.open with a named target keeps opener intact.
let _promptShown = false;
function promptConnect(): void {
  if (_promptShown) return;
  _promptShown = true;
  const { host, shadow } = ensureHost('connect-banner');
  applyBaseStyles(shadow);
  const div = document.createElement('div');
  div.className = 'card warn';
  div.innerHTML = `
    <span class="icon">⚡</span>
    <div style="flex:1">
      <div class="title warn">TM Hub Companion — not connected</div>
      <div class="reason">Click to authorize this browser session.</div>
      <div class="meta" style="margin-top:8px;">
        <button class="btn btn-attack" data-act="connect">Connect to TM Hub →</button>
      </div>
    </div>
  `;
  shadow.appendChild(div);
  if (!host.parentElement) document.body.insertBefore(host, document.body.firstChild);

  shadow.querySelector('[data-act="connect"]')?.addEventListener('click', () => {
    const popup = window.open(
      `${HUB_ORIGIN}/extension-auth`,
      'tm-hub-companion-auth',
      'width=520,height=720,resizable=yes,scrollbars=yes',
    );
    // If the popup blocker shoots us down, fall back to a normal navigation
    // in a new tab — the user can then copy the token manually.
    if (!popup) {
      window.open(`${HUB_ORIGIN}/extension-auth`, '_blank');
    }
  });
}

function dismissConnectPrompt(): void {
  document.querySelector('[data-tm-companion="connect-banner"]')?.remove();
  _promptShown = false;
}

function bootstrap(): void {
  // Listen for token handoff from hub.tri.ovh/extension-auth.
  installAuthListener(() => {
    dismissConnectPrompt();
    // Re-run refresh with the fresh token.
    void refresh();
    // Ask for native notification permission now that the user just
    // performed a deliberate "yes, integrate this" action — best moment
    // for the browser permission prompt.
    void ensureNativePermission();
  });

  // Initial render + URL-change re-trigger.
  void refresh();
  watchUrlChanges(() => {
    void refresh();
  });

  // Periodic re-poll for off-limits data so a teammate's flag set in TM Hub
  // becomes visible without the user reloading.
  setInterval(() => void refresh(), OFFLIMITS_TTL_MS);

  // Communication channels — independent polling loops with Page Visibility
  // awareness. Each runs as long as we have an auth token; they self-skip
  // when getAuth() returns null.
  startNotificationToasts();
  startMentionAlerts();
  startHeartbeat();
  startSettingsButton();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
