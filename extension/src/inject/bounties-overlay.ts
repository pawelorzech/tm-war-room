// Threat-coloring overlay for the Torn bounty board.
//
// On /bounties.php (and /page.php?sid=bounties or legacy /loader.php?sid=bounties)
// we fetch /api/bounties once, tint each row by threat tier, and inject a small
// badge under the row showing TM threat label + score + source.
//
// Mechanics live in lib/row-decorator.ts — this module just supplies the data
// source and the paint logic.

import { ApiError, fetchBounties } from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { decorateRows } from '../lib/row-decorator';
import type { BountyItem, ThreatLabel } from '../types';
import { escapeHtml } from '../lib/format';

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

const STYLES = `
  [data-tm-bounty-badge] {
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
  [data-tm-bounty-badge] .tm-tier {
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 10px;
  }
  [data-tm-bounty-badge] .tm-source {
    color: #6e7681;
    font-size: 10px;
    font-weight: 400;
  }
`;


export async function applyBountiesOverlay(): Promise<void> {
  await decorateRows<BountyItem>({
    featureId: 'bounty',
    buildMap: getBountiesMap,
    styles: STYLES,
    stateKey: (b) => b.threat_label,
    render: ({ row, data: b, appendBadge }) => {
      const tier = TIER_COLOR[b.threat_label] || TIER_COLOR.unknown;
      if (tier.bg !== 'transparent') {
        row.style.backgroundColor = tier.bg;
        row.style.transition = 'background-color 0.2s ease-out';
      }

      const badge = document.createElement('span');
      badge.style.color = tier.label;
      const score = Math.round(b.threat_score);
      const sourceHint =
        b.threat_source === 'spy'
          ? 'spy'
          : b.threat_source === 'estimated'
            ? 'estimated'
            : 'no data';
      badge.innerHTML = `⚡ <span class="tm-tier">${escapeHtml(b.threat_label)}</span> · ${score} <span class="tm-source">(${escapeHtml(sourceHint)})</span>`;
      appendBadge(badge);
    },
  });
}
