// Armoury competition card on /factions.php?step=armoury (and ?step=your&type=1).
//
// Shows the active armoury competitions the faction is running, with a
// mini top-5 leaderboard per competition (caller highlighted) and a
// time-remaining countdown. Links to /armoury in TM Hub for full detail.
//
// Mounted as a single Shadow DOM card above Torn's armoury news log.

import {
  ApiError,
  fetchArmouryCompetitions,
  fetchArmouryLeaderboard,
} from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { ARMOURY_ANCHOR_SELECTORS } from '../lib/torn-pages';
import { applyBaseStyles, ensureHost } from '../lib/shadow';
import type {
  ArmouryCompetition,
  ArmouryLeaderboardResponse,
} from '../types';
import { HUB_ORIGIN } from '../env';

const TTL_MS = 60_000;

interface ArmouryCache {
  ts: number;
  competitions: ArmouryCompetition[];
  leaderboards: Map<number, ArmouryLeaderboardResponse>;
  error: 'auth' | 'backend' | null;
}

let _cache: ArmouryCache | null = null;

async function getArmouryData(): Promise<ArmouryCache> {
  if (_cache && Date.now() - _cache.ts < TTL_MS) return _cache;
  const auth = getAuth();
  if (!auth) {
    return { ts: Date.now(), competitions: [], leaderboards: new Map(), error: 'auth' };
  }
  try {
    const resp = await fetchArmouryCompetitions(auth);
    const active = resp.competitions.filter((c) => c.status === 'active');
    const leaderboards = new Map<number, ArmouryLeaderboardResponse>();
    await Promise.all(
      active.map(async (comp) => {
        try {
          const lb = await fetchArmouryLeaderboard(auth, comp.id);
          leaderboards.set(comp.id, lb);
        } catch {
          // Skip — card still renders the comp header without a leaderboard.
        }
      }),
    );
    _cache = { ts: Date.now(), competitions: active, leaderboards, error: null };
    return _cache;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      clearAuth();
      return { ts: Date.now(), competitions: [], leaderboards: new Map(), error: 'auth' };
    }
    return { ts: Date.now(), competitions: [], leaderboards: new Map(), error: 'backend' };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtCountdown(endTs: number, now: number): { label: string; tone: 'fresh' | 'soon' | 'over' } {
  const remaining = endTs - now;
  if (remaining <= 0) return { label: 'ended', tone: 'over' };
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  let label: string;
  if (days >= 2) label = `${days}d ${hours}h left`;
  else if (days >= 1) label = `1d ${hours}h left`;
  else if (hours >= 1) label = `${hours}h ${minutes}m left`;
  else label = `${minutes}m left`;
  const tone: 'fresh' | 'soon' = remaining <= 24 * 3600 ? 'soon' : 'fresh';
  return { label, tone };
}

function fmtQty(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const STYLES = `
  :host { all: initial; display: block; width: 100%; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .card {
    background: linear-gradient(135deg, #161b22 0%, #1c2128 100%);
    border: 1px solid #30363d;
    border-left: 3px solid #d29922;
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
  .title { font-weight: 700; color: #d29922; font-size: 13px; white-space: nowrap; min-width: 0; }
  .link { color: #6e7681; font-size: 11px; text-decoration: none; white-space: nowrap; }
  .link:hover { color: #d29922; text-decoration: underline; }
  .comp {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    padding: 10px;
    margin-top: 8px;
  }
  .comp-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    gap: 8px;
    flex-wrap: wrap;
  }
  .comp-name { font-weight: 700; color: #f0f6fc; font-size: 13px; }
  .comp-meta { color: #8b949e; font-size: 10px; margin-top: 2px; }
  .countdown {
    padding: 2px 8px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .countdown.fresh { background: rgba(63,185,80,0.18); color: #3fb950; }
  .countdown.soon { background: rgba(210,153,34,0.18); color: #d29922; }
  .countdown.over { background: rgba(110,118,129,0.18); color: #6e7681; }
  .lb {
    margin-top: 6px;
    display: grid;
    grid-template-columns: 24px 1fr auto auto;
    gap: 4px 8px;
    font-size: 11px;
  }
  .lb .rank { color: #6e7681; text-align: right; }
  .lb .name { color: #c9d1d9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lb .total { color: #f0f6fc; font-weight: 600; text-align: right; white-space: nowrap; }
  .lb .deposits { color: #6e7681; text-align: right; font-size: 10px; white-space: nowrap; }
  .lb .row.me .name { color: #d29922; font-weight: 700; }
  .lb .row.me .total { color: #d29922; }
  .summary { color: #6e7681; font-size: 10px; margin-top: 6px; }
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

function renderLeaderboard(lb: ArmouryLeaderboardResponse | undefined, viewerId: number): string {
  if (!lb || lb.leaderboard.length === 0) {
    return `<div class="empty">No deposits logged yet.</div>`;
  }
  const top5 = lb.leaderboard.slice(0, 5);
  const meInTop = top5.some((r) => r.player_id === viewerId);
  const meRow = !meInTop ? lb.leaderboard.find((r) => r.player_id === viewerId) : undefined;
  const rows = top5
    .map((r) => {
      const me = r.player_id === viewerId ? ' me' : '';
      return `
        <div class="row${me}">
          <span class="rank">#${r.rank}</span>
          <span class="name">${escapeHtml(r.player_name)}</span>
          <span class="total">${escapeHtml(fmtQty(r.total))}</span>
          <span class="deposits">${r.deposits}×</span>
        </div>
      `;
    })
    .join('');
  const meTail = meRow
    ? `
        <div class="row me">
          <span class="rank">#${meRow.rank}</span>
          <span class="name">${escapeHtml(meRow.player_name)} (you)</span>
          <span class="total">${escapeHtml(fmtQty(meRow.total))}</span>
          <span class="deposits">${meRow.deposits}×</span>
        </div>
      `
    : '';
  return `<div class="lb">${rows}${meTail}</div>`;
}

function renderComp(
  comp: ArmouryCompetition,
  lb: ArmouryLeaderboardResponse | undefined,
  viewerId: number,
  now: number,
): string {
  const countdown =
    comp.end_ts > 0
      ? fmtCountdown(comp.end_ts, now)
      : { label: 'open-ended', tone: 'fresh' as const };
  const subtitle = comp.prize_text
    ? `${escapeHtml(comp.category)} · prize: ${escapeHtml(comp.prize_text)}`
    : escapeHtml(comp.category);
  const totalLine = lb
    ? `${lb.participants} participant${lb.participants === 1 ? '' : 's'} · ${fmtQty(lb.total_deposited)} total deposited`
    : '';
  return `
    <div class="comp">
      <div class="comp-head">
        <div>
          <div class="comp-name">${escapeHtml(comp.name)}</div>
          <div class="comp-meta">${subtitle}</div>
        </div>
        <div class="countdown ${countdown.tone}">${escapeHtml(countdown.label)}</div>
      </div>
      ${renderLeaderboard(lb, viewerId)}
      ${totalLine ? `<div class="summary">${escapeHtml(totalLine)}</div>` : ''}
    </div>
  `;
}

export async function renderArmouryOverlay(): Promise<void> {
  const auth = getAuth();
  if (!auth) {
    document.querySelector('[data-tm-companion="armoury-overlay"]')?.remove();
    return;
  }
  const data = await getArmouryData();
  const { host, shadow } = ensureHost('armoury-overlay');
  // Force the host to be a full-width block — Torn faction pages put their
  // main container in flex/grid layouts that otherwise squeeze the host
  // into a narrow column and the card text wraps letter-by-letter.
  host.style.display = 'block';
  host.style.width = '100%';
  applyBaseStyles(shadow);

  shadow.querySelectorAll('.card, style[data-tm-armoury]').forEach((n) => n.remove());
  const style = document.createElement('style');
  style.setAttribute('data-tm-armoury', '1');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const card = document.createElement('div');
  card.className = 'card';

  let body = '';
  if (data.error === 'auth') {
    body = `<div class="err">Connect TM Hub from the corner chip to see armoury competitions here.</div>`;
  } else if (data.error === 'backend') {
    body = `<div class="err">TM Hub is unreachable right now. Retrying in a minute.</div>`;
  } else if (data.competitions.length === 0) {
    body = `<div class="empty">No active armoury competitions. Admins can start one from TM Hub → Armoury.</div>`;
  } else {
    const now = Math.floor(Date.now() / 1000);
    body = data.competitions
      .map((comp) => renderComp(comp, data.leaderboards.get(comp.id), auth.player_id, now))
      .join('');
  }

  card.innerHTML = `
    <div class="head">
      <div class="title">🏆 TM Hub Armoury</div>
      <a class="link" href="${HUB_ORIGIN}/armoury" target="_blank" rel="noopener">Open in TM Hub →</a>
    </div>
    ${body}
    <div class="footer">Deposits are picked up from Torn's faction news log every 5 minutes.</div>
  `;
  shadow.appendChild(card);

  if (!host.parentElement) {
    for (const sel of ARMOURY_ANCHOR_SELECTORS) {
      const anchor = document.querySelector(sel);
      if (anchor) {
        anchor.insertBefore(host, anchor.firstChild);
        return;
      }
    }
    document.body.insertBefore(host, document.body.firstChild);
  }
}
