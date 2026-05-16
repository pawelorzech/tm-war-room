// Intercepts the Attack button on /page.php?sid=attack&user2ID=<id> (or legacy /loader.php) when
// the target is OFF-LIMITS. Renders a confirmation modal — the user can
// still proceed (we don't physically block the attack), but they have to
// click "Attack anyway" explicitly.
//
// We also drop the same badge that profile-badges.ts uses, so the user has
// context next to the modal trigger.
//
// After a fight ends, if the opponent's battle stats are visible on the page,
// we offer a "Submit to TM Hub" button that POSTs the four stats to
// /api/spy/submit. The button is the cheapest possible UI — single chip,
// auto-hides once submitted, never appears when stats aren't revealed.

import type { WarOffLimits } from '../types';
import { ATTACK_BUTTON_SELECTORS } from '../lib/torn-pages';
import { applyBaseStyles, ensureHost } from '../lib/shadow';
import { renderProfileBadge } from './profile-badges';
import { escapeHtml, formatTotal } from '../lib/format';
import { ApiError, submitSpyReport } from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { showToast } from '../lib/notifications';

const INTERCEPT_FLAG = 'tmCompanionIntercepted';

export function renderAttackOverlay(off: WarOffLimits | null): void {
  // Reuse the same card under the attack page header.
  renderProfileBadge(off);

  // Independent of off-limits state — if the fight is over and stats are
  // revealed in the DOM, offer a Submit chip. Both paths can coexist.
  void maybeOfferSpySubmit();

  if (!off) return;

  // Find the primary attack button and intercept its click. We mark buttons
  // we've already hooked so MutationObserver-driven re-runs don't double-bind.
  for (const sel of ATTACK_BUTTON_SELECTORS) {
    const buttons = document.querySelectorAll<HTMLElement>(sel);
    buttons.forEach((btn) => {
      if (btn.dataset[INTERCEPT_FLAG]) return;
      btn.dataset[INTERCEPT_FLAG] = '1';
      const handler = (e: Event) => {
        // Re-check the current off-limits state at click time — if it was
        // cleared between fetch and click, let the click through.
        const stillOff = document.querySelector('[data-tm-companion="profile-badge"]');
        if (!stillOff) return;
        // Bypass flag = user already confirmed once on this very button.
        if (btn.dataset.tmCompanionBypass) {
          delete btn.dataset.tmCompanionBypass;
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        showConfirmModal(off, () => {
          btn.dataset.tmCompanionBypass = '1';
          btn.click();
        });
      };
      btn.addEventListener('click', handler, true); // capture phase, beats Torn's handlers
    });
  }
}

function showConfirmModal(off: WarOffLimits, onConfirm: () => void): void {
  const { host, shadow } = ensureHost('attack-modal');
  applyBaseStyles(shadow);
  // Reset
  shadow.querySelectorAll('.modal-backdrop').forEach((n) => n.remove());

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h2>🚫 Target is OFF-LIMITS</h2>
      <p><strong>${escapeHtml(off.player_name)}</strong> was flagged by
        <strong>${escapeHtml(off.set_by_name)}</strong>.</p>
      ${off.reason ? `<p><em>"${escapeHtml(off.reason)}"</em></p>` : ''}
      <p>Attacking will likely break a med-out or dip agreement. Continue anyway?</p>
      <div class="buttons">
        <button class="btn btn-cancel" data-act="cancel">Cancel</button>
        <button class="btn btn-attack" data-act="attack">Attack anyway</button>
      </div>
    </div>
  `;
  shadow.appendChild(backdrop);

  if (!host.parentElement) {
    document.body.appendChild(host);
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) cleanup();
  });
  shadow.querySelector('[data-act="cancel"]')?.addEventListener('click', cleanup);
  shadow.querySelector('[data-act="attack"]')?.addEventListener('click', () => {
    cleanup();
    onConfirm();
  });

  function cleanup() {
    backdrop.remove();
  }
}

// --- Spy submit chip -------------------------------------------------------
//
// After a fight, Torn shows the loser's STR/DEF/SPD/DEX as plain text inside
// #mainContainer when their stats are public. If all four numbers parse, we
// render a fixed-position chip the user can click to POST /api/spy/submit.
// One chip per fight (idempotent via attribute), removed on success.

const SUBMIT_ATTR = 'data-tm-spy-submit';
const STAT_RE = /([\d,]+(?:\.\d+)?)/;

async function maybeOfferSpySubmit(): Promise<void> {
  const auth = getAuth();
  if (!auth || document.querySelector(`[${SUBMIT_ATTR}]`)) return;
  const uid = new URL(window.location.href).searchParams.get('user2ID');
  if (!uid || !/^\d+$/.test(uid)) return;
  const root = document.getElementById('mainContainer');
  if (!root) return;
  const text = root.textContent || '';
  const pick = (label: string) => {
    const m = text.match(new RegExp(label + ':?\\s+' + STAT_RE.source, 'i'));
    if (!m) return 0;
    const n = parseFloat(m[1].replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const stats = {
    strength: pick('Strength'),
    defense: pick('Defense'),
    speed: pick('Speed'),
    dexterity: pick('Dexterity'),
  };
  if (!stats.strength || !stats.defense || !stats.speed || !stats.dexterity) return;
  const playerId = parseInt(uid, 10);
  const total = stats.strength + stats.defense + stats.speed + stats.dexterity;

  const chip = document.createElement('button');
  chip.setAttribute(SUBMIT_ATTR, '1');
  chip.type = 'button';
  chip.style.cssText =
    'position:fixed;right:16px;top:120px;z-index:999990;padding:8px 14px;background:#161b22;border:1px solid #30363d;border-left:3px solid #58a6ff;border-radius:8px;color:#c9d1d9;font:600 12px -apple-system,BlinkMacSystemFont,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.4)';
  chip.innerHTML = `🛰 Submit spy to TM Hub <span style="color:#8b949e;font-weight:500;">${escapeHtml(formatTotal(total))}</span>`;
  chip.addEventListener('click', async () => {
    chip.disabled = true;
    chip.textContent = 'Submitting…';
    try {
      await submitSpyReport(auth, { player_id: playerId, ...stats });
      showToast({
        id: `spy-submit:${playerId}`,
        title: 'Spy submitted',
        body: `Stats captured for [${playerId}].`,
        icon: '🛰',
        tone: 'info',
        ttlMs: 5000,
      });
      chip.remove();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 401 || status === 403) clearAuth();
      chip.disabled = false;
      chip.textContent = 'Submit failed — retry';
    }
  });
  document.body.appendChild(chip);
}

