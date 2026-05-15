// Persistent status chip pinned to the bottom-right of every torn.com page.
//
// Two purposes:
//   1) Show the user that the TM Hub Companion is loaded and which version
//      they're running — no more wondering "did it install?".
//   2) Subsume the old settings gear into the same chip, so we don't have
//      two competing bottom-right widgets.
//
// Connected state:   "⚡ TM Hub Companion v0.4.0 · @Bombel"   [⚙]
// Disconnected:      "⚡ TM Hub Companion · not connected"    [Connect]
//
// Click on the text/icon opens hub.tri.ovh in a new tab. The gear opens
// the settings popover. The popover is itself shadow-DOM-isolated and
// stays open until the user clicks outside.

import { ensurePersistentHost } from '../lib/persistent-host';
import {
  loadSettings,
  updateSettings,
  muteFor,
  unmute,
} from '../lib/settings';
import { getAuth, clearAuth } from '../lib/auth';
import type { CompanionAuth } from '../types';

const HOST_KIND = 'status-chip';
const HUB_ORIGIN: string =
  (typeof process !== 'undefined' && process.env && (process.env as Record<string, string>).TM_HUB_ORIGIN) ||
  'https://hub.tri.ovh';
const COMPANION_VERSION: string =
  (typeof process !== 'undefined' && process.env && (process.env as Record<string, string>).TM_COMPANION_VERSION) ||
  '0.0.0';

