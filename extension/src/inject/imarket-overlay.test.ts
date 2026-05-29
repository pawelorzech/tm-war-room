// Tests for the imarket-overlay bargain/cheap badges.
//
// Verifies:
//  - ratio <= 80% renders a green BARGAIN badge with -X% delta
//  - 80% < ratio <= 95% renders a yellow CHEAP badge with -X% delta
//  - ratio > 95% (and <= 110%) renders no bargain/cheap badge (fair pill still ok)
//  - missing market data → no badge at all (quiet by design)
//  - injected stylesheet contains the mobile @media rule hiding .tm-label
//  - calling applyImarketOverlay twice does not duplicate the badge
//  - in-place Torn re-render that mutates the listing price re-paints the badge
//  - listings > +10% over market still get the overpriced pill (regression guard)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketPriceItem } from '../types';

vi.mock('../lib/auth', () => ({
  getAuth: () => ({ token: 't', player_id: 1, player_name: 'tester' }),
  clearAuth: () => {},
}));

// vi.mock is hoisted to the top of the file, so the factory cannot capture
// module-level variables that are declared below it. vi.hoisted lets us
// declare the mock alongside the hoist so the factory sees it.
const { fetchMarketPricesMock, postMugInteractionMock } = vi.hoisted(() => ({
  fetchMarketPricesMock: vi.fn(),
  postMugInteractionMock: vi.fn(),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, fetchMarketPrices: fetchMarketPricesMock, postMugInteraction: postMugInteractionMock };
});

import { applyImarketOverlay, _resetImarketCacheForTests } from './imarket-overlay';

const STYLE_ID = 'tm-companion-imarket-styles';
const BADGE_ATTR = 'data-tm-imarket-badge';

function priceItem(id: number, marketValue: number): MarketPriceItem {
  return {
    id,
    name: `Item ${id}`,
    type: 'Other',
    market_value: marketValue,
    buy_price: marketValue,
    sell_price: marketValue,
    circulation: 1000,
    profit_buy_sell: 0,
    profit_margin_pct: 0,
    is_shop: false,
    country_slug: null,
    country_name: null,
    country_flag: null,
  };
}

