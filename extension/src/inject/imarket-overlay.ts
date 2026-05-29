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

import { ApiError, fetchMarketPrices, postMugInteraction } from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import type { MarketPriceItem } from '../types';
import { escapeHtml } from '../lib/format';

const TTL_MS = 5 * 60_000;
const STYLE_ID = 'tm-companion-imarket-styles';
const ROW_ATTR = 'data-tm-imarket-styled';
const BADGE_ATTR = 'data-tm-imarket-badge';
const BUY_BOUND_ATTR = 'data-tm-imarket-buy-bound';

// Bargain/cheap thresholds. Calibrated to match TornTools' default behaviour
// while leaving the existing fair-pill / overpriced-pill behaviour intact:
//   ratio = listed / market_value
//   ratio <= BARGAIN_RATIO              → green "BARGAIN -X%"
//   BARGAIN_RATIO < ratio <= CHEAP_RATIO → yellow "CHEAP -X%"
//   above CHEAP_RATIO, +OVERPRICED_DELTA → grey "fair" (existing)
//   above 1 + OVERPRICED_DELTA           → red "overpriced" (existing)
const BARGAIN_RATIO = 0.80;
const CHEAP_RATIO = 0.95;
const OVERPRICED_DELTA = 0.10;

let _cache: { ts: number; map: Map<number, MarketPriceItem> } | null = null;

/** Test-only — reset the module-level prices cache so unit tests can stub a
 * fresh response per case without waiting out the 5-min TTL. Production code
 * must not call this. */
export function _resetImarketCacheForTests(): void {
  _cache = null;
}

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
  [${BADGE_ATTR}].tm-bargain { color: #3fb950; border-color: rgba(63,185,80,0.55); background: rgba(63,185,80,0.12); }
  [${BADGE_ATTR}].tm-cheap   { color: #e8b339; border-color: rgba(210,153,34,0.50); background: rgba(210,153,34,0.10); }
  [${BADGE_ATTR}].tm-over    { color: #f85149; border-color: rgba(248,81,73,0.45); }
  [${BADGE_ATTR}].tm-fair    { color: #8b949e; }
  [${BADGE_ATTR}] .tm-delta {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  /* Mobile compact mode: strip the BARGAIN/CHEAP/fair text label below 600px
     so the colored chip + percentage stay readable in Torn's narrow mobile
     listing rows. Matches the precedent in inject/status-chip.ts. */
  @media (max-width: 600px) {
    [${BADGE_ATTR}] .tm-label { display: none; }
  }
`;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
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

function buildPill(ratio: number, deltaPct: number): HTMLElement {
  const pill = document.createElement('span');
  pill.setAttribute(BADGE_ATTR, '1');
  let label: string;
  // Bargain/cheap eat the old underpriced bucket. We pick by ratio (not delta)
  // so the threshold semantics read naturally: "≤80% of market" = BARGAIN.
  if (ratio <= BARGAIN_RATIO) {
    label = 'BARGAIN';
    pill.classList.add('tm-bargain');
  } else if (ratio <= CHEAP_RATIO) {
    label = 'CHEAP';
    pill.classList.add('tm-cheap');
  } else if (deltaPct > OVERPRICED_DELTA * 100) {
    label = '⬆ overpriced';
    pill.classList.add('tm-over');
  } else {
    label = 'fair';
    pill.classList.add('tm-fair');
  }
  // .tm-label wraps the text so the mobile @media rule can hide it without
  // touching the chip background or the .tm-delta percentage.
  pill.innerHTML = `<span class="tm-label">${escapeHtml(label)}</span> <span class="tm-delta">${escapeHtml(formatPct(deltaPct))}</span>`;
  pill.title = 'TM Hub fair-price compares the listing against Torn\'s market value for this item.';
  return pill;
}

// Resolve the seller's player id from the row's profile link. Item-market
// listing rows carry a `profiles.php?XID=` anchor for the seller; that's the
// player who receives the buyer's cash on a purchase.
function resolveSellerId(row: HTMLElement): number | null {
  const anchor = row.querySelector<HTMLAnchorElement>('a[href*="XID="]');
  if (!anchor) return null;
  const m = anchor.href.match(/XID=(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Fresh-cash: when the player buys from this row's seller, the seller just
// received the buyer's cash → register a fresh-cash trade so the seller's
// mug-score boosts. Idempotent: guarded by a data-attr so re-running the
// overlay across Torn's in-place re-renders never double-binds.
function bindFreshCash(row: HTMLElement): void {
  if (row.getAttribute(BUY_BOUND_ATTR) === '1') return;
  row.setAttribute(BUY_BOUND_ATTR, '1');
  row.addEventListener('click', () => {
    const auth = getAuth();
    const sellerId = resolveSellerId(row);
    if (auth && sellerId) {
      void postMugInteraction(auth, sellerId, 'imarket').catch(() => {});
    }
  });
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
    // Fresh-cash binding is independent of the fair-price pill — even rows we
    // can't price (no market data) still hand the seller cash on a buy.
    bindFreshCash(row);

    const priceEl = findPriceElement(row);
    if (!priceEl) continue;
    const listed = parsePriceText(priceEl.textContent ?? '');
    if (listed === null) continue;

    // stateKey must include the listing price — a Torn in-place re-render that
    // mutates the price (e.g. seller drops by $10k) should re-paint the badge.
    // The earlier `String(fair.market_value)` key would have kept a stale
    // BARGAIN badge on a row that just became CHEAP.
    const stateKey = `${fair.market_value}:${listed}`;
    if (row.getAttribute(ROW_ATTR) === stateKey) continue;
    row.setAttribute(ROW_ATTR, stateKey);

    // Replace any prior pill on this row before inserting the fresh one.
    row.querySelectorAll(`[${BADGE_ATTR}]`).forEach((b) => b.remove());

    const ratio = listed / fair.market_value;
    const deltaPct = (ratio - 1) * 100;
    const pill = buildPill(ratio, deltaPct);
    priceEl.insertAdjacentElement('afterend', pill);
  }
}
