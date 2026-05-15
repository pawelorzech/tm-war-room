// Small gear icon at the bottom-right edge of the page with a popover menu
// for muting / disabling Companion channels without opening hub.tri.ovh.
//
// State is reflected from src/lib/settings.ts. Changes are immediate —
// other inject modules read settings on every poll tick.

import { ensurePersistentHost } from '../lib/persistent-host';
import {
  loadSettings,
  updateSettings,
  muteFor,
  unmute,
  type CompanionSettings,
} from '../lib/settings';
import { clearAuth } from '../lib/auth';

const HOST_KIND = 'settings-button';
const HUB_ORIGIN: string =
  (typeof process !== 'undefined' && process.env && (process.env as Record<string, string>).TM_HUB_ORIGIN) ||
  'https://hub.tri.ovh';

const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #c9d1d9; }
  .gear {
    position: fixed;
    right: 12px;
    bottom: 12px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(22, 27, 34, 0.85);
    border: 1px solid #30363d;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.15s;
    z-index: 999999;
  }
  .gear:hover { opacity: 1; }
  .gear svg { width: 16px; height: 16px; fill: #c9d1d9; }
  .menu {
    position: fixed;
    right: 12px;
    bottom: 52px;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.5);
    padding: 8px;
    min-width: 220px;
    font-size: 12px;
    z-index: 1000000;
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
  .row.disabled { opacity: 0.5; cursor: default; }
  .row.disabled:hover { background: transparent; }
  .label { flex: 1; }
  .pill {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    background: #21262d;
    color: #8b949e;
  }
  .pill.on { background: #3fb950; color: #fff; }
  .pill.off { background: #da3633; color: #fff; }
  .sep { height: 1px; background: #30363d; margin: 6px 0; }
  .link {
    color: #58a6ff;
    text-decoration: none;
  }
  .link:hover { text-decoration: underline; }
`;

function formatRemaining(untilMs: number): string {
  const remainingMs = untilMs - Date.now();
  if (remainingMs <= 0) return '';
  const minutes = Math.ceil(remainingMs / 60_000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.ceil(minutes / 60);
  return `${hours}h left`;
}

export function startSettingsButton(): void {
  const { shadow } = ensurePersistentHost({ kind: HOST_KIND, zIndex: 999999 });
  if (shadow.querySelector('.gear')) return; // already mounted

  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const gear = document.createElement('div');
  gear.className = 'gear';
  gear.title = 'TM Hub Companion settings';
  gear.innerHTML = `<svg viewBox="0 0 16 16"><path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/></svg>`;
  shadow.appendChild(gear);

  const menu = document.createElement('div');
  menu.className = 'menu hidden';
  shadow.appendChild(menu);

  function render(): void {
    const s = loadSettings();
    menu.innerHTML = `
      <h4>TM Hub Companion</h4>
      ${row('notifications', 'Inbox notifications', s.notificationsEnabled, s.notificationsMutedUntil)}
      ${row('mentions', 'Chat @mentions', s.mentionsEnabled, s.mentionsMutedUntil)}
      ${row('heartbeat', 'Show me as online', s.heartbeatEnabled, 0)}
      <div class="sep"></div>
      <div class="row" data-act="mute-notif-1h">
        <span class="label">Mute notifications for 1h</span>
      </div>
      <div class="row" data-act="mute-mentions-1h">
        <span class="label">Mute mentions for 1h</span>
      </div>
      <div class="sep"></div>
      <div class="row" data-act="disconnect">
        <span class="label">Disconnect from TM Hub</span>
      </div>
      <div class="row">
        <a class="link" href="${HUB_ORIGIN}/install" target="_blank">Help / reinstall</a>
      </div>
    `;

    menu.querySelectorAll<HTMLElement>('.row[data-toggle]').forEach((el) => {
      el.addEventListener('click', () => {
        const key = el.dataset.toggle as keyof CompanionSettings;
        const current = loadSettings()[key] as boolean;
        updateSettings({ [key]: !current });
        render();
      });
    });
    menu.querySelector('[data-act="mute-notif-1h"]')?.addEventListener('click', () => {
      muteFor('notifications', 60 * 60_000);
      render();
    });
    menu.querySelector('[data-act="mute-mentions-1h"]')?.addEventListener('click', () => {
      muteFor('mentions', 60 * 60_000);
      render();
    });
    menu.querySelector('[data-act="disconnect"]')?.addEventListener('click', () => {
      if (confirm('Disconnect TM Hub Companion? You will need to re-authorize.')) {
        clearAuth();
        menu.classList.add('hidden');
      }
    });
  }

  function row(toggle: string, label: string, enabled: boolean, mutedUntil: number): string {
    const remaining = mutedUntil > 0 ? formatRemaining(mutedUntil) : '';
    const muted = mutedUntil > Date.now();
    const pill = !enabled
      ? '<span class="pill off">off</span>'
      : muted
        ? `<span class="pill off">muted · ${remaining}</span>`
        : '<span class="pill on">on</span>';
    const unmuteAct = muted ? `data-act="unmute-${toggle}"` : '';
    return `
      <div class="row" data-toggle="${toggle}Enabled" ${unmuteAct}>
        <span class="label">${label}</span>
        ${pill}
      </div>
    `;
  }

  gear.addEventListener('click', (e) => {
    e.stopPropagation();
    render();
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!shadow.contains(e.target as Node)) {
      menu.classList.add('hidden');
    }
  });

  // Handle unmute clicks (need delegation because rows re-render).
  menu.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const row = target.closest('[data-act]') as HTMLElement | null;
    if (!row) return;
    const act = row.dataset.act!;
    if (act === 'unmute-notifications') {
      unmute('notifications');
      render();
    } else if (act === 'unmute-mentions') {
      unmute('mentions');
      render();
    }
  });
}
