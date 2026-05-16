// Loot NPC overlay — when the user opens a profile that happens to be a
// known TM Hub loot NPC (Duke, Leslie, Jimmy, Bruno, Easter Bunny, etc),
// inject a dedicated card with:
//   - Current loot level (1–5)
//   - Countdown to next level
//   - Hospital release timer if hospitalized
//   - Faction reservation list (who's waiting on which level)
//   - Quick "Reserve L<n>" / "Cancel reservation" buttons
//
// Detection is data-driven — we ask /api/loot for the canonical list of
// NPCs the backend tracks and match by player_id, so a new NPC added to
// the loot ring will be picked up automatically without a userscript bump.

import {
  ApiError,
  cancelLootReservation,
  fetchLoot,
  reserveLoot,
} from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { PROFILE_ANCHOR_SELECTORS } from '../lib/torn-pages';
import { applyBaseStyles, ensureHost } from '../lib/shadow';
import { attachToProfileStack } from '../lib/profile-stack';
import { cardBase } from '../lib/card-styles';
import { showFormModal } from '../lib/modal';
import { showToast } from '../lib/notifications';
import type { LootNpc } from '../types';

import { HUB_ORIGIN } from '../env';
import { escapeHtml } from '../lib/format';

const TTL_MS = 60_000;
let _lootCache: { ts: number; map: Map<number, LootNpc> } | null = null;

async function getLootMap(): Promise<Map<number, LootNpc>> {
  if (_lootCache && Date.now() - _lootCache.ts < TTL_MS) return _lootCache.map;
  const auth = getAuth();
  if (!auth) return new Map();
  try {
    const r = await fetchLoot(auth);
    const map = new Map<number, LootNpc>();
    for (const npc of r.npcs) map.set(npc.id, npc);
    _lootCache = { ts: Date.now(), map };
    return map;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) clearAuth();
    return new Map();
  }
}

const STYLES = cardBase('#d29922') + `
  .level-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
    margin: 6px 0;
  }
  .lvl {
    background: #0d1117;
    border-radius: 4px;
    padding: 4px 0;
    text-align: center;
    border: 1px solid #21262d;
  }
  .lvl.current { background: rgba(210,153,34,0.2); border-color: #d29922; }
  .lvl.future { opacity: 0.6; }
  .lvl .n { font-weight: 700; color: #f0f6fc; font-size: 12px; }
  .lvl .t { color: #8b949e; font-size: 10px; }
  .lvl.current .t { color: #d29922; }
  .reservation-list {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #21262d;
  }
  .reservation-list .label {
    color: #6e7681;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
  }
  .reservation {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #21262d;
    border-radius: 8px;
    padding: 2px 8px;
    font-size: 11px;
    margin: 2px 4px 2px 0;
  }
  .reservation .l {
    background: #d29922;
    color: #0d1117;
    border-radius: 6px;
    padding: 0 5px;
    font-weight: 700;
    font-size: 9px;
  }
  .reservation.mine { background: rgba(63,185,80,0.2); color: #3fb950; }
  .actions {
    display: flex;
    gap: 6px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #21262d;
  }
  .btn {
    background: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .btn:hover { background: #30363d; border-color: #d29922; color: #f0f6fc; }
  .btn.danger { color: #f85149; border-color: #f85149; }
  .btn.danger:hover { background: rgba(248,81,73,0.1); }
  .hospital {
    color: #f85149;
    font-weight: 600;
    margin: 4px 0;
  }
`;