const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #c9d1d9; }
  .chip {
    position: fixed;
    left: 12px;
    bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 6px 0 10px;
    border-radius: 14px;
    background: rgba(22, 27, 34, 0.92);
    border: 1px solid #30363d;
    font-size: 11px;
    line-height: 1;
    opacity: 0.75;
    transition: opacity 0.15s ease-out, transform 0.15s ease-out;
    z-index: 999900;
    box-shadow: 0 4px 12px rgba(0,0,0,0.35);
  }
  .chip:hover { opacity: 1; }
  .chip.disconnected { border-color: #d29922; }
  .chip .bolt { color: #f0883e; font-size: 12px; }
  .chip .label { color: #c9d1d9; cursor: pointer; }
  .chip .user { color: #58a6ff; }
  .chip .label:hover { color: #f0f6fc; }
  .chip .ver { color: #6e7681; font-size: 10px; }
  .chip .divider { color: #30363d; }
  .chip .btn {
    background: transparent;
    border: 0;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #8b949e;
    cursor: pointer;
    padding: 0;
  }
  .chip .btn:hover { background: #21262d; color: #f0f6fc; }
  .chip .btn svg { width: 13px; height: 13px; fill: currentColor; }
  .chip .connect {
    background: #d29922;
    color: #fff;
    border: 0;
    border-radius: 10px;
    height: 20px;
    padding: 0 10px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
  }
  .chip .connect:hover { background: #e3b34d; }

  /* Settings popover */
  .menu {
    position: fixed;
    left: 12px;
    bottom: 48px;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.5);
    padding: 8px;
    min-width: 230px;
    font-size: 12px;
    z-index: 999901;
  }
  .menu.hidden { display: none; }
  .menu h4 {
    margin: 6px 8px 4px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6e7681;
    font-weight: 600;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
  }
  .row:hover { background: #21262d; }
  .label { flex: 1; }
  .pill {
    font-size: 9px;
    padding: 1px 6px;
    border-radius: 8px;
    background: #21262d;
    color: #8b949e;
  }
  .pill.on { background: #238636; color: #fff; }
  .pill.off { background: #6e7681; color: #fff; }
  .pill.muted { background: #d29922; color: #fff; }
  .sep { height: 1px; background: #30363d; margin: 6px 0; }
  .link { color: #58a6ff; text-decoration: none; }
  .link:hover { text-decoration: underline; }
`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatRemaining(untilMs: number): string {
  const remainingMs = untilMs - Date.now();
  if (remainingMs <= 0) return '';
  const minutes = Math.ceil(remainingMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.ceil(minutes / 60)}h`;
}

let _rendered = false;
let _renderTimer: ReturnType<typeof setInterval> | null = null;

export function startStatusChip(): void {
  const { shadow } = ensurePersistentHost({ kind: HOST_KIND, zIndex: 999900 });
  if (!_rendered) {
    const style = document.createElement('style');
    style.textContent = STYLES;
    shadow.appendChild(style);
    _rendered = true;
  }

  const render = () => {
    const auth = getAuth();
    renderChip(shadow, auth);
  };

  render();
  // Poll auth state every 5s — covers cases like token expiry, manual
  // Disconnect from settings menu, or new login via /extension-auth.
  if (_renderTimer) clearInterval(_renderTimer);
  _renderTimer = setInterval(render, 5_000);
}

function openSettingsMenu(shadow: ShadowRoot): void {
  const menu = shadow.querySelector<HTMLElement>('.menu');
  if (!menu) return;
  renderMenu(shadow);
  menu.classList.remove('hidden');
}

function closeSettingsMenu(shadow: ShadowRoot): void {
  shadow.querySelector('.menu')?.classList.add('hidden');
}

function renderChip(shadow: ShadowRoot, auth: CompanionAuth | null): void {
  // Remove old chip if exists, re-render fresh.
  shadow.querySelectorAll('.chip').forEach((n) => n.remove());

  const chip = document.createElement('div');
  chip.className = `chip ${auth ? 'connected' : 'disconnected'}`;

  if (auth) {
    chip.innerHTML = `
      <span class="bolt">⚡</span>
      <span class="label" data-act="open-hub">
        TM Hub Companion
        <span class="ver">v${COMPANION_VERSION}</span>
        <span class="divider">·</span>
        <span class="user">@${escapeHtml(auth.player_name || `#${auth.player_id}`)}</span>
      </span>
      <button class="btn" data-act="settings" title="Settings">
        <svg viewBox="0 0 16 16"><path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/></svg>
      </button>
    `;
  } else {
    chip.innerHTML = `
      <span class="bolt" style="opacity:0.6">⚡</span>
      <span class="label" style="color:#8b949e">TM Hub Companion · not connected</span>
      <button class="connect" data-act="connect">Connect</button>
    `;
  }

  shadow.appendChild(chip);

  chip.querySelector('[data-act="open-hub"]')?.addEventListener('click', () => {
    window.open(HUB_ORIGIN, '_blank');
  });
  chip.querySelector('[data-act="settings"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = shadow.querySelector<HTMLElement>('.menu');
    if (menu && !menu.classList.contains('hidden')) {
      closeSettingsMenu(shadow);
    } else {
      openSettingsMenu(shadow);
    }
  });
  chip.querySelector('[data-act="connect"]')?.addEventListener('click', () => {
    const popup = window.open(
      `${HUB_ORIGIN}/extension-auth`,
      'tm-hub-companion-auth',
      'width=520,height=720,resizable=yes,scrollbars=yes',
    );
    if (!popup) window.open(`${HUB_ORIGIN}/extension-auth`, '_blank');
  });

  // Ensure menu element exists (rendered lazily on first open, but the
  // host node needs to be in DOM regardless).
  if (!shadow.querySelector('.menu')) {
    const menu = document.createElement('div');
    menu.className = 'menu hidden';
    shadow.appendChild(menu);
    // One-time outside-click handler.
    document.addEventListener('click', (e) => {
      const target = e.target as Node;
      if (!shadow.host.contains(target)) {
        closeSettingsMenu(shadow);
      }
    });
  }
}

function renderMenu(shadow: ShadowRoot): void {
  const menu = shadow.querySelector<HTMLElement>('.menu');
  if (!menu) return;
  const s = loadSettings();

  const notifMuted = s.notificationsMutedUntil > Date.now();
  const mentionMuted = s.mentionsMutedUntil > Date.now();

  menu.innerHTML = `
    <h4>Companion · channels</h4>
    ${rowToggle('notificationsEnabled', 'Inbox notifications', s.notificationsEnabled, s.notificationsMutedUntil)}
    ${rowToggle('mentionsEnabled', 'Chat @mentions', s.mentionsEnabled, s.mentionsMutedUntil)}
    ${rowToggle('heartbeatEnabled', 'Show me as online', s.heartbeatEnabled, 0)}
    <div class="sep"></div>
    <h4>Quick mute</h4>
    ${notifMuted
      ? `<div class="row" data-act="unmute-notif"><span class="label">Unmute notifications</span><span class="pill muted">${formatRemaining(s.notificationsMutedUntil)} left</span></div>`
      : `<div class="row" data-act="mute-notif-1h"><span class="label">Mute notifications · 1h</span></div>`
    }
    ${mentionMuted
      ? `<div class="row" data-act="unmute-mentions"><span class="label">Unmute mentions</span><span class="pill muted">${formatRemaining(s.mentionsMutedUntil)} left</span></div>`
      : `<div class="row" data-act="mute-mentions-1h"><span class="label">Mute mentions · 1h</span></div>`
    }
    <div class="sep"></div>
    <div class="row" data-act="open-install">
      <a class="link" href="${HUB_ORIGIN}/install" target="_blank">Open companion page →</a>
    </div>
    <div class="row" data-act="disconnect">
      <span class="label" style="color:#f85149">Disconnect from TM Hub</span>
    </div>
  `;

  // Toggle handlers
  menu.querySelectorAll<HTMLElement>('[data-toggle]').forEach((el) => {
    const key = el.dataset.toggle as 'notificationsEnabled' | 'mentionsEnabled' | 'heartbeatEnabled';
    el.addEventListener('click', () => {
      const cur = loadSettings()[key];
      updateSettings({ [key]: !cur });
      renderMenu(shadow);
    });
  });

  // Action handlers
  menu.querySelector('[data-act="mute-notif-1h"]')?.addEventListener('click', () => {
    muteFor('notifications', 60 * 60_000);
    renderMenu(shadow);
  });
  menu.querySelector('[data-act="mute-mentions-1h"]')?.addEventListener('click', () => {
    muteFor('mentions', 60 * 60_000);
    renderMenu(shadow);
  });
  menu.querySelector('[data-act="unmute-notif"]')?.addEventListener('click', () => {
    unmute('notifications');
    renderMenu(shadow);
  });
  menu.querySelector('[data-act="unmute-mentions"]')?.addEventListener('click', () => {
    unmute('mentions');
    renderMenu(shadow);
  });
  menu.querySelector('[data-act="disconnect"]')?.addEventListener('click', () => {
    if (confirm('Disconnect TM Hub Companion? You will need to re-authorize.')) {
      clearAuth();
      closeSettingsMenu(shadow);
      // Force chip to re-render in disconnected state on next 5s tick;
      // poke it now for snappier feedback.
      renderChip(shadow, null);
    }
  });
}

function rowToggle(key: string, label: string, enabled: boolean, mutedUntil: number): string {
  const muted = mutedUntil > Date.now();
  const pill = !enabled
    ? '<span class="pill off">off</span>'
    : muted
      ? '<span class="pill muted">muted</span>'
      : '<span class="pill on">on</span>';
  return `<div class="row" data-toggle="${key}"><span class="label">${label}</span>${pill}</div>`;
}
