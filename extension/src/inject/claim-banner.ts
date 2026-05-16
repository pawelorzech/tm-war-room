// Live "who just claimed what" banner.
//
// Runs once per Torn tab. Owns the single streamClaims() loop and pumps the
// claim-bus so every renderClaimButton() instance gets notified without
// running its own poll.
//
// Visible UI: a slim auto-dismissing strip at the top of the page (Shadow
// DOM, fixed positioning) that flashes for ~10s whenever a claim is
// created / released / hit.

import {
  fetchFeatureFlags,
  streamClaims,
  type ClaimStreamEvent,
} from '../lib/api';
import { getAuth } from '../lib/auth';
import {
  applyCreated,
  applyHit,
  applyReleased,
  applyExpired,
  setSnapshot,
} from '../lib/claim-bus';
import type { ClaimRow } from '../types';
import { ensurePersistentHost } from '../lib/persistent-host';
import { escapeHtml } from '../lib/format';

const HOST_KIND = 'claim-banner';
const STRIP_TTL_MS = 10_000;

const STYLES = `
  :host { all: initial; }
  .strip {
    position: fixed;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    max-width: calc(100vw - 24px);
    padding: 6px 12px;
    background: #161b22;
    color: #c9d1d9;
    border: 1px solid #30363d;
    border-left: 3px solid #58a6ff;
    border-radius: 8px;
    font: 600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 8px 24px rgba(0,0,0,0.55);
    z-index: 999901;
    opacity: 0;
    transition: opacity 0.2s ease-out;
  }
  .strip.visible { opacity: 1; }
  .strip.hit { border-left-color: #f85149; }
  .strip.released { border-left-color: #8b949e; }
  .strip.created { border-left-color: #58a6ff; }
  .strip .who { color: #58a6ff; }
  .strip .what { color: #f0f6fc; }
`;

let _started = false;
let _stop: (() => void) | null = null;

export async function startClaimBanner(): Promise<void> {
  if (_started) return;
  // Flag check is async; gate before we touch the DOM or open a stream.
  const flags = await fetchFeatureFlags();
  if (!flags.hit_calling) return;

  _started = true;
  const { shadow } = ensurePersistentHost({
    kind: HOST_KIND,
    zIndex: 999901,
  });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);

  _stop = streamClaims(getAuth, (event) => handleEvent(shadow, event));
}

export function stopClaimBanner(): void {
  if (_stop) _stop();
  _stop = null;
  _started = false;
}

function handleEvent(shadow: ShadowRoot, e: ClaimStreamEvent): void {
  switch (e.type) {
    case 'claim.snapshot':
      if (e.claims) setSnapshot(e.claims);
      return;
    case 'claim.created':
      if (e.claim) {
        applyCreated(e.claim);
        flash(shadow, e.claim, 'created', `claimed [${e.claim.target_id}]`);
      }
      return;
    case 'claim.released':
      if (e.claim) {
        applyReleased(e.claim);
        flash(shadow, e.claim, 'released', `released [${e.claim.target_id}]`);
      }
      return;
    case 'claim.hit':
      if (e.claim) {
        applyHit(e.claim);
        flash(shadow, e.claim, 'hit', `hit [${e.claim.target_id}]!`);
      }
      return;
    case 'claim.expired':
      if (e.claim) {
        applyExpired(e.claim);
        flash(shadow, e.claim, 'released', `claim on [${e.claim.target_id}] expired`);
      }
      return;
  }
}

function flash(
  shadow: ShadowRoot,
  claim: ClaimRow,
  variant: 'created' | 'released' | 'hit',
  verbText: string,
): void {
  const who = claim.claimer_name || `[${claim.claimer_id}]`;
  const strip = document.createElement('div');
  strip.className = `strip ${variant}`;
  strip.innerHTML =
    `<span class="who">${escapeHtml(who)}</span> ` +
    `<span class="what">${escapeHtml(verbText)}</span>`;
  shadow.appendChild(strip);
  // Animate in on next frame so the transition fires.
  requestAnimationFrame(() => strip.classList.add('visible'));
  setTimeout(() => {
    strip.classList.remove('visible');
    setTimeout(() => strip.remove(), 300);
  }, STRIP_TTL_MS);
}
