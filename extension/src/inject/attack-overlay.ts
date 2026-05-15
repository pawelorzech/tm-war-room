// Intercepts the Attack button on /loader.php?sid=attack&user2ID=<id> when
// the target is OFF-LIMITS. Renders a confirmation modal — the user can
// still proceed (we don't physically block the attack), but they have to
// click "Attack anyway" explicitly.
//
// We also drop the same badge that profile-badges.ts uses, so the user has
// context next to the modal trigger.

import type { WarOffLimits } from '../types';
import { ATTACK_BUTTON_SELECTORS } from '../lib/torn-pages';
import { applyBaseStyles, ensureHost } from '../lib/shadow';
import { renderProfileBadge } from './profile-badges';

const INTERCEPT_FLAG = 'tmCompanionIntercepted';

export function renderAttackOverlay(off: WarOffLimits | null): void {
  // Reuse the same card under the attack page header.
  renderProfileBadge(off);
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
