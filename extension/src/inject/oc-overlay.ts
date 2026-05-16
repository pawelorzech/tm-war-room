// OC 2.0 readiness card on /factions.php?step=crimes.
//
// Shadow-DOM card showing planning + executing organized crimes side by side.
// Each planning crime lists its name, difficulty, slot fill, average CPR, and
// the next ready-at countdown. Executing crimes show participant count and the
// "executed at" relative timestamp. A pill near the top tells the viewer
// whether they're already booked into a planning crime or are free to join.
//
// Visual language mirrors the armoury card so multiple TM Hub cards on the
// same page feel consistent.

import {
  ApiError,
  fetchOcPlanning,
  fetchOcExecuting,
} from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { OC_ANCHOR_SELECTORS } from '../lib/torn-pages';
import { applyBaseStyles, ensureHost } from '../lib/shadow';
import { cardBase } from '../lib/card-styles';
import type { OcCrime } from '../types';
import { HUB_ORIGIN } from '../env';
import { escapeHtml } from '../lib/format';

const TTL_MS = 60_000;
const MAX_PLANNING = 6;
const MAX_EXECUTING = 4;

interface OcCache {
  ts: number;
  planning: OcCrime[];
  executing: OcCrime[];
  error: 'auth' | 'backend' | null;
}

let _cache: OcCache | null = null;

async function getOcData(): Promise<OcCache> {
  if (_cache && Date.now() - _cache.ts < TTL_MS) return _cache;
  const auth = getAuth();
  if (!auth) {
    return { ts: Date.now(), planning: [], executing: [], error: 'auth' };
  }
  try {
    // Sequential — server cache means there's not much win from parallel and
    // we avoid two simultaneous Torn API requests through the backend if the
    // cache happens to be cold.
    const planning = await fetchOcPlanning(auth);
    const executing = await fetchOcExecuting(auth);
    _cache = {
      ts: Date.now(),
      planning: planning.crimes,
      executing: executing.crimes,
      error: null,
    };
    return _cache;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      clearAuth();
      return { ts: Date.now(), planning: [], executing: [], error: 'auth' };
    }
    return { ts: Date.now(), planning: [], executing: [], error: 'backend' };
  }
}


