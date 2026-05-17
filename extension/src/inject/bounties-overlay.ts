// Threat-tier + spy-estimate overlay for the Torn bounty board.
//
// On /bounties.php (and /page.php?sid=bounties or legacy /loader.php?sid=bounties)
// we fetch /api/bounties once, then for each target lazily fetch their spy
// estimate and current-war off-limits flag. The row gets ONE badge wrapper
// containing the existing threat-tier pill plus an optional spy bucket pill
// (verified / estimate / rough_guess / endgame). War-off-limits targets get
// strike-through + red border + tooltip on the spy pill so flagged enemies
// don't look attractive even when the bucket says "easy".
//
// Per-target spy fetches are cached 5 min (404s cached as null so we don't
// retry every poll). War-id + off-limits are cached together for 60 s.

import { ApiError, fetchBounties, fetchCurrentWar, fetchOffLimits, fetchSpyEstimate } from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { decorateRows } from '../lib/row-decorator';
import { showToast } from '../lib/notifications';
import type { BountyItem, ThreatLabel, WarOffLimits } from '../types';
import type { SpyEstimate as SpyEstimateDisplay, Bucket } from '../lib/spy-display';
import { bucketStyle, formatTotalRange, bucketCaption } from '../lib/spy-display';
import { escapeHtml } from '../lib/format';

const TIER_COLOR: Record<ThreatLabel, { bg: string; label: string }> = {
  trivial: { bg: 'rgba(63,185,80,0.08)', label: '#3fb950' },
  easy: { bg: 'rgba(63,185,80,0.12)', label: '#3fb950' },
  moderate: { bg: 'rgba(210,153,34,0.10)', label: '#d29922' },
  dangerous: { bg: 'rgba(240,136,62,0.14)', label: '#f0883e' },
  lethal: { bg: 'rgba(248,81,73,0.16)', label: '#f85149' },
  unknown: { bg: 'transparent', label: '#8b949e' },
};

interface BountyRowData {
  bounty: BountyItem;
  spy: SpyEstimateDisplay | null;
  offLimits: WarOffLimits | null;
}

const BOUNTIES_TTL_MS = 60_000;
const WAR_TTL_MS = 60_000;
const OFFLIMITS_TTL_MS = 60_000;
const SPY_TTL_MS = 5 * 60_000;

let _bountiesCache: { ts: number; map: Map<number, BountyItem> } | null = null;
let _warCache: { ts: number; warId: number | null } | null = null;
let _offLimitsCache: { ts: number; map: Map<number, WarOffLimits> } | null = null;
// Per-target spy cache. `null` value (cached) means "we know there's no spy
// data" — typically a 404 from the API. Don't refetch on every poll.
const _spyCache: Map<number, { ts: number; spy: SpyEstimateDisplay | null }> = new Map();
let _toastShown = false;

/** Test-only — reset all module-level caches between unit tests. */
export function _resetBountiesCacheForTests(): void {
  _bountiesCache = null;
  _warCache = null;
  _offLimitsCache = null;
  _spyCache.clear();
  _toastShown = false;
}

async function getBountiesMap(): Promise<Map<number, BountyItem>> {
  if (_bountiesCache && Date.now() - _bountiesCache.ts < BOUNTIES_TTL_MS) return _bountiesCache.map;
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

async function getWarId(): Promise<number | null> {
  if (_warCache && Date.now() - _warCache.ts < WAR_TTL_MS) return _warCache.warId;
  const auth = getAuth();
  if (!auth) return null;
  try {
    const war = await fetchCurrentWar(auth);
    _warCache = { ts: Date.now(), warId: war.war_id };
    return war.war_id;
  } catch {
    _warCache = { ts: Date.now(), warId: null };
    return null;
  }
}

async function getOffLimitsMap(): Promise<Map<number, WarOffLimits>> {
  if (_offLimitsCache && Date.now() - _offLimitsCache.ts < OFFLIMITS_TTL_MS) return _offLimitsCache.map;
  const warId = await getWarId();
  const auth = getAuth();
  if (!auth || warId === null) {
    const empty = new Map<number, WarOffLimits>();
    _offLimitsCache = { ts: Date.now(), map: empty };
    return empty;
  }
  try {
    const resp = await fetchOffLimits(auth, warId);
    const map = new Map<number, WarOffLimits>();
    for (const entry of resp.entries) map.set(entry.player_id, entry);
    _offLimitsCache = { ts: Date.now(), map };
    return map;
  } catch {
    const empty = new Map<number, WarOffLimits>();
    _offLimitsCache = { ts: Date.now(), map: empty };
    return empty;
  }
}

async function getSpyEstimate(playerId: number): Promise<SpyEstimateDisplay | null> {
  const cached = _spyCache.get(playerId);
  if (cached && Date.now() - cached.ts < SPY_TTL_MS) return cached.spy;
  const auth = getAuth();
  if (!auth) return null;
  try {
    const spy = (await fetchSpyEstimate(auth, playerId)) as unknown as SpyEstimateDisplay;
    _spyCache.set(playerId, { ts: Date.now(), spy });
    return spy;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      _spyCache.set(playerId, { ts: Date.now(), spy: null });
      return null;
    }
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      clearAuth();
      return null;
    }
    // Genuine 5xx — show one toast per session so the user knows something
    // is off, then keep the row quiet.
    if (!_toastShown) {
      _toastShown = true;
      try {
        showToast({
          id: 'bounties-spy-error',
          title: 'Spy data unavailable',
          body: 'Could not fetch spy estimates for bounty targets — they will appear without a bucket badge.',
          tone: 'warn',
        });
      } catch {
        // showToast itself failing must not crash decoration; ignore.
      }
    }
    return null;
  }
}

