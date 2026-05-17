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
import { cardBase } from '../lib/card-styles';
import type {
  ArmouryCompetition,
  ArmouryLeaderboardResponse,
} from '../types';
import { HUB_ORIGIN } from '../env';
import { escapeHtml } from '../lib/format';

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

// Ported from frontend/src/app/armoury/page.tsx so the overlay shows
// "💉 Temporary Items" instead of the raw "temporary" enum value.
const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  blood_bags:    { label: 'Blood Bags',     icon: '\u{1FA78}' },
  temporary:     { label: 'Temporary Items', icon: '\u{1F489}' },
  alcohol:       { label: 'Alcohol',        icon: '\u{1F37A}' },
  medical:       { label: 'Medical',        icon: '\u{1FA79}' },
  drugs:         { label: 'Drugs',          icon: '\u{1F48A}' },
  energy_drinks: { label: 'Energy Drinks',  icon: '\u{26A1}'  },
  candy:         { label: 'Candy',          icon: '\u{1F36C}' },
};

function competitionScope(comp: ArmouryCompetition): { label: string; icon: string } {
  const parts: string[] = [];
  const icons: string[] = [];
  if (comp.category) {
    const cats = comp.category.split(',').map((c) => c.trim()).filter(Boolean);
    parts.push(...cats.map((c) => CATEGORY_META[c]?.label || c));
    icons.push(...cats.map((c) => CATEGORY_META[c]?.icon || '').filter(Boolean));
  }
  if (comp.items) {
    const items = comp.items.split(',').map((i) => i.trim()).filter(Boolean);
    if (items.length <= 3) parts.push(...items);
    else parts.push(`${items.slice(0, 2).join(', ')} +${items.length - 2} more`);
    icons.push('\u{1F4E6}');
  }
  return {
    label: parts.join(' + ') || 'All items',
    icon: icons[0] || '\u{1F6E1}️',
  };
}

function rankDecoration(rank: number): { display: string; podium: string } {
  if (rank === 1) return { display: '\u{1F947}', podium: ' podium-1' };
  if (rank === 2) return { display: '\u{1F948}', podium: ' podium-2' };
  if (rank === 3) return { display: '\u{1F949}', podium: ' podium-3' };
  return { display: String(rank), podium: '' };
}

const STYLES = cardBase('#d29922') + `
  .title { white-space: nowrap; min-width: 0; }
  .comp {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    padding: 10px;
    margin-top: 8px;
  }
  .comp-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 8px;
    gap: 6px 8px;
    flex-wrap: wrap;
  }
  .comp-name { font-weight: 700; color: #f0f6fc; font-size: 13px; }
  .comp-meta {
    color: #8b949e;
    font-size: 11px;
    margin-top: 3px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .comp-meta .scope-icon { font-size: 12px; line-height: 1; }
  .countdown {
    padding: 2px 8px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .countdown.fresh { background: rgba(63,185,80,0.18); color: #3fb950; }
  .countdown.soon { background: rgba(210,153,34,0.18); color: #d29922; }
  .countdown.over { background: rgba(110,118,129,0.18); color: #6e7681; }

  /* Leaderboard — flex column of grid rows. Each .row is its own
     3-col grid (rank | name | stats). A prior version made .lb the grid
     and put each .row as a single grid cell, which collapsed rank #1 into
     a 24px column and wrapped player names letter-by-letter.
     See Plans/image-1-spierdolony-ten-iridescent-emerson.md. */
  .lb {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .lb .row {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 12px;
  }
  .lb .row.podium-1 { background: rgba(210,153,34,0.07); }
  .lb .row.podium-2 { background: rgba(177,186,196,0.04); }
  .lb .row.podium-3 { background: rgba(205,127,50,0.05); }
  .lb .row.me { background: rgba(63,185,80,0.12); }

  .lb .rank {
    text-align: center;
    font-weight: 700;
    font-size: 12px;
    color: #6e7681;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .lb .row.podium-1 .rank,
  .lb .row.podium-2 .rank,
  .lb .row.podium-3 .rank { font-size: 15px; }

  .lb .name {
    color: #c9d1d9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .lb .row.podium-1 .name { color: #f0f6fc; font-weight: 700; }
  .lb .row.me .name { color: #3fb950; font-weight: 700; }

  .lb .you-badge {
    background: rgba(63,185,80,0.18);
    color: #3fb950;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 1px 5px;
    border-radius: 3px;
    flex-shrink: 0;
    line-height: 1.3;
  }

  .lb .stats {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    justify-content: flex-end;
  }
  .lb .total { color: #f0f6fc; font-weight: 600; font-size: 12px; }
  .lb .row.me .total { color: #3fb950; }
  .lb .stats .sep { color: #30363d; }
  .lb .deposits { color: #8b949e; font-size: 10px; }

  .summary {
    color: #8b949e;
    font-size: 11px;
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: center;
  }
  .summary .stat { display: inline-flex; align-items: baseline; gap: 4px; }
  .summary .stat-icon { font-size: 11px; }
  .summary .stat-value {
    color: #c9d1d9;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
`;