function fmtRelative(ts: number, now: number): string {
  if (!ts) return '';
  const diff = ts - now;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  let label: string;
  if (days >= 2) label = `${days}d ${hours}h`;
  else if (days >= 1) label = `1d ${hours}h`;
  else if (hours >= 1) label = `${hours}h ${minutes}m`;
  else label = `${Math.max(minutes, 1)}m`;
  return diff >= 0 ? `in ${label}` : `${label} ago`;
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n}`;
}

// Filled = participants with a real player_id; total = all slots reported.
// Torn's OC endpoint emits one entry per slot (filled or empty); empty ones
// show up with player_id=0 in our backend parser.
function slotFill(c: OcCrime): { filled: number; total: number } {
  const filled = c.participants.filter((p) => p.player_id > 0).length;
  const total = c.participant_count;
  return { filled, total: Math.max(total, filled) };
}

function avgCpr(c: OcCrime): number | null {
  const real = c.participants.filter((p) => p.player_id > 0);
  if (real.length === 0) return null;
  const sum = real.reduce((acc, p) => acc + (p.checkpoint_pass_rate || 0), 0);
  return Math.round(sum / real.length);
}

function viewerStatus(crimes: OcCrime[], viewerId: number): {
  inCrime: OcCrime | null;
  isReady: boolean;
} {
  const inCrime = crimes.find((c) =>
    c.participants.some((p) => p.player_id === viewerId),
  );
  return { inCrime: inCrime ?? null, isReady: !inCrime };
}

const STYLES = cardBase('#58a6ff') + `
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .status-pill.ready { background: rgba(63,185,80,0.18); color: #3fb950; border: 1px solid rgba(63,185,80,0.4); }
  .status-pill.booked { background: rgba(88,166,255,0.18); color: #58a6ff; border: 1px solid rgba(88,166,255,0.4); }
  .section-title {
    color: #8b949e;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    margin: 12px 0 4px;
  }
  .section-title:first-of-type { margin-top: 0; }
  .crime {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    padding: 8px 10px;
    margin-top: 6px;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 12px;
    align-items: center;
  }
  .crime-name {
    font-weight: 700;
    color: #f0f6fc;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .crime-meta {
    color: #8b949e;
    font-size: 10px;
    grid-column: 1 / -1;
  }
  .badge {
    padding: 2px 8px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .badge.full { background: rgba(63,185,80,0.18); color: #3fb950; }
  .badge.short { background: rgba(210,153,34,0.18); color: #d29922; }
  .badge.cpr-high { background: rgba(63,185,80,0.14); color: #3fb950; }
  .badge.cpr-mid { background: rgba(210,153,34,0.14); color: #d29922; }
  .badge.cpr-low { background: rgba(248,81,73,0.14); color: #f85149; }
  .badge.cooldown { background: rgba(110,118,129,0.18); color: #c9d1d9; }
  .you {
    color: #58a6ff;
    font-weight: 700;
  }
  .footer { margin-top: 10px; }
`;

function cprBadgeClass(cpr: number | null): string {
  if (cpr === null) return 'cpr-low';
  if (cpr >= 75) return 'cpr-high';
  if (cpr >= 50) return 'cpr-mid';
  return 'cpr-low';
}

function renderPlanningCrime(c: OcCrime, viewerId: number, now: number): string {
  const { filled, total } = slotFill(c);
  const cpr = avgCpr(c);
  const fillClass = filled >= total ? 'full' : 'short';
  const cprText = cpr === null ? 'no plans yet' : `avg CPR ${cpr}%`;
  const youInCrime = c.participants.some((p) => p.player_id === viewerId);
  const cooldown =
    c.ready_at && c.ready_at > now
      ? ` · ready ${escapeHtml(fmtRelative(c.ready_at, now))}`
      : '';
  const diff = c.difficulty ? `${escapeHtml(c.difficulty)} · ` : '';
  return `
    <div class="crime">
      <div class="crime-name">
        ${escapeHtml(c.name)}${youInCrime ? ' <span class="you">(you)</span>' : ''}
      </div>
      <div>
        <span class="badge ${fillClass}">${filled}/${total}</span>
        <span class="badge ${cprBadgeClass(cpr)}">${escapeHtml(cprText)}</span>
      </div>
      <div class="crime-meta">${diff}${escapeHtml(c.status || 'planning')}${cooldown}</div>
    </div>
  `;
}

function renderExecutingCrime(c: OcCrime, viewerId: number, now: number): string {
  const youInCrime = c.participants.some((p) => p.player_id === viewerId);
  const exec = c.executed_at ? escapeHtml(fmtRelative(c.executed_at, now)) : '';
  const reward =
    c.money_gain > 0 || c.respect_gain > 0
      ? ` · ${fmtMoney(c.money_gain)} · ${c.respect_gain} respect`
      : '';
  const diff = c.difficulty ? `${escapeHtml(c.difficulty)} · ` : '';
  return `
    <div class="crime">
      <div class="crime-name">
        ${escapeHtml(c.name)}${youInCrime ? ' <span class="you">(you)</span>' : ''}
      </div>
      <div>
        <span class="badge cooldown">${c.participant_count} member${c.participant_count === 1 ? '' : 's'}</span>
      </div>
      <div class="crime-meta">${diff}${exec ? `executed ${exec}` : escapeHtml(c.status || 'executing')}${reward}</div>
    </div>
  `;
}

export async function renderOcOverlay(): Promise<void> {
  const auth = getAuth();
  if (!auth) {
    document.querySelector('[data-tm-companion="oc-overlay"]')?.remove();
    return;
  }
  const data = await getOcData();
  const { host, shadow } = ensureHost('oc-overlay');
  host.style.display = 'block';
  host.style.width = '100%';
  applyBaseStyles(shadow);

  shadow.querySelectorAll('.card, style[data-tm-oc]').forEach((n) => n.remove());
  const style = document.createElement('style');
  style.setAttribute('data-tm-oc', '1');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const card = document.createElement('div');
  card.className = 'card';

  let body = '';
  if (data.error === 'auth') {
    body = `<div class="err">Connect TM Hub from the corner chip to see OCs here.</div>`;
  } else if (data.error === 'backend') {
    body = `<div class="err">TM Hub is unreachable right now. Retrying in a minute.</div>`;
  } else if (data.planning.length === 0 && data.executing.length === 0) {
    body = `<div class="empty">No OCs in planning or execution right now.</div>`;
  } else {
    const now = Math.floor(Date.now() / 1000);
    const { inCrime, isReady } = viewerStatus(data.planning, auth.player_id);

    const statusPill = isReady
      ? `<div class="status-pill ready">✓ You're free — pick a planning OC below</div>`
      : `<div class="status-pill booked">📌 You're booked into <strong>${escapeHtml(inCrime!.name)}</strong></div>`;

    const planningBody =
      data.planning.length > 0
        ? data.planning
            .slice(0, MAX_PLANNING)
            .map((c) => renderPlanningCrime(c, auth.player_id, now))
            .join('')
        : `<div class="empty">Nothing in planning.</div>`;

    const executingBody =
      data.executing.length > 0
        ? data.executing
            .slice(0, MAX_EXECUTING)
            .map((c) => renderExecutingCrime(c, auth.player_id, now))
            .join('')
        : '';

    body = `
      ${statusPill}
      <div class="section-title">Planning (${data.planning.length})</div>
      ${planningBody}
      ${
        executingBody
          ? `<div class="section-title">Executing (${data.executing.length})</div>${executingBody}`
          : ''
      }
    `;
  }

  card.innerHTML = `
    <div class="head">
      <div class="title">🎯 TM Hub OCs</div>
      <a class="link" href="${HUB_ORIGIN}/oc" target="_blank" rel="noopener">Open in TM Hub →</a>
    </div>
    ${body}
    <div class="footer">CPR = checkpoint pass rate per slot, averaged across filled spots. Refreshed every minute.</div>
  `;
  shadow.appendChild(card);

  if (!host.parentElement) {
    for (const sel of OC_ANCHOR_SELECTORS) {
      const anchor = document.querySelector(sel);
      if (anchor) {
        anchor.insertBefore(host, anchor.firstChild);
        return;
      }
    }
    document.body.insertBefore(host, document.body.firstChild);
  }
}
