// Stocks portfolio + ROI overlay on /page.php?sid=stocks (or legacy /loader.php?sid=stocks).
//
// Pulls /api/stocks/portfolio (holdings, P/L, benefit/dividend readiness)
// and /api/stocks/roi (ranked next-best marginal ROI recommendations) and
// renders a single intel card above Torn's own stock UI:
//
//   - Portfolio aggregate (value / P&L / P&L%)
//   - "Ready to collect" pills for stocks whose benefit or dividend is ripe
//   - Top 3 next-best marginal ROI moves with cost-to-buy + days to break even
//
// Cached 60s. Out of scope: buy/sell from the card itself — Torn's UI is
// where you transact, this is just intel that helps you decide what to buy
// next.

import {
  ApiError,
  fetchStockPortfolio,
  fetchStockRoi,
} from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { STOCKS_ANCHOR_SELECTORS } from '../lib/torn-pages';
import { applyBaseStyles, ensureHost } from '../lib/shadow';
import type {
  StockPortfolioResponse,
  StockRoiResponse,
} from '../types';

const HUB_ORIGIN: string =
  (typeof process !== 'undefined' && process.env && (process.env as Record<string, string>).TM_HUB_ORIGIN) ||
  'https://hub.tri.ovh';

const TTL_MS = 60_000;

type StocksError = 'auth' | 'limited_key' | 'backend' | null;

interface StocksCache {
  ts: number;
  portfolio: StockPortfolioResponse | null;
  roi: StockRoiResponse | null;
  error: StocksError;
}

let _cache: StocksCache | null = null;

async function getStocksData(): Promise<StocksCache> {
  if (_cache && Date.now() - _cache.ts < TTL_MS) return _cache;
  const auth = getAuth();
  if (!auth) {
    const empty: StocksCache = { ts: Date.now(), portfolio: null, roi: null, error: 'auth' };
    return empty;
  }
  let portfolio: StockPortfolioResponse | null = null;
  let roi: StockRoiResponse | null = null;
  let error: StocksError = null;
  try {
    portfolio = await fetchStockPortfolio(auth);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) {
        clearAuth();
        error = 'auth';
      } else if (err.status === 403) {
        // Either no key access, or no stocks held — both backed by 403.
        // We treat as "limited key" but the UI text covers both cases.
        error = 'limited_key';
      } else {
        error = 'backend';
      }
    } else {
      error = 'backend';
    }
  }
  try {
    roi = await fetchStockRoi(auth);
  } catch {
    // ROI is best-effort — show portfolio aggregates even when ROI fails.
  }
  _cache = { ts: Date.now(), portfolio, roi, error };
  return _cache;
}

function fmtMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .card {
    background: linear-gradient(135deg, #161b22 0%, #1c2128 100%);
    border: 1px solid #30363d;
    border-left: 3px solid #58a6ff;
    border-radius: 8px;
    padding: 12px;
    margin: 8px 0;
    color: #c9d1d9;
    font-size: 12px;
    line-height: 1.45;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .title { font-weight: 700; color: #58a6ff; font-size: 13px; }
  .link { color: #6e7681; font-size: 11px; text-decoration: none; }
  .link:hover { color: #58a6ff; text-decoration: underline; }
  .summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin: 6px 0;
  }
  .stat {
    background: #0d1117;
    border-radius: 6px;
    padding: 8px;
    border: 1px solid #21262d;
  }
  .stat .lbl {
    color: #6e7681;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .stat .val {
    color: #f0f6fc;
    font-size: 14px;
    font-weight: 700;
    margin-top: 2px;
  }
  .val.up { color: #3fb950; }
  .val.down { color: #f85149; }
  .section { margin-top: 10px; padding-top: 8px; border-top: 1px solid #21262d; }
  .section-label {
    color: #6e7681;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
  }
  .rec {
    display: flex; align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 8px;
    background: #0d1117;
    border-radius: 6px;
    border: 1px solid #21262d;
    margin-bottom: 4px;
  }
  .rec .left { min-width: 0; flex: 1; }
  .rec .name { font-weight: 600; color: #f0f6fc; font-size: 12px; }
  .rec .desc { color: #8b949e; font-size: 10px; }
  .rec .right { text-align: right; white-space: nowrap; }
  .rec .roi { color: #3fb950; font-weight: 700; font-size: 12px; }
  .rec .roi.cool { color: #d29922; }
  .rec .roi.cold { color: #6e7681; }
  .rec .cost { color: #c9d1d9; font-size: 11px; }
  .rec .days { color: #6e7681; font-size: 10px; }
  .empty { color: #6e7681; font-size: 11px; }
  .err {
    background: rgba(248,81,73,0.08);
    border: 1px solid rgba(248,81,73,0.3);
    color: #c9d1d9;
    padding: 8px;
    border-radius: 6px;
    font-size: 11px;
  }
  .err b { color: #f85149; }
  .pill {
    display: inline-flex;
    align-items: center; gap: 4px;
    background: rgba(63,185,80,0.15);
    color: #3fb950;
    border-radius: 8px;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 600;
    margin: 2px 4px 2px 0;
  }
  .footer {
    color: #6e7681;
    font-size: 10px;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid #21262d;
  }
`;

function renderSummary(p: StockPortfolioResponse): string {
  const upDown = p.total_profit >= 0 ? 'up' : 'down';
  const profitStr = (p.total_profit >= 0 ? '+' : '') + fmtMoney(p.total_profit);
  return `
    <div class="summary">
      <div class="stat">
        <div class="lbl">Portfolio</div>
        <div class="val">${fmtMoney(p.total_value)}</div>
      </div>
      <div class="stat">
        <div class="lbl">Profit / loss</div>
        <div class="val ${upDown}">${profitStr}</div>
      </div>
      <div class="stat">
        <div class="lbl">P/L %</div>
        <div class="val ${upDown}">${fmtPct(p.total_profit_pct)}</div>
      </div>
    </div>
  `;
}

function renderReady(p: StockPortfolioResponse): string {
  const ready = p.holdings.filter((h) => h.benefit_ready || h.dividend_ready);
  if (ready.length === 0) return '';
  const items = ready
    .map((h) => {
      const what: string[] = [];
      if (h.benefit_ready) what.push('benefit');
      if (h.dividend_ready) what.push('dividend');
      return `<span class="pill">⚡ ${escapeHtml(h.acronym)} ${what.join(' + ')} ready</span>`;
    })
    .join('');
  return `
    <div class="section">
      <div class="section-label">Ready to collect</div>
      <div>${items}</div>
    </div>
  `;
}

function roiClass(pct: number): string {
  if (pct >= 12) return '';
  if (pct >= 6) return 'cool';
  return 'cold';
}

function renderTopRoi(roi: StockRoiResponse | null): string {
  if (!roi || roi.recommendations.length === 0) return '';
  const next = roi.recommendations
    .filter((r) => !r.is_active)
    .sort((a, b) => b.marginal_roi_pct - a.marginal_roi_pct)
    .slice(0, 3);
  if (next.length === 0) {
    return `
      <div class="section">
        <div class="section-label">Best next moves</div>
        <div class="empty">All tracked benefit blocks are fully owned. Nice.</div>
      </div>
    `;
  }
  const items = next
    .map((r) => {
      const livePrice = r.price_is_live ? ' · live price' : '';
      return `
        <div class="rec">
          <div class="left">
            <div class="name">${escapeHtml(r.acronym)} · Inc ${r.increment}</div>
            <div class="desc">${escapeHtml(r.benefit_desc)}${livePrice}</div>
          </div>
          <div class="right">
            <div class="roi ${roiClass(r.marginal_roi_pct)}">${fmtPct(r.marginal_roi_pct)} / yr</div>
            <div class="cost">${fmtMoney(r.cost_remaining)} to buy</div>
            <div class="days">~${Math.round(r.marginal_payback_days)}d to break even</div>
          </div>
        </div>
      `;
    })
    .join('');
  return `
    <div class="section">
      <div class="section-label">Best next moves (marginal ROI)</div>
      ${items}
    </div>
  `;
}

export async function renderStocksOverlay(): Promise<void> {
  const auth = getAuth();
  if (!auth) {
    document.querySelector('[data-tm-companion="stocks-overlay"]')?.remove();
    return;
  }
  const data = await getStocksData();
  const { host, shadow } = ensureHost('stocks-overlay');
  applyBaseStyles(shadow);

  shadow.querySelectorAll('.card, style[data-tm-stocks]').forEach((n) => n.remove());
  const style = document.createElement('style');
  style.setAttribute('data-tm-stocks', '1');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const card = document.createElement('div');
  card.className = 'card';

  let body = '';
  if (data.error === 'limited_key') {
    body = `
      <div class="err">
        <b>⚠️ Stock data unavailable.</b>
        Your TM Hub-linked API key doesn't have stock permissions, or you don't currently hold any stocks.
        If you expect to see your portfolio, re-authorize TM Hub with a <b>Full Access</b> key
        (Torn → Preferences → API Keys).
      </div>
    `;
  } else if (data.error === 'auth') {
    body = `<div class="err">Connect TM Hub from the corner chip to see your portfolio here.</div>`;
  } else if (data.error === 'backend') {
    body = `<div class="err">TM Hub is unreachable right now. Retrying in a minute.</div>`;
  } else if (!data.portfolio || data.portfolio.holdings.length === 0) {
    body = `
      <div class="empty">You don't currently hold any stocks.</div>
      ${renderTopRoi(data.roi)}
    `;
  } else {
    body = `
      ${renderSummary(data.portfolio)}
      ${renderReady(data.portfolio)}
      ${renderTopRoi(data.roi)}
    `;
  }

  card.innerHTML = `
    <div class="head">
      <div class="title">📈 TM Hub Stocks</div>
      <a class="link" href="${HUB_ORIGIN}/stocks" target="_blank" rel="noopener">Open in TM Hub →</a>
    </div>
    ${body}
    <div class="footer">Marginal ROI = next benefit block payout vs. its share cost. Higher = pays itself back faster.</div>
  `;
  shadow.appendChild(card);

  if (!host.parentElement) {
    for (const sel of STOCKS_ANCHOR_SELECTORS) {
      const anchor = document.querySelector(sel);
      if (anchor) {
        anchor.insertBefore(host, anchor.firstChild);
        return;
      }
    }
    document.body.insertBefore(host, document.body.firstChild);
  }
}
