// Travel arbitrage card on /travelagency.php (and /index.php?page=travel).
//
// Pulls /api/travel which merges YATA's abroad stock feed with Torn's
// market values. Ranks destinations by best item profit and surfaces the
// top 3 as a card above Torn's destination picker, so the user picks
// the right country without bouncing between tabs.
//
// Mounted as a single Shadow DOM card via lib/shadow.ts, same visual
// language as stocks-overlay and armoury-overlay.

import { ApiError, fetchTravel } from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { TRAVEL_ANCHOR_SELECTORS } from '../lib/torn-pages';
import { applyBaseStyles, ensureHost } from '../lib/shadow';
import type { TravelCountry, TravelItem } from '../types';
import { HUB_ORIGIN } from '../env';

const TTL_MS = 60_000;

interface TravelCache {
  ts: number;
  countries: TravelCountry[];
  error: 'auth' | 'backend' | null;
}

let _cache: TravelCache | null = null;

async function getTravelData(): Promise<TravelCache> {
  if (_cache && Date.now() - _cache.ts < TTL_MS) return _cache;
  const auth = getAuth();
  if (!auth) return { ts: Date.now(), countries: [], error: 'auth' };
  try {
    const resp = await fetchTravel(auth);
    _cache = { ts: Date.now(), countries: resp.countries, error: null };
    return _cache;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      clearAuth();
      return { ts: Date.now(), countries: [], error: 'auth' };
    }
    return { ts: Date.now(), countries: [], error: 'backend' };
  }
}

function fmtMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const STYLES = `
  :host { all: initial; display: block; width: 100%; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .card {
    background: linear-gradient(135deg, #161b22 0%, #1c2128 100%);
    border: 1px solid #30363d;
    border-left: 3px solid #3fb950;
    border-radius: 8px;
    padding: 12px;
    margin: 8px 0;
    color: #c9d1d9;
    font-size: 12px;
    line-height: 1.45;
    width: 100%;
    display: block;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .title { font-weight: 700; color: #3fb950; font-size: 13px; white-space: nowrap; min-width: 0; }
  .link { color: #6e7681; font-size: 11px; text-decoration: none; white-space: nowrap; }
  .link:hover { color: #3fb950; text-decoration: underline; }
  .dest {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    padding: 10px;
    margin-top: 8px;
  }
  .dest-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .dest-name {
    font-weight: 700;
    color: #f0f6fc;
    font-size: 13px;
  }
  .dest-time { color: #6e7681; font-size: 10px; }
  .profit {
    color: #3fb950;
    font-weight: 700;
    font-size: 13px;
    white-space: nowrap;
  }
  .item-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding-top: 4px;
    color: #c9d1d9;
    font-size: 11px;
  }
  .item-row .left { min-width: 0; flex: 1; }
  .item-row .name {
    color: #f0f6fc;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item-row .price {
    color: #8b949e;
    font-size: 10px;
  }
  .item-row .right {
    color: #c9d1d9;
    text-align: right;
    white-space: nowrap;
    font-size: 11px;
  }
  .item-row .stock { color: #6e7681; font-size: 10px; }
  .empty { color: #6e7681; font-size: 11px; margin-top: 6px; }
  .err {
    background: rgba(248,81,73,0.08);
    border: 1px solid rgba(248,81,73,0.3);
    color: #c9d1d9;
    padding: 8px;
    border-radius: 6px;
    font-size: 11px;
    margin-top: 6px;
  }
  .footer {
    color: #6e7681;
    font-size: 10px;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid #21262d;
  }
`;

function renderDestination(country: TravelCountry): string {
  const top: TravelItem | undefined = country.items[0];
  const timeLabel = country.travel_min ? `${country.travel_min}m one-way` : '';
  if (!top || top.profit <= 0) {
    return `
      <div class="dest">
        <div class="dest-head">
          <div>
            <div class="dest-name">${escapeHtml(country.name)}</div>
            ${timeLabel ? `<div class="dest-time">${escapeHtml(timeLabel)}</div>` : ''}
          </div>
          <div class="profit" style="color:#6e7681">no profit</div>
        </div>
      </div>
    `;
  }
  return `
    <div class="dest">
      <div class="dest-head">
        <div>
          <div class="dest-name">${escapeHtml(country.name)}</div>
          ${timeLabel ? `<div class="dest-time">${escapeHtml(timeLabel)}</div>` : ''}
        </div>
        <div class="profit">${escapeHtml(fmtMoney(top.profit))}/item</div>
      </div>
      <div class="item-row">
        <div class="left">
          <div class="name">${escapeHtml(top.name)}</div>
          <div class="price">${escapeHtml(fmtMoney(top.abroad_cost))} buy · ${escapeHtml(fmtMoney(top.market_value))} sell</div>
        </div>
        <div class="right">
          ${top.quantity > 0 ? `qty ${escapeHtml(String(top.quantity))}` : ''}
          ${top.quantity > 0 ? '<div class="stock">in stock</div>' : '<div class="stock">low / out</div>'}
        </div>
      </div>
    </div>
  `;
}

export async function renderTravelOverlay(): Promise<void> {
  const auth = getAuth();
  if (!auth) {
    document.querySelector('[data-tm-companion="travel-overlay"]')?.remove();
    return;
  }
  const data = await getTravelData();
  const { host, shadow } = ensureHost('travel-overlay');
  // Force the host to be a full-width block — Torn pages put their main
  // container in flex/grid layouts that otherwise squeeze the host into
  // a narrow column and the card content wraps awkwardly.
  host.style.display = 'block';
  host.style.width = '100%';
  applyBaseStyles(shadow);

  shadow.querySelectorAll('.card, style[data-tm-travel]').forEach((n) => n.remove());
  const style = document.createElement('style');
  style.setAttribute('data-tm-travel', '1');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const card = document.createElement('div');
  card.className = 'card';

  let body = '';
  if (data.error === 'auth') {
    body = `<div class="err">Connect TM Hub from the corner chip to see travel arbitrage here.</div>`;
  } else if (data.error === 'backend') {
    body = `<div class="err">TM Hub is unreachable right now. Retrying in a minute.</div>`;
  } else if (data.countries.length === 0) {
    body = `<div class="empty">YATA travel stock feed unavailable. Try again in a few minutes.</div>`;
  } else {
    const top3 = [...data.countries]
      .filter((c) => c.best_profit > 0)
      .sort((a, b) => b.best_profit - a.best_profit)
      .slice(0, 3);
    if (top3.length === 0) {
      body = `<div class="empty">No profitable items abroad right now. Stocks might be empty across destinations — check again later.</div>`;
    } else {
      body = top3.map(renderDestination).join('');
    }
  }

  card.innerHTML = `
    <div class="head">
      <div class="title">✈️ TM Hub Travel</div>
      <a class="link" href="${HUB_ORIGIN}/travel" target="_blank" rel="noopener">Open in TM Hub →</a>
    </div>
    ${body}
    <div class="footer">Profit = market value × 0.95 (5% selling fee) minus abroad cost. Top 3 destinations by best item profit.</div>
  `;
  shadow.appendChild(card);

  if (!host.parentElement) {
    for (const sel of TRAVEL_ANCHOR_SELECTORS) {
      const anchor = document.querySelector(sel);
      if (anchor) {
        anchor.insertBefore(host, anchor.firstChild);
        return;
      }
    }
    document.body.insertBefore(host, document.body.firstChild);
  }
}
