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

import { fetchCurrentWar, fetchOffLimits, fetchFeatureFlags, ApiError } from './lib/api';
import { getAuth, installAuthListener, clearAuth, consumeAuthFragment } from './lib/auth';
import { matchPage, watchUrlChanges } from './lib/torn-pages';
import { shouldSkipRefresh } from './lib/refresh-dedupe';
import { injectPreconnect } from './lib/preconnect';
import { startRumWire } from './lib/rum-wire';
import { HUB_ORIGIN } from './env';
import { ensureProfileStack } from './lib/profile-stack';
import { renderProfileBadge, renderProfileFFChip, renderProfileFlightPill, renderProfileClaimButton } from './inject/profile-badges';
import { renderAttackOverlay } from './inject/attack-overlay';
import { startClaimBanner } from './inject/claim-banner';
import { renderProfileIntel } from './inject/profile-intel';
import { maybeRenderActivityChip } from './inject/activity-chip';
import { applyBountiesOverlay } from './inject/bounties-overlay';
import { applyFactionRosterOverlay } from './inject/faction-roster-overlay';
import { applyHospitalOverlay } from './inject/hospital-overlay';
import { applyJailOverlay } from './inject/jail-overlay';
import { applyHalloffameOverlay } from './inject/halloffame-overlay';
import { applyPinnedNavsOverlay } from './inject/pinned-navs-overlay';
import { renderArmouryOverlay } from './inject/armoury-overlay';
import { applyRetalsOverlay } from './inject/retals-overlay';
import { renderTravelOverlay } from './inject/travel-overlay';
import { applyImarketOverlay } from './inject/imarket-overlay';
import { renderOcOverlay } from './inject/oc-overlay';
import { applyAmbientPillsOverlay } from './inject/ambient-pills-overlay';
import { renderLootOverlay } from './inject/loot-overlay';
import { renderStocksOverlay } from './inject/stocks-overlay';
import { startNotificationToasts } from './inject/notification-toasts';
import { startHeartbeat } from './inject/heartbeat';
import { startStatusChip } from './inject/status-chip';
import { startMentionAlerts } from './inject/mention-alerts';
import { startChatDock } from './inject/chat-dock';
import { ensureNativePermission } from './lib/notifications';
import type { CompanionAuth, WarOffLimits } from './types';

// Caches — keyed by absolute timestamps for expiry checking.
let warIdCache: { value: number | null; until: number } = { value: null, until: 0 };
let offLimitsCache: { byPlayer: Map<number, WarOffLimits>; until: number } | null = null;
const WAR_TTL_MS = 60_000;
const OFFLIMITS_TTL_MS = 30_000;

// Refresh dedupe — refresh() has four entry points (interval, URL watcher,
// auth listener, tm-companion-refresh event) and the URL watcher's
// MutationObserver can fire dozens of times per second on heavy pages.
// Without these guards we kick off the same heavyweight fetch bursts.
// See lib/refresh-dedupe.ts for the full rationale. 250ms coalesces the
// observer bursts without making teammate flag changes feel laggy — well
// below the OFFLIMITS_TTL_MS (30s) polling cadence so periodic refreshes
// always pass through.
const REFRESH_DEDUPE_WINDOW_MS = 250;
let refreshInFlight = false;
let lastRefreshedHref: string | null = null;
let lastRefreshedAt = 0;

