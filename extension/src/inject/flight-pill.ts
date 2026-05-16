// Shared flight pill (FFScouter parity, Phase 2B).
//
// Renders "✈️ Lands in <countdown> (<destination>, <class>)" for a single
// player when the backend says they're currently airborne. The renderer is
// host-agnostic — caller passes the DOM node where the pill should attach
// (profile header sidebar, faction roster row, etc).
//
// Two safety rails:
//   1. The feature flag check runs first. If ``flags.flights`` is off the
//      function bails before any network call so a dark-launched flag stays
//      truly dark.
//   2. The countdown timer self-stops once the host element leaves the DOM
//      (MutationObserver on body), so SPA-style nav on torn.com doesn't
//      leak intervals.

import { ApiError, fetchFlight } from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { getFeatureFlags } from '../env';
import { escapeHtml } from '../lib/format';
import type { FlightRow } from '../types';

const PILL_ATTR = 'data-tm-flight-pill';
const STYLE_ID = 'tm-companion-flight-pill-styles';

const STYLES = `
  [${PILL_ATTR}] {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    margin: 2px 4px;
    font-size: 11px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    border-radius: 10px;
    background: rgba(56,139,253,0.16);
    border: 1px solid rgba(56,139,253,0.30);
    color: #79c0ff;
    white-space: nowrap;
    vertical-align: middle;
    cursor: help;
  }
  [${PILL_ATTR}] .label { letter-spacing: 0.02em; }
  [${PILL_ATTR}].soon {
    background: rgba(210,153,34,0.16);
    border-color: rgba(210,153,34,0.30);
    color: #d29922;
  }
  [${PILL_ATTR}].landed {
    background: rgba(63,185,80,0.16);
    border-color: rgba(63,185,80,0.30);
    color: #3fb950;
  }
`;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function humanizeDuration(secs: number): string {
  if (secs <= 0) return 'landing now';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) {
    const s = secs % 60;
    return s > 0 && m < 5 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function humanizeAgo(unixTs: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - unixTs);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function prettyDestination(raw: string): string {
  // Normalise scheduler-side canonical keys back to human labels.
  const tidy = raw.replace(/_/g, ' ').trim();
  return tidy
    .split(' ')
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

function prettyTicketClass(raw: string): string {
  switch (raw) {
    case 'standard':
      return 'standard';
    case 'business':
      return 'business';
    case 'wlt':
      return 'WLT';
    case 'book':
      return 'travel book';
    default:
      return raw || 'standard';
  }
}

function renderPillContent(pill: HTMLElement, current: FlightRow): boolean {
  // Mutates the pill DOM in place. Returns true when the flight has landed
  // (predicted landing in the past) — caller uses that to stop the timer.
  const landsAt =
    typeof current.predicted_landed_at === 'number' && current.predicted_landed_at > 0
      ? current.predicted_landed_at
      : current.departed_at + 1560;
  const nowSec = Math.floor(Date.now() / 1000);
  const secsLeft = landsAt - nowSec;
  const dest = prettyDestination(current.destination);
  const cls = prettyTicketClass(current.ticket_class);

  pill.classList.remove('soon', 'landed');
  if (secsLeft <= 0) {
    pill.classList.add('landed');
    pill.innerHTML = `<span class="label">✈️ Landed (${escapeHtml(dest)}, ${escapeHtml(cls)})</span>`;
    return true;
  }
  if (secsLeft < 5 * 60) pill.classList.add('soon');

  pill.innerHTML = `<span class="label">✈️ Lands in ${escapeHtml(humanizeDuration(secsLeft))} (${escapeHtml(dest)}, ${escapeHtml(cls)})</span>`;

  const tooltip =
    `Departed ${humanizeAgo(current.departed_at)}\n` +
    `Source: scheduler tick (60s polling)`;
  pill.title = tooltip;
  return false;
}

function startTimer(pill: HTMLElement, current: FlightRow): void {
  // Update every 30s. Stop when the host detaches (SPA nav, manual remove)
  // or when the flight visibly lands.
  const tick = () => {
    if (!pill.isConnected) {
      clearInterval(intervalId);
      return;
    }
    const landed = renderPillContent(pill, current);
    if (landed) {
      // Stop polling once landed — a future tick from the scheduler will
      // mark the row closed, and the next fetchFlight will return null.
      clearInterval(intervalId);
    }
  };
  const intervalId = window.setInterval(tick, 30_000);
}

/** Render (or update, or remove) a single-player flight pill on the given
 *  host element. ``host`` is the container the pill should live inside — for
 *  example the profile sidebar `<div>`, or a faction roster row's badge slot.
 *
 *  Safe to call repeatedly: replaces any prior pill on the host.
 *  Bails silently when:
 *   - the flights feature flag is off,
 *   - we have no auth token,
 *   - the backend says the player isn't airborne.
 */
export async function maybeRenderFlightPill(
  host: HTMLElement,
  playerId: number,
): Promise<void> {
  if (!getFeatureFlags().flights) return;
  const auth = getAuth();
  if (!auth) return;

  let snapshot;
  try {
    snapshot = await fetchFlight(auth, playerId);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      clearAuth();
    }
    return;
  }
  const current = snapshot?.current ?? null;

  // Drop any prior pill — covers both "player just landed" and re-renders
  // after navigation to a different profile in the same SPA session.
  host.querySelectorAll(`[${PILL_ATTR}]`).forEach((n) => n.remove());
  if (!current) return;

  ensureStyles();

  const pill = document.createElement('span');
  pill.setAttribute(PILL_ATTR, '1');
  renderPillContent(pill, current);
  host.appendChild(pill);
  startTimer(pill, current);
}

/** Lower-level helper for callers that already have a row of FlightRows
 *  (e.g. the faction roster overlay that wants to render one pill per row
 *  without an extra fetch per player).
 */
export function renderFlightPillFromRow(host: HTMLElement, current: FlightRow): void {
  if (!getFeatureFlags().flights) return;
  host.querySelectorAll(`[${PILL_ATTR}]`).forEach((n) => n.remove());
  ensureStyles();
  const pill = document.createElement('span');
  pill.setAttribute(PILL_ATTR, '1');
  renderPillContent(pill, current);
  host.appendChild(pill);
  startTimer(pill, current);
}