function setListings(prices: number[]): HTMLElement {
  document.body.innerHTML = '<div id="mainContainer"><ul class="sellerList"></ul></div>';
  const ul = document.querySelector<HTMLUListElement>('ul.sellerList')!;
  for (const p of prices) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="price">$${p.toLocaleString('en-US')}</span>`;
    ul.appendChild(li);
  }
  return ul;
}

function navigateTo(iid: number): void {
  window.history.replaceState({}, '', `/imarket.php?iid=${iid}`);
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  fetchMarketPricesMock.mockReset();
  postMugInteractionMock.mockReset();
  postMugInteractionMock.mockResolvedValue({ status: 'ok' });
  document.getElementById(STYLE_ID)?.remove();
  _resetImarketCacheForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyImarketOverlay — bargain/cheap badges', () => {
  it('renders a green BARGAIN badge with the discount % when listing <= 80% of market', async () => {
    const itemId = 100;
    navigateTo(itemId);
    fetchMarketPricesMock.mockResolvedValueOnce({ items: [priceItem(itemId, 100_000)] });
    setListings([50_000]);
    await applyImarketOverlay();
    const row = document.querySelector('ul.sellerList > li')!;
    const badges = row.querySelectorAll(`[${BADGE_ATTR}]`);
    expect(badges.length).toBe(1);
    const badge = badges[0] as HTMLElement;
    expect(badge.classList.contains('tm-bargain')).toBe(true);
    expect(badge.textContent || '').toMatch(/BARGAIN/);
    expect(badge.textContent || '').toMatch(/-?50%/);
  });

  it('renders a yellow CHEAP badge when listing is between 80% and 95% of market', async () => {
    const itemId = 101;
    navigateTo(itemId);
    fetchMarketPricesMock.mockResolvedValueOnce({ items: [priceItem(itemId, 100_000)] });
    setListings([90_000]);
    await applyImarketOverlay();
    const row = document.querySelector('ul.sellerList > li')!;
    const badge = row.querySelector(`[${BADGE_ATTR}]`) as HTMLElement;
    expect(badge).toBeTruthy();
    expect(badge.classList.contains('tm-cheap')).toBe(true);
    expect(badge.textContent || '').toMatch(/CHEAP/);
    // Floating-point: (0.9 − 1) * 100 = −9.9999... → formatPct → "−10.0%".
    // Match either "10%" or "10.0%" so the assertion is robust.
    expect(badge.textContent || '').toMatch(/10(\.0)?%/);
  });

  it('renders neither BARGAIN nor CHEAP when listing is above 95% of market', async () => {
    const itemId = 102;
    navigateTo(itemId);
    fetchMarketPricesMock.mockResolvedValueOnce({ items: [priceItem(itemId, 100_000)] });
    setListings([96_000]);
    await applyImarketOverlay();
    const row = document.querySelector('ul.sellerList > li')!;
    const badge = row.querySelector(`[${BADGE_ATTR}]`) as HTMLElement | null;
    if (badge) {
      expect(badge.classList.contains('tm-bargain')).toBe(false);
      expect(badge.classList.contains('tm-cheap')).toBe(false);
    }
  });

  it('renders nothing extra when we lack market data for the listed item (quiet by design)', async () => {
    const itemId = 103;
    navigateTo(itemId);
    fetchMarketPricesMock.mockResolvedValueOnce({ items: [] });
    setListings([50_000]);
    await applyImarketOverlay();
    const row = document.querySelector('ul.sellerList > li')!;
    expect(row.querySelectorAll(`[${BADGE_ATTR}]`).length).toBe(0);
  });

  it('injects a stylesheet with a mobile @media rule hiding .tm-label under 600px', async () => {
    const itemId = 104;
    navigateTo(itemId);
    fetchMarketPricesMock.mockResolvedValueOnce({ items: [priceItem(itemId, 100_000)] });
    setListings([50_000]);
    await applyImarketOverlay();
    const styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    expect(styleEl).toBeTruthy();
    const css = (styleEl?.textContent || '').replace(/\s+/g, ' ');
    expect(css).toMatch(/@media\s*\(max-width:\s*600px\)/);
    expect(css).toMatch(/\.tm-label\s*\{[^}]*display:\s*none/);
  });

  it('is idempotent — calling the overlay twice does not stack badges on the same row', async () => {
    const itemId = 105;
    navigateTo(itemId);
    fetchMarketPricesMock.mockResolvedValue({ items: [priceItem(itemId, 100_000)] });
    setListings([50_000]);
    await applyImarketOverlay();
    await applyImarketOverlay();
    const row = document.querySelector('ul.sellerList > li')!;
    expect(row.querySelectorAll(`[${BADGE_ATTR}]`).length).toBe(1);
  });

  it('re-paints the badge when a Torn in-place re-render swaps the listing price', async () => {
    const itemId = 106;
    navigateTo(itemId);
    fetchMarketPricesMock.mockResolvedValue({ items: [priceItem(itemId, 100_000)] });
    setListings([50_000]);
    await applyImarketOverlay();
    let row = document.querySelector('ul.sellerList > li')!;
    let badge = row.querySelector(`[${BADGE_ATTR}]`) as HTMLElement;
    expect(badge.classList.contains('tm-bargain')).toBe(true);
    const priceEl = row.querySelector('.price') as HTMLElement;
    priceEl.textContent = '$90,000';
    await applyImarketOverlay();
    row = document.querySelector('ul.sellerList > li')!;
    const badges = row.querySelectorAll(`[${BADGE_ATTR}]`);
    expect(badges.length).toBe(1);
    badge = badges[0] as HTMLElement;
    expect(badge.classList.contains('tm-cheap')).toBe(true);
    expect(badge.classList.contains('tm-bargain')).toBe(false);
  });

  it('still renders an overpriced pill for listings above +10% of market (regression guard)', async () => {
    const itemId = 107;
    navigateTo(itemId);
    fetchMarketPricesMock.mockResolvedValueOnce({ items: [priceItem(itemId, 100_000)] });
    setListings([120_000]);
    await applyImarketOverlay();
    const row = document.querySelector('ul.sellerList > li')!;
    const badge = row.querySelector(`[${BADGE_ATTR}]`) as HTMLElement;
    expect(badge).toBeTruthy();
    expect(badge.classList.contains('tm-over')).toBe(true);
    expect(badge.textContent || '').toMatch(/\+?20%/);
  });
});

describe('applyImarketOverlay — fresh-cash on buy', () => {
  // A listing row whose buy control is associated with a seller profile link.
  // Buying from that seller hands them the player's cash → register a
  // fresh-cash trade so the seller's mug-score boosts.
  function setSellerListing(sellerId: number, price: number): HTMLElement {
    document.body.innerHTML = '<div id="mainContainer"><ul class="sellerList"></ul></div>';
    const ul = document.querySelector<HTMLUListElement>('ul.sellerList')!;
    const li = document.createElement('li');
    li.innerHTML =
      `<a href="/profiles.php?XID=${sellerId}">Seller${sellerId}</a>` +
      `<span class="price">$${price.toLocaleString('en-US')}</span>` +
      `<button class="buy">Buy</button>`;
    ul.appendChild(li);
    return li;
  }

  it('records a fresh-cash trade with (auth, sellerId, "imarket") when the player buys', async () => {
    const itemId = 200;
    navigateTo(itemId);
    fetchMarketPricesMock.mockResolvedValueOnce({ items: [priceItem(itemId, 100_000)] });
    const row = setSellerListing(200, 50_000);

    await applyImarketOverlay();

    const buy = row.querySelector('.buy') as HTMLElement;
    buy.click();
    // fire-and-forget — let the microtask settle.
    await Promise.resolve();

    expect(postMugInteractionMock).toHaveBeenCalledTimes(1);
    expect(postMugInteractionMock).toHaveBeenCalledWith(
      { token: 't', player_id: 1, player_name: 'tester' },
      200,
      'imarket',
    );
  });
});
