// Travel arbitrage card on /travelagency.php (and /index.php?page=travel).
//
// Pulls /api/travel which merges YATA's abroad stock feed with Torn's
// market values. Ranks destinations by best item profit and surfaces the
// top 3 as a card above Torn's destination picker, so the user picks
// the right country without bouncing between tabs.
//
// Mounted as a single Shadow DOM card via lib/shadow.ts, same visual
// language as stocks-overlay and armoury-overlay.

import { ApiError, fetchTravel, fetchActiveFlights } from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { TRAVEL_ANCHOR_SELECTORS } from '../lib/torn-pages';
import { applyBaseStyles, ensureHost } from '../lib/shadow';
import { cardBase } from '../lib/card-styles';
import type { TravelCountry, TravelItem, FlightRow } from '../types';
import { HUB_ORIGIN, getFeatureFlags } from '../env';
import { escapeHtml } from '../lib/format';

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

function fmtCountdown(secs: number): string {
  if (secs <= 0) return 'landing now';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function prettyDest(raw: string): string {
  const tidy = raw.replace(/_/g, ' ').trim();
  return tidy
    .split(' ')
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

function renderAirborneBlock(flights: FlightRow[]): string {
  if (flights.length === 0) {
    return `
      <div class="airborne">
        <div class="airborne-head"><span>✈️ Tracked players in transit</span><span style="font-weight:400;color:#6e7681">via TM Hub</span></div>
        <div class="airborne-empty">No tracked players in transit right now.</div>
      </div>
    `;
  }
  const now = Math.floor(Date.now() / 1000);
  const sorted = [...flights]
    .sort((a, b) => (a.predicted_landed_at ?? 0) - (b.predicted_landed_at ?? 0))
    .slice(0, 8);
  const rows = sorted
    .map((f) => {
      const lands = f.predicted_landed_at ?? f.departed_at + 1560;
      const secs = lands - now;
      return `
        <div class="airborne-row">
          <span class="who">Player ${escapeHtml(String(f.player_id))}</span>
          <span class="where">${escapeHtml(prettyDest(f.destination))}</span>
          <span class="when">lands in ${escapeHtml(fmtCountdown(secs))}</span>
        </div>
      `;
    })
    .join('');
  const more = flights.length > sorted.length ? `<div class="airborne-empty">+${flights.length - sorted.length} more — see TM Hub.</div>` : '';
  return `
    <div class="airborne">
      <div class="airborne-head"><span>✈️ Tracked players in transit</span><span style="font-weight:400;color:#6e7681">${flights.length} airborne</span></div>
      ${rows}
      ${more}
    </div>
  `;
}

async function getActiveFlights(): Promise<FlightRow[]> {
  if (!getFeatureFlags().flights) return [];
  const auth = getAuth();
  if (!auth) return [];
  const resp = await fetchActiveFlights(auth);
  return resp.flights;
}

function fmtMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
  return `${sign}$${Math.round(abs)}`;
}


const STYLES = cardBase('#3fb950') + `
  .title { white-space: nowrap; min-width: 0; }
  .airborne {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    padding: 8px 10px;
    margin-top: 8px;
  }
  .airborne-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    color: #79c0ff;
    font-weight: 700;
    font-size: 12px;
    margin-bottom: 4px;
  }
  .airborne-empty { color: #6e7681; font-size: 11px; }
  .airborne-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 3px 0;
    font-size: 11px;
    color: #c9d1d9;
    border-top: 1px solid #21262d;
  }
  .airborne-row:first-of-type { border-top: 0; }
  .airborne-row .who { color: #f0f6fc; font-weight: 600; }
  .airborne-row .where { color: #79c0ff; }
  .airborne-row .when { color: #8b949e; }
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
  const [data, flights] = await Promise.all([getTravelData(), getActiveFlights()]);
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

  // The airborne block only renders when the feature flag is on AND we
  // have at least one tracked player in transit (or zero — we still show
  // the empty-state so the user knows the panel is wired up).
  const airborneBlock = getFeatureFlags().flights ? renderAirborneBlock(flights) : '';

  card.innerHTML = `
    <div class="head">
      <div class="title">✈️ TM Hub Travel</div>
      <a class="link" href="${HUB_ORIGIN}/travel" target="_blank" rel="noopener">Open in TM Hub →</a>
    </div>
    ${airborneBlock}
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