async function buildBountyRowMap(): Promise<Map<number, BountyRowData>> {
  const bounties = await getBountiesMap();
  if (bounties.size === 0) return new Map();
  const offLimits = await getOffLimitsMap();
  const out = new Map<number, BountyRowData>();
  for (const [pid, b] of bounties) {
    const spy = await getSpyEstimate(pid);
    out.set(pid, {
      bounty: b,
      spy,
      offLimits: offLimits.get(pid) ?? null,
    });
  }
  return out;
}

const STYLES = `
  [data-tm-bounty-badge] {
    display: inline-flex;
    align-items: center;
    gap: 6px;
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
  [data-tm-bounty-badge] .tm-spy {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 6px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(0,0,0,0.25);
    font-size: 10px;
  }
  [data-tm-bounty-badge] .tm-spy.tm-bucket-verified   { color: #56d364; border-color: #3fb950; }
  [data-tm-bounty-badge] .tm-spy.tm-bucket-estimate   { color: #e8b339; border-color: #d29922; }
  [data-tm-bounty-badge] .tm-spy.tm-bucket-rough_guess{ color: #f5a05a; border-color: #f5a05a; }
  [data-tm-bounty-badge] .tm-spy.tm-bucket-endgame    { color: #ff7b72; border-color: #b62324; background: rgba(182,35,36,0.18); }
  [data-tm-bounty-badge] .tm-spy.tm-off-limits {
    text-decoration: line-through;
    border-color: #f85149;
    color: #f85149;
    opacity: 0.85;
  }
  [data-tm-bounty-badge] .tm-spy .tm-bucket-label {
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 9px;
    font-weight: 700;
  }
  /* Mobile compact: drop the bucket caption + range text below 600px and keep
     just the colored chip + label. Matches the precedent in status-chip.ts. */
  @media (max-width: 600px) {
    [data-tm-bounty-badge] .tm-caption { display: none; }
  }
`;

function buildSpyPill(spy: SpyEstimateDisplay, offLimits: WarOffLimits | null): HTMLElement {
  const pill = document.createElement('span');
  pill.classList.add('tm-spy');
  const bucket: Bucket = spy.bucket ?? 'rough_guess';
  pill.classList.add(`tm-bucket-${bucket}`);
  const style = bucketStyle(bucket);
  const rangeText = formatTotalRange(spy.total, spy.total_range, bucket);
  const caption = bucketCaption(spy);
  const rangeMarkup = rangeText ? `<span class="tm-range">${escapeHtml(rangeText)}</span>` : '';
  const captionMarkup = caption ? `<span class="tm-caption">${escapeHtml(caption)}</span>` : '';
  pill.innerHTML = `<span class="tm-bucket-label">${escapeHtml(style.badgeText)}</span> ${rangeMarkup} ${captionMarkup}`.trim();
  if (offLimits) {
    pill.classList.add('tm-off-limits');
    pill.setAttribute(
      'title',
      `WAR OFF-LIMITS — ${escapeHtml(offLimits.reason || 'medded/dipped')} (flagged by ${escapeHtml(offLimits.set_by_name || 'faction')})`,
    );
  } else {
    pill.setAttribute('title', caption);
  }
  return pill;
}

export async function applyBountiesOverlay(): Promise<void> {
  await decorateRows<BountyRowData>({
    featureId: 'bounty',
    buildMap: buildBountyRowMap,
    // happy-dom's CSS attribute-selector parser treats `?` as a regex special
    // character ("Invalid regular expression: /?XID=/"), so the default
    // selector with `profiles.php?XID=` cannot be parsed during unit tests.
    // Real browsers parse `?` fine. `XID=` is unique to profile links so this
    // narrower selector is functionally equivalent in production AND
    // happy-dom-compatible in tests.
    anchorSelector: 'a[href*="XID="]',
    styles: STYLES,
    stateKey: (d) => {
      const bucket = d.spy?.bucket ?? 'none';
      const lo = d.spy?.total_range?.[0] ?? '';
      const hi = d.spy?.total_range?.[1] ?? '';
      const off = d.offLimits ? '1' : '0';
      return `${d.bounty.threat_label}|${bucket}|${lo}|${hi}|${off}`;
    },
    render: ({ row, data, appendBadge }) => {
      const tier = TIER_COLOR[data.bounty.threat_label] || TIER_COLOR.unknown;
      if (tier.bg !== 'transparent') {
        row.style.backgroundColor = tier.bg;
        row.style.transition = 'background-color 0.2s ease-out';
      }

      const wrapper = document.createElement('span');
      const tierPill = document.createElement('span');
      tierPill.classList.add('tm-tier-pill');
      tierPill.style.color = tier.label;
      const score = Math.round(data.bounty.threat_score);
      const sourceHint =
        data.bounty.threat_source === 'spy'
          ? 'spy'
          : data.bounty.threat_source === 'estimated'
            ? 'estimated'
            : 'no data';
      tierPill.innerHTML = `⚡ <span class="tm-tier">${escapeHtml(data.bounty.threat_label)}</span> · ${score} <span class="tm-source">(${escapeHtml(sourceHint)})</span>`;
      wrapper.appendChild(tierPill);

      if (data.spy) {
        wrapper.appendChild(buildSpyPill(data.spy, data.offLimits));
      }

      appendBadge(wrapper);
    },
  });
}