function fmtCountdown(targetTs: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = targetTs - now;
  if (remaining <= 0) return 'ready';
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function renderLevelGrid(npc: LootNpc): string {
  return `
    <div class="level-grid">
      ${[1, 2, 3, 4, 5]
        .map((lvl) => {
          const isCurrent = lvl === npc.level;
          const isFuture = lvl > npc.level;
          const ts = npc.level_times[String(lvl)];
          let bottom = '';
          if (isCurrent) {
            bottom = 'now';
          } else if (isFuture && ts) {
            bottom = fmtCountdown(ts);
          } else if (!isFuture) {
            bottom = '✓';
          }
          return `
            <div class="lvl ${isCurrent ? 'current' : ''} ${isFuture ? 'future' : ''}">
              <div class="n">L${lvl}</div>
              <div class="t">${bottom}</div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderReservations(npc: LootNpc, mePid: number): string {
  if (!npc.reservations || npc.reservations.length === 0) {
    return `<div class="reservation-list"><div class="label">Reservations</div><span style="color:#6e7681;font-size:11px;">No reservations yet.</span></div>`;
  }
  const items = npc.reservations
    .sort((a, b) => a.target_level - b.target_level)
    .map(
      (r) => `
      <span class="reservation ${r.player_id === mePid ? 'mine' : ''}">
        <span class="l">L${r.target_level}</span>
        ${escapeHtml(r.player_name)}
      </span>
    `,
    )
    .join('');
  return `<div class="reservation-list"><div class="label">Reservations</div>${items}</div>`;
}

function renderActions(npc: LootNpc, mePid: number): string {
  const mine = npc.reservations.find((r) => r.player_id === mePid);
  if (mine) {
    return `
      <div class="actions">
        <button class="btn" data-act="reserve">Change target level</button>
        <button class="btn danger" data-act="cancel">Cancel my reservation</button>
      </div>
    `;
  }
  return `
    <div class="actions">
      <button class="btn" data-act="reserve">Reserve a level</button>
    </div>
  `;
}

export async function renderLootOverlay(playerId: number): Promise<void> {
  const auth = getAuth();
  if (!auth) {
    document.querySelector('[data-tm-companion="loot-overlay"]')?.remove();
    return;
  }
  const map = await getLootMap();
  const npc = map.get(playerId);
  if (!npc) {
    document.querySelector('[data-tm-companion="loot-overlay"]')?.remove();
    return;
  }

  const { host, shadow } = ensureHost('loot-overlay');
  applyBaseStyles(shadow);

  shadow.querySelectorAll('.card, style[data-tm-loot]').forEach((n) => n.remove());
  const style = document.createElement('style');
  style.setAttribute('data-tm-loot', '1');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const card = document.createElement('div');
  card.className = 'card';
  const hospitalLine =
    npc.hosp_out && npc.hosp_out > Math.floor(Date.now() / 1000)
      ? `<div class="hospital">🏥 Hospital release in ${fmtCountdown(npc.hosp_out)}</div>`
      : '';
  card.innerHTML = `
    <div class="head">
      <div class="title">💰 ${escapeHtml(npc.name)} loot</div>
      <a class="link" href="${HUB_ORIGIN}/loot" target="_blank">Open loot tracker →</a>
    </div>
    ${hospitalLine}
    ${renderLevelGrid(npc)}
    ${renderReservations(npc, auth.player_id)}
    ${renderActions(npc, auth.player_id)}
  `;
  shadow.appendChild(card);

  bindLootActions(shadow, npc, auth.player_id);

  if (!host.parentElement) {
    if (attachToProfileStack(host)) return;
    const intelHost = document.querySelector('[data-tm-companion="profile-intel"]');
    if (intelHost && intelHost.parentElement) {
      intelHost.parentElement.insertBefore(host, intelHost.nextSibling);
      return;
    }
    for (const sel of PROFILE_ANCHOR_SELECTORS) {
      const anchor = document.querySelector(sel);
      if (anchor) {
        anchor.insertBefore(host, anchor.firstChild);
        return;
      }
    }
    document.body.insertBefore(host, document.body.firstChild);
  }
}

function bindLootActions(shadow: ShadowRoot, npc: LootNpc, mePid: number): void {
  const auth = getAuth();
  if (!auth) return;

  shadow.querySelector('[data-act="reserve"]')?.addEventListener('click', async () => {
    const mine = npc.reservations.find((r) => r.player_id === mePid);
    const result = await showFormModal({
      title: `💰 Reserve ${npc.name}`,
      description:
        'Pick the loot level you want to claim. Other faction members will see your reservation in TM Hub.',
      fields: [
        {
          name: 'level',
          label: 'Target level',
          type: 'select',
          options: [
            { value: '1', label: 'Level 1' },
            { value: '2', label: 'Level 2' },
            { value: '3', label: 'Level 3' },
            { value: '4', label: 'Level 4' },
            { value: '5', label: 'Level 5 (jackpot)' },
          ],
          initialValue: String(mine?.target_level || 5),
        },
      ],
      submitLabel: mine ? 'Update' : 'Reserve',
    });
    if (!result || result.kind !== 'submit') return;
    try {
      await reserveLoot(auth, {
        npc_id: npc.id,
        npc_name: npc.name,
        target_level: parseInt(result.values.level, 10),
      });
      showToast({
        title: 'Loot reservation saved',
        body: `${npc.name} · L${result.values.level}`,
        icon: '💰',
        tone: 'info',
      });
      _lootCache = null;
      window.dispatchEvent(new CustomEvent('tm-companion-refresh'));
      void renderLootOverlay(npc.id);
    } catch {
      showToast({ title: 'Could not save reservation', body: 'Backend error.', icon: '⚠️', tone: 'warn' });
    }
  });

  shadow.querySelector('[data-act="cancel"]')?.addEventListener('click', async () => {
    if (!confirm(`Cancel your reservation on ${npc.name}?`)) return;
    try {
      await cancelLootReservation(auth, npc.id);
      showToast({ title: 'Reservation cancelled', body: npc.name, icon: '💰', tone: 'info' });
      _lootCache = null;
      window.dispatchEvent(new CustomEvent('tm-companion-refresh'));
      void renderLootOverlay(npc.id);
    } catch {
      showToast({ title: 'Could not cancel', body: 'Backend error.', icon: '⚠️', tone: 'warn' });
    }
  });
}