async function getWarId(auth: CompanionAuth): Promise<number | null> {
  if (Date.now() < warIdCache.until) return warIdCache.value;
  try {
    const war = await fetchCurrentWar(auth);
    warIdCache = { value: war.war_id, until: Date.now() + WAR_TTL_MS };
    return war.war_id;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      // Token died — clear it so the chip flips to "not connected" on its
      // next 5s tick. No need to render an extra prompt here.
      clearAuth();
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
  // Dedupe gate — see REFRESH_DEDUPE_WINDOW_MS above. We do NOT queue the
  // dropped invocation: if an interesting state change happened, the
  // in-flight refresh or the next interval tick will pick it up. Queuing
  // would defeat the point (the burst is the symptom we're treating).
  const currentHref = window.location.href;
  const now = Date.now();
  if (
    shouldSkipRefresh(
      now,
      currentHref,
      lastRefreshedHref,
      lastRefreshedAt,
      REFRESH_DEDUPE_WINDOW_MS,
      refreshInFlight,
    )
  ) {
    return;
  }
  refreshInFlight = true;
  lastRefreshedHref = currentHref;
  lastRefreshedAt = now;
  try {
    await refreshInner();
  } finally {
    // Clear in try/finally so a thrown error inside refreshInner() doesn't
    // wedge the guard permanently (would block every future refresh).
    refreshInFlight = false;
  }
}

async function refreshInner(): Promise<void> {
  const match = matchPage();

  // Profile pages mount up to 7 async overlays (off-limits, FF chip, intel,
  // claim button, flight pill, activity chip, loot). Pre-mount their container
  // synchronously so the fetch resolve order doesn't translate into layout
  // shifts. Without this we measured CLS 0.61 / "worst cluster: 7 shifts" on
  // /profile.php. Each renderer attaches into this stack instead of running
  // its own insertBefore on the page anchor.
  if (match.kind === 'profile' && getAuth()) ensureProfileStack();

  // Pinned navs panel — present on every Torn page while authed, not gated on
  // page kind. Cheap idempotency inside the helper means re-runs no-op.
  if (getAuth()) void applyPinnedNavsOverlay();

  // Bounty page is page-level, not per-player — handle here before the
  // unknown-page early return.
  if (match.kind === 'bounties') {
    if (getAuth()) {
      void applyBountiesOverlay();
    }
    return;
  }

  if (match.kind === 'stocks') {
    if (getAuth()) {
      void renderStocksOverlay();
    }
    return;
  }

  if (match.kind === 'faction') {
    const auth = getAuth();
    if (auth && match.faction_id) {
      const warId = await getWarId(auth);
      void applyFactionRosterOverlay({ factionId: match.faction_id, warId });
    }
    return;
  }

  if (match.kind === 'hospital') {
    const auth = getAuth();
    if (auth) {
      const warId = await getWarId(auth);
      void applyHospitalOverlay({ warId });
    }
    return;
  }

  if (match.kind === 'jail') {
    const auth = getAuth();
    if (auth) {
      const warId = await getWarId(auth);
      void applyJailOverlay({ warId });
    }
    return;
  }

  if (match.kind === 'halloffame') {
    if (getAuth()) {
      void applyHalloffameOverlay();
    }
    return;
  }

  if (match.kind === 'armoury') {
    if (getAuth()) {
      void renderArmouryOverlay();
    }
    return;
  }

  if (match.kind === 'retals') {
    const auth = getAuth();
    if (auth) {
      const warId = await getWarId(auth);
      void applyRetalsOverlay({ warId });
    }
    return;
  }

  if (match.kind === 'travel') {
    if (getAuth()) {
      void renderTravelOverlay();
    }
    return;
  }

  if (match.kind === 'imarket') {
    if (getAuth()) {
      void applyImarketOverlay();
    }
    return;
  }

  if (match.kind === 'oc') {
    if (getAuth()) {
      void renderOcOverlay();
    }
    return;
  }

  if (match.kind === 'ambient') {
    const auth = getAuth();
    if (auth) {
      const warId = await getWarId(auth);
      void applyAmbientPillsOverlay({ warId });
    }
    return;
  }

  if (match.kind === 'unknown' || !match.player_id) {
    renderProfileBadge(null);
    return;
  }

  const auth = getAuth();
  if (!auth) {
    // The persistent status chip in the corner is now the canonical
    // "not connected" UI — no need for an extra banner here. Just clear
    // any leftover injections from a previous render.
    renderProfileBadge(null);
    return;
  }

  // War + off-limits are needed both for the OFF-LIMITS badge AND as
  // context for the intel card's action buttons. Fetch both before
  // rendering so the action row knows whether to show "Flag" or "Edit
  // off-limits".
  const warId = await getWarId(auth);
  let off: WarOffLimits | null = null;
  if (warId) {
    const map = await getOffLimitsMap(auth, warId);
    off = map.get(match.player_id) || null;
  }

  if (match.kind === 'profile') {
    renderProfileBadge(off);
    renderProfileFFChip(match.player_id);
  } else if (match.kind === 'attack') {
    renderAttackOverlay(off);
  }

  // Intel card only on /profile.php — on /page.php?sid=attack it shifted the
  // attack button down and broke muscle memory. Players can still see full
  // intel by visiting the target's profile beforehand.
  if (match.kind === 'profile') {
    void renderProfileIntel(match.player_id, { warId, offLimits: off });
    // Hit-call claim button for the profile owner (Phase 4B). Self-claim is
    // filtered inside renderClaimButton, and the whole thing is a no-op
    // when the hit_calling feature flag is off.
    renderProfileClaimButton(match.player_id, off?.player_name || `Player ${match.player_id}`);
  }

  // Loot NPC overlay: only renders if the visited profile happens to be a
  // loot NPC the backend knows about (Duke, Leslie, Jimmy, Bruno, etc).
  // No-ops on regular player profiles, so it's safe to call unconditionally.
  if (match.kind === 'profile') {
    void renderLootOverlay(match.player_id);
  }

  // Phase 2B flight pill — self-gated on flags.flights. Surfaces on both
  // profile and attack pages because the attacker still wants to know if the
  // target is mid-flight (you can't hit travelers).
  if (match.kind === 'profile' || match.kind === 'attack') {
    void renderProfileFlightPill(match.player_id);
  }

  // Most-active-window chip (Phase 3B). Self-gates on the `activity` feature
  // flag and on whether the backend has any data for this player. Anchored to
  // the profile-badge host so it visually clusters with the other profile
  // overlay cards.
  if (match.kind === 'profile') {
    const anchorEl =
      document.querySelector<HTMLElement>('[data-tm-companion="profile-badge"]') ||
      document.querySelector<HTMLElement>('[data-tm-companion="profile-intel"]') ||
      document.body;
    void maybeRenderActivityChip(anchorEl, match.player_id);
  }
}

/** Clear server-data caches so the next refresh() pulls fresh state.
 * Fired from inject modules after successful write-back actions
 * (flag off-limits, save target, etc) so the UI reflects reality
 * without waiting for the regular 30s poll.
 */
function invalidateAndRefresh(): void {
  warIdCache = { value: null, until: 0 };
  offLimitsCache = null;
  void refresh();
}

function bootstrap(): void {
  // Sprint 1 quick win: warm the TCP+TLS socket to hub.tri.ovh before
  // anything else runs. The cost is one <link> tag in <head>; the win is
  // ~50-200ms shaved off the first fetch on a fresh tab.
  injectPreconnect(HUB_ORIGIN);

  // Sprint 1.5 quick win: anonymous RUM beacon. Dark by default on the
  // backend (ENABLE_RUM=False) — beacons fly but the endpoint drops them
  // until privacy review is signed off. See extension/docs/rum-privacy-review.md.
  startRumWire();

  // FFScouter-parity feature flags: prime the cache on boot and refresh
  // every 60 s. ``getFeatureFlags()`` (the sync accessor used by overlays)
  // returns all-false until this resolves, which is the desired "dark by
  // default" behaviour. We don't await — overlays gate themselves and
  // re-run after the first poll.
  void fetchFeatureFlags();
  setInterval(() => void fetchFeatureFlags(), 60_000);

  // Inject modules trigger this when they mutate server state, so the main
  // refresh loop re-fetches before its next interval tick.
  window.addEventListener('tm-companion-refresh', () => invalidateAndRefresh());

  // PDA round-trip: the hub auth page may have bounced us back here with
  // the token packed into the URL fragment. Pick it up before the first
  // render so the launch button paints in the connected state and we don't
  // re-trigger the "not connected" onboard popover.
  if (consumeAuthFragment()) {
    void ensureNativePermission();
  }

  // Listen for token handoff from hub.tri.ovh/extension-auth.
  installAuthListener(() => {
    // Re-run refresh with the fresh token.
    void refresh();
    // Ask for native notification permission now that the user just
    // performed a deliberate "yes, integrate this" action — best moment
    // for the browser permission prompt.
    void ensureNativePermission();
  });

  // Warm the feature-flag cache up front (60s TTL inside fetchFeatureFlags).
  // Overlays that gate on flags (FF chip, etc.) read getFeatureFlags()
  // synchronously — without this prefetch the first paint after a fresh
  // page load would always see all-false and silently skip the overlay.
  void fetchFeatureFlags();

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
  startStatusChip();
  startChatDock();
  startNotificationToasts();
  startMentionAlerts();
  startHeartbeat();
  // Live claim banner + bus pump. Internally feature-flag gated and a no-op
  // when hit_calling is off, so it's safe to start unconditionally.
  void startClaimBanner();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