function renderLbRow(
  r: ArmouryLeaderboardResponse['leaderboard'][number],
  viewerId: number,
): string {
  const isMe = r.player_id === viewerId;
  const { display, podium } = rankDecoration(r.rank);
  const meClass = isMe ? ' me' : '';
  const youBadge = isMe ? '<span class="you-badge">you</span>' : '';
  return `
    <div class="row${podium}${meClass}">
      <span class="rank">${display}</span>
      <span class="name">${escapeHtml(r.player_name)}${youBadge}</span>
      <span class="stats">
        <span class="total">${escapeHtml(fmtQty(r.total))}</span>
        <span class="sep">·</span>
        <span class="deposits">${r.deposits} dep</span>
      </span>
    </div>
  `;
}

function renderLeaderboard(lb: ArmouryLeaderboardResponse | undefined, viewerId: number): string {
  if (!lb || lb.leaderboard.length === 0) {
    return `<div class="empty">No deposits logged yet.</div>`;
  }
  const top5 = lb.leaderboard.slice(0, 5);
  const meInTop = top5.some((r) => r.player_id === viewerId);
  const meRow = !meInTop ? lb.leaderboard.find((r) => r.player_id === viewerId) : undefined;
  const rows = top5.map((r) => renderLbRow(r, viewerId)).join('');
  const meTail = meRow ? renderLbRow(meRow, viewerId) : '';
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
  const scope = competitionScope(comp);
  const scopeLabel = comp.prize_text
    ? `${scope.label} · prize: ${comp.prize_text}`
    : scope.label;
  // scope.icon is a literal emoji constant, safe to interpolate raw.
  const subtitleHtml = `<span class="scope-icon">${scope.icon}</span><span>${escapeHtml(scopeLabel)}</span>`;
  const summary = lb
    ? `
      <div class="summary">
        <span class="stat">
          <span class="stat-icon">\u{1F465}</span>
          <span class="stat-value">${lb.participants}</span>
          <span>${lb.participants === 1 ? 'player' : 'players'}</span>
        </span>
        <span class="stat">
          <span class="stat-icon">\u{1F4E6}</span>
          <span class="stat-value">${escapeHtml(fmtQty(lb.total_deposited))}</span>
          <span>deposited</span>
        </span>
      </div>
    `
    : '';
  return `
    <div class="comp">
      <div class="comp-head">
        <div>
          <div class="comp-name">${escapeHtml(comp.name)}</div>
          <div class="comp-meta">${subtitleHtml}</div>
        </div>
        <div class="countdown ${countdown.tone}">${escapeHtml(countdown.label)}</div>
      </div>
      ${renderLeaderboard(lb, viewerId)}
      ${summary}
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
    <div class="footer">Polled every 5 min from Torn's faction news log.</div>
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
