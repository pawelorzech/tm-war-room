// Threat-coloring overlay for the Torn bounty board.
//
// On /bounties.php (and /loader.php?sid=bounties) we fetch /api/bounties
// once, then walk the page for any anchor pointing at a profile XID. For
// every matched row we:
//   1. Tint the row background by threat tier (green easy → red lethal)
//   2. Inject a small badge under the row showing TM threat label + source
//
// We DO NOT modify Torn's own DOM structure — we only style and append.
// If Torn rewrites the bounty list (which it does on filter changes), the
// MutationObserver in lib/torn-pages.ts triggers a re-render through the
// main refresh() loop.

import { ApiError, fetchBounties } from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import type { BountyItem, ThreatLabel } from '../types';

const STYLE_ATTR = 'data-tm-bounty-styled';
const BADGE_ATTR = 'data-tm-bounty-badge';
const STYLE_TAG_ID = 'tm-companion-bounty-styles';

const TIER_COLOR: Record<ThreatLabel, { bg: string; label: string }> = {
  trivial: { bg: 'rgba(63,185,80,0.08)', label: '#3fb950' },
  easy: { bg: 'rgba(63,185,80,0.12)', label: '#3fb950' },
  moderate: { bg: 'rgba(210,153,34,0.10)', label: '#d29922' },
  dangerous: { bg: 'rgba(240,136,62,0.14)', label: '#f0883e' },
  lethal: { bg: 'rgba(248,81,73,0.16)', label: '#f85149' },
  unknown: { bg: 'transparent', label: '#8b949e' },
};

let _bountiesCache: { ts: number; map: Map<number, BountyItem> } | null = null;
const TTL_MS = 60_000;

async function getBountiesMap(): Promise<Map<number, BountyItem>> {
  if (_bountiesCache && Date.now() - _bountiesCache.ts < TTL_MS) return _bountiesCache.map;
  const auth = getAuth();
  if (!auth) return new Map();
  try {
    const resp = await fetchBounties(auth);
    const map = new Map<number, BountyItem>();
    for (const b of resp.bounties) map.set(b.target_id, b);
    _bountiesCache = { ts: Date.now(), map };
    return map;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) clearAuth();
    return new Map();
  }
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = `
    [${BADGE_ATTR}] {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      margin: 4px 0;
      font-size: 11px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      border-radius: 10px;
      background: rgba(22, 27, 34, 0.85);
      border: 1px solid rgba(255,255,255,0.1);
      color: #c9d1d9;
      white-space: nowrap;
    }
    [${BADGE_ATTR}] .tm-tier {
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 10px;
    }
    [${BADGE_ATTR}] .tm-source {
      color: #6e7681;
      font-size: 10px;
      font-weight: 400;
    }
  `;
  document.head.appendChild(style);
}

function findRowContainer(anchor: HTMLElement): HTMLElement | null {
  // Walk up looking for a "row" container — Torn uses several patterns
  // depending on layout: <li>, <tr>, or a div with class containing
  // "bounty", "list", "row", or "user-info".
  let el: HTMLElement | null = anchor;
  for (let i = 0; el && i < 6; i += 1) {
    if (el.tagName === 'LI' || el.tagName === 'TR') return el;
    const cls = el.className || '';
    if (typeof cls === 'string') {
      if (/bounty|user-info-list|user-row|listed-row/i.test(cls)) return el;
    }
    el = el.parentElement;
  }
  return anchor.parentElement;
}

function applyTo(anchor: HTMLAnchorElement, bounty: BountyItem): void {
  const row = findRowContainer(anchor);
  if (!row) return;
  if (row.getAttribute(STYLE_ATTR) === String(bounty.threat_label)) return; // already styled
  row.setAttribute(STYLE_ATTR, bounty.threat_label);

  const tier = TIER_COLOR[bounty.threat_label] || TIER_COLOR.unknown;
  if (tier.bg !== 'transparent') {
    row.style.backgroundColor = tier.bg;
    row.style.transition = 'background-color 0.2s ease-out';
  }

  // Remove any old badge from a previous label.
  row.querySelectorAll(`[${BADGE_ATTR}]`).forEach((b) => b.remove());

  const badge = document.createElement('span');
  badge.setAttribute(BADGE_ATTR, '1');
  badge.style.color = tier.label;
  const score = Math.round(bounty.threat_score);
  const sourceHint =
    bounty.threat_source === 'spy'
      ? 'spy'
      : bounty.threat_source === 'estimated'
        ? 'estimated'
        : 'no data';
  badge.innerHTML = `⚡ <span class="tm-tier">${escapeHtml(bounty.threat_label)}</span> · ${score} <span class="tm-source">(${escapeHtml(sourceHint)})</span>`;
  anchor.insertAdjacentElement('afterend', badge);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function applyBountiesOverlay(): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  const map = await getBountiesMap();
  if (map.size === 0) return;

  ensureStyles();

  // Find all profile links — bounty rows render the target name as
  // <a href="/profiles.php?XID=…">.
  const anchors = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="profiles.php?XID="], a[href*="profile.php?XID="]',
  );
  anchors.forEach((a) => {
    const m = a.href.match(/XID=(\d+)/);
    if (!m) return;
    const pid = parseInt(m[1], 10);
    const b = map.get(pid);
    if (!b) return;
    applyTo(a, b);
  });
}
