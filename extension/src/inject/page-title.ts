// Browser tab title clearer — surfaces useful self-state in document.title so
// tab switchers can see "Hospital — 12m left" without having to focus the tab.
//
// Data source: Torn's own sidebar status block. We do NOT add a new API call;
// Torn already paints these widgets on every page. The companion observes the
// DOM and rewrites document.title. Honest signal — if we can't read the
// state, we leave the title alone (never lie).

import { startPolling } from '../lib/poll';

export type PlayerTitleState =
  | { kind: 'hospital'; secondsLeft: number }
  | { kind: 'jail'; secondsLeft: number }
  | { kind: 'traveling'; destination: string; secondsLeft: number }
  | { kind: 'unknown' };

// Known Torn destinations — short codes keep the title prefix under the
// ~30-char mobile cap. Anything not in the table falls back to the first
// 8 chars (covers `Hawaii`, `Canada`, etc.).
const DESTINATION_SHORT: Record<string, string> = {
  'United Kingdom': 'UK',
  'United Arab Emirates': 'UAE',
  'South Africa': 'S.Africa',
  Switzerland: 'CH',
  Argentina: 'AR',
  Mexico: 'MX',
  Japan: 'JP',
  China: 'CN',
  Hawaii: 'HI',
  Canada: 'CA',
  'Cayman Islands': 'Cayman',
};

const MAX_PREFIX = 30;
const SUFFIX = ' | TM Hub';

// We capture the page's original title on first invocation, then always
// recompute from this baseline — never parse our own output, never accumulate.
let originalTitle: string | null = null;
let pollStarted = false;

/** Test-only — reset module-level state between unit tests. */
export function _resetPageTitleForTests(): void {
  originalTitle = null;
  pollStarted = false;
}

function shortDestination(name: string): string {
  if (DESTINATION_SHORT[name]) return DESTINATION_SHORT[name];
  return name.length > 8 ? name.slice(0, 8) : name;
}

function formatCountdown(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}h ${String(r).padStart(2, '0')}m`;
}

export function computeTitle(state: PlayerTitleState, original: string): string {
  if (state.kind === 'unknown') return original;
  let prefix: string;
  if (state.kind === 'hospital') {
    prefix = `Hospital — ${formatCountdown(state.secondsLeft)} left`;
  } else if (state.kind === 'jail') {
    prefix = `Jail — ${formatCountdown(state.secondsLeft)}`;
  } else {
    prefix = `→ ${shortDestination(state.destination)} ${formatCountdown(state.secondsLeft)}`;
  }
  if (prefix.length > MAX_PREFIX) prefix = prefix.slice(0, MAX_PREFIX).trimEnd();
  return prefix + SUFFIX;
}

function parseCountdown(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.trim();
  // hh:mm:ss or mm:ss
  const m = t.match(/^(?:(\d+):)?(\d+):(\d+)$/);
  if (m) {
    const h = parseInt(m[1] || '0', 10);
    const mins = parseInt(m[2], 10);
    const s = parseInt(m[3], 10);
    if ([h, mins, s].some((n) => Number.isNaN(n))) return null;
    return h * 3600 + mins * 60 + s;
  }
  // bare integer
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return null;
}

export function readPlayerState(doc: Document): PlayerTitleState {
  // Hospital
  const hospitalEl = doc.querySelector('[data-tm-self-hospital]');
  if (hospitalEl) {
    const secs = parseCountdown(hospitalEl.getAttribute('data-seconds'));
    if (secs !== null && secs > 0) return { kind: 'hospital', secondsLeft: secs };
  }
  // Jail
  const jailEl = doc.querySelector('[data-tm-self-jail]');
  if (jailEl) {
    const secs = parseCountdown(jailEl.getAttribute('data-seconds'));
    if (secs !== null && secs > 0) return { kind: 'jail', secondsLeft: secs };
  }
  // Traveling
  const travelEl = doc.querySelector('[data-tm-self-travel]');
  if (travelEl) {
    const destination = travelEl.getAttribute('data-destination') || '';
    const secs = parseCountdown(travelEl.getAttribute('data-seconds'));
    if (destination && secs !== null && secs > 0) {
      return { kind: 'traveling', destination, secondsLeft: secs };
    }
  }
  return { kind: 'unknown' };
}

function tick(): void {
  if (originalTitle === null) originalTitle = document.title;
  const state = readPlayerState(document);
  const next = computeTitle(state, originalTitle);
  if (document.title !== next) document.title = next;
}

export function startPageTitle(): void {
  if (pollStarted) return;
  pollStarted = true;
  if (originalTitle === null) originalTitle = document.title;
  // SPA-style refreshes inside Torn dispatch this event; piggyback so the
  // title updates without waiting for the 30s tick.
  window.addEventListener('tm-companion-refresh', tick);
  startPolling({
    name: 'page-title',
    intervalMs: 30_000,
    fn: tick,
  });
}
