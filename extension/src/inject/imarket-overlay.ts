// Fair-price pills on Torn's item market listings.
//
// On /imarket.php (incl. /loader.php?sid=imarket and /page.php?sid=imarket)
// we fetch TM Hub's market prices once, then walk every listing row on the
// page and drop a small pill telling the player whether each asking price
// is below, at, or above the fair market value, with the % delta.
//
// Below -10%  → green "underpriced" pill
// Within ±10% → grey "fair" pill
// Above +10%  → red "overpriced" pill
//
// We don't use lib/row-decorator here because that helper keys off profile
// XID anchors — listings on /imarket.php have item ids, not player ids.

import { ApiError, fetchMarketPrices } from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import type { MarketPriceItem } from '../types';

const TTL_MS = 5 * 60_000;
const STYLE_ID = 'tm-companion-imarket-styles';
const ROW_ATTR = 'data-tm-imarket-styled';
const BADGE_ATTR = 'data-tm-imarket-badge';

let _cache: { ts: number; map: Map<number, MarketPriceItem> } | null = null;

async function getPricesMap(): Promise<Map<number, MarketPriceItem>> {
  if (_cache && Date.now() - _cache.ts < TTL_MS) return _cache.map;
  const auth = getAuth();
  if (!auth) return new Map();
  try {
    const resp = await fetchMarketPrices(auth);
    const map = new Map<number, MarketPriceItem>();
    for (const it of resp.items) map.set(it.id, it);
    _cache = { ts: Date.now(), map };
    return map;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) clearAuth();
    return new Map();
  }
}

const STYLES = `
  [${BADGE_ATTR}] {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    margin-left: 8px;
    font-size: 11px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    border-radius: 10px;
    background: rgba(22, 27, 34, 0.85);
    border: 1px solid rgba(255,255,255,0.1);
    color: #c9d1d9;
    white-space: nowrap;
    vertical-align: middle;
  }
  [${BADGE_ATTR}].tm-under { color: #3fb950; border-color: rgba(63,185,80,0.45); }
  [${BADGE_ATTR}].tm-over  { color: #f85149; border-color: rgba(248,81,73,0.45); }
  [${BADGE_ATTR}].tm-fair  { color: #8b949e; }
  [${BADGE_ATTR}] .tm-delta {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
`;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Listing rows. We try several selectors because Torn's imarket DOM has
// historically shifted between an old <ul class="sellerList"> structure and
// newer React-generated classes containing "seller". Order: most specific
// → most permissive. We dedupe via the row attribute below.
const LISTING_ROW_SELECTORS = [
  'ul.sellerList > li',
  'ul[class*="sellerList"] > li',
  'ul[class*="sellersList"] > li',
  'div[class*="sellerList"] > div',
  'div[class*="sellersList"] > div',
  'li[class*="sellerRow"]',
];

const PRICE_NODE_SELECTORS = [
  '.price',
  '[class*="price"]',
  '.cost',
  '[class*="cost"]',
];

function findPriceElement(row: HTMLElement): HTMLElement | null {
  for (const sel of PRICE_NODE_SELECTORS) {
    const el = row.querySelector<HTMLElement>(sel);
    if (el && (el.textContent ?? '').match(/\$\s?[\d,]+/)) return el;
  }
  return null;
}

function parsePriceText(text: string): number | null {
  const m = text.match(/\$\s?([\d,]+)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getCurrentItemId(): number | null {
  const url = new URL(window.location.href);
  const candidates = [
    url.searchParams.get('iid'),
    url.searchParams.get('itemID'),
    url.searchParams.get('itemId'),
    url.searchParams.get('item_id'),
    url.searchParams.get('ID'),
  ];
  for (const v of candidates) {
    if (v && /^\d+$/.test(v)) return parseInt(v, 10);
  }
  // Some Torn variants encode the item id in the path, e.g.
  // /imarket.php#/p=imarket&iid=123
  const hash = url.hash;
  if (hash) {
    const hm = hash.match(/iid=(\d+)/i);
    if (hm) return parseInt(hm[1], 10);
  }
  return null;
}

function formatPct(n: number): string {
  const sign = n >= 0 ? '+' : '−';
  const abs = Math.abs(n);
  if (abs < 10) return `${sign}${abs.toFixed(1)}%`;
  return `${sign}${Math.round(abs)}%`;
}

function buildPill(deltaPct: number): HTMLElement {
  const pill = document.createElement('span');
  pill.setAttribute(BADGE_ATTR, '1');
  let label: string;
  if (deltaPct < -10) {
    label = '⬇ underpriced';
    pill.classList.add('tm-under');
  } else if (deltaPct > 10) {
    label = '⬆ overpriced';
    pill.classList.add('tm-over');
  } else {
    label = 'fair';
    pill.classList.add('tm-fair');
  }
  pill.innerHTML = `${escapeHtml(label)} <span class="tm-delta">${escapeHtml(formatPct(deltaPct))}</span>`;
  pill.title = 'TM Hub fair-price compares the listing against Torn\'s market value for this item.';
  return pill;
}

function collectListingRows(): HTMLElement[] {
  const scope = document.getElementById('mainContainer') ?? document;
  const seen = new Set<HTMLElement>();
  for (const sel of LISTING_ROW_SELECTORS) {
    scope.querySelectorAll<HTMLElement>(sel).forEach((el) => seen.add(el));
  }
  return [...seen];
}

export async function applyImarketOverlay(): Promise<void> {
  const itemId = getCurrentItemId();
  if (!itemId) {
    // Browse/grid view — no listings to compare. Skip silently; a future
    // version could decorate item-tile links with their fair price.
    return;
  }

  const map = await getPricesMap();
  if (map.size === 0) return;
  const fair = map.get(itemId);
  if (!fair || fair.market_value <= 0) return;

  ensureStyles();

  const rows = collectListingRows();
  for (const row of rows) {
    const stateKey = String(fair.market_value);
    if (row.getAttribute(ROW_ATTR) === stateKey) continue;

    const priceEl = findPriceElement(row);
    if (!priceEl) continue;
    const listed = parsePriceText(priceEl.textContent ?? '');
    if (listed === null) continue;

    row.setAttribute(ROW_ATTR, stateKey);

    // Replace any prior pill on this row before inserting the fresh one.
    row.querySelectorAll(`[${BADGE_ATTR}]`).forEach((b) => b.remove());

    const deltaPct = ((listed - fair.market_value) / fair.market_value) * 100;
    const pill = buildPill(deltaPct);
    priceEl.insertAdjacentElement('afterend', pill);
  }
}
