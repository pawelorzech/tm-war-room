// Toast renderer + native browser Notification bridge.
//
// We render a stack of small cards in the bottom-right of the page (fixed
// position, Shadow DOM isolated so Torn's CSS can't reach in). When the tab
// is hidden, we also fire a native browser Notification — but only after
// the user has granted permission. Permission is requested lazily on the
// first user-initiated click that warrants a toast.

import { ensurePersistentHost } from './persistent-host';
import { loadSettings, updateSettings } from './settings';
import { escapeHtml } from './format';

const TOAST_HOST_KIND = 'toast-stack';
const MAX_VISIBLE = 3;
const DEFAULT_TTL_MS = 8000;

export interface ToastInput {
  /** Stable id used for dedup — if a toast with this id is already shown, skip. */
  id?: string;
  title: string;
  body: string;
  /**
   * Optional pre-sanitized HTML for the title. When provided, replaces the
   * escaped `title` in the rendered toast. Callers are responsible for
   * escaping any user-supplied substrings before composing this string.
   * The plain `title` is still used for the native browser Notification
   * fallback (which only accepts text).
   */
  titleHtml?: string;
  /** Optional click handler. Receives the toast container so callers can close it. */
  onClick?: (close: () => void) => void;
  /** URL to open when toast is clicked. Used as fallback when onClick is omitted. */
  url?: string;
  /** Icon emoji or single character to show on the left. */
  icon?: string;
  /** ms before auto-dismiss. Default 8000. Use 0 for sticky. */
  ttlMs?: number;
  /** Visual tone. */
  tone?: 'info' | 'mention' | 'warn';
}

const STYLES = `
  :host { all: initial; }
  .stack {
    position: fixed;
    right: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    max-width: 340px;
    pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .mark-all {
    pointer-events: auto;
    align-self: flex-end;
    background: rgba(22,27,34,0.92);
    border: 1px solid #30363d;
    color: #8b949e;
    font: 600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 4px 10px;
    border-radius: 12px;
    cursor: pointer;
    display: none;
  }
  .mark-all:hover { color: #c9d1d9; border-color: #6e7681; }
  .mark-all.visible { display: inline-block; }
  .toast {
    pointer-events: auto;
    background: #161b22;
    border: 1px solid #30363d;
    border-left: 3px solid #58a6ff;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    padding: 10px 12px;
    color: #c9d1d9;
    display: flex;
    gap: 10px;
    cursor: pointer;
    animation: slidein 0.2s ease-out;
    transition: opacity 0.2s ease-out, transform 0.2s ease-out;
  }
  .toast.mention { border-left-color: #d29922; }
  .toast.warn { border-left-color: #f85149; }
  .toast.leaving { opacity: 0; transform: translateX(20px); }
  .toast .icon { font-size: 18px; line-height: 1.2; flex-shrink: 0; }
  .toast .body { flex: 1; min-width: 0; }
  .toast .title {
    font-weight: 600;
    font-size: 13px;
    line-height: 1.3;
    color: #f0f6fc;
    margin-bottom: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toast .text {
    font-size: 12px;
    line-height: 1.4;
    color: #8b949e;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .toast .close {
    background: transparent;
    border: 0;
    color: #6e7681;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 0 0 0 4px;
    flex-shrink: 0;
  }
  .toast .close:hover { color: #c9d1d9; }
  @keyframes slidein {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }
`;

let _initialized = false;
const _shown = new Set<string>();
const _queue: ToastInput[] = [];
let _visibleCount = 0;
let _markAllHandler: (() => void | Promise<void>) | null = null;

function initHost(): ShadowRoot {
  const { shadow } = ensurePersistentHost({ kind: TOAST_HOST_KIND, zIndex: 999998 });
  if (!_initialized) {
    const style = document.createElement('style');
    style.textContent = STYLES;
    shadow.appendChild(style);
    const stack = document.createElement('div');
    stack.className = 'stack';
    const button = document.createElement('button');
    button.className = 'mark-all';
    button.type = 'button';
    button.textContent = 'Mark all read';
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      void _markAllHandler?.();
    });
    stack.appendChild(button);
    shadow.appendChild(stack);
    _initialized = true;
  }
  return shadow;
}

function updateMarkAllVisibility(shadow: ShadowRoot): void {
  const button = shadow.querySelector('.mark-all') as HTMLElement | null;
  if (!button) return;
  // Show only when we have a handler bound AND there's at least one toast on
  // screen — clicking with nothing to clear would be a no-op.
  if (_markAllHandler && _visibleCount > 0) button.classList.add('visible');
  else button.classList.remove('visible');
}

function renderOne(input: ToastInput): void {
  const shadow = initHost();
  const stack = shadow.querySelector('.stack') as HTMLElement;
  if (!stack) return;

  const toast = document.createElement('div');
  toast.className = `toast ${input.tone || 'info'}`;
  const titleHtml = input.titleHtml ?? escapeHtml(input.title);
  toast.innerHTML = `
    ${input.icon ? `<span class="icon">${escapeHtml(input.icon)}</span>` : ''}
    <div class="body">
      <div class="title">${titleHtml}</div>
      <div class="text">${escapeHtml(input.body)}</div>
    </div>
    <button class="close" aria-label="dismiss">×</button>
  `;
  stack.appendChild(toast);
  _visibleCount += 1;
  updateMarkAllVisibility(shadow);

  const dismiss = () => {
    toast.classList.add('leaving');
    setTimeout(() => {
      toast.remove();
      _visibleCount = Math.max(0, _visibleCount - 1);
      drainQueue();
      updateMarkAllVisibility(shadow);
    }, 220);
  };

  toast.querySelector('.close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss();
  });

  toast.addEventListener('click', (e) => {
    // If the click landed on an <a> inside titleHtml (or anywhere else),
    // let the anchor's own navigation handle it and skip the toast-level
    // url. Otherwise mention-alert toasts would always pull the user to
    // the hub chat even when they clicked the author profile link.
    const target = e.target as HTMLElement | null;
    if (target && target.closest && target.closest('a')) {
      dismiss();
      return;
    }
    if (input.onClick) {
      input.onClick(dismiss);
    } else if (input.url) {
      window.open(input.url, '_blank');
      dismiss();
    } else {
      dismiss();
    }
  });

  const ttl = input.ttlMs ?? DEFAULT_TTL_MS;
  if (ttl > 0) setTimeout(dismiss, ttl);
}

function drainQueue(): void {
  while (_visibleCount < MAX_VISIBLE && _queue.length > 0) {
    const next = _queue.shift()!;
    renderOne(next);
  }
}

/**
 * Wire (or unwire) the "Mark all read" footer button in the toast tray.
 * The button is shown only while there's at least one toast on screen AND
 * a handler is bound, so it never sits there with nothing to do.
 */
export function setMarkAllReadHandler(handler: (() => void | Promise<void>) | null): void {
  _markAllHandler = handler;
  if (_initialized) {
    const shadow = initHost();
    updateMarkAllVisibility(shadow);
  }
}

/** Immediately dismiss every toast currently in the tray. */
export function dismissAllToasts(): void {
  if (!_initialized) return;
  const shadow = initHost();
  const toasts = shadow.querySelectorAll('.toast');
  toasts.forEach((t) => {
    t.classList.add('leaving');
    setTimeout(() => {
      t.remove();
      _visibleCount = Math.max(0, _visibleCount - 1);
      updateMarkAllVisibility(shadow);
    }, 220);
  });
  // Clear queued items too so the tray actually empties.
  _queue.length = 0;
}

/**
 * Show a toast. Returns true if rendered (or queued), false if deduped.
 * Side-effect: when the document is hidden and native permission has been
 * granted, also fires a `new Notification(...)`.
 */
export function showToast(input: ToastInput): boolean {
  if (input.id && _shown.has(input.id)) return false;
  if (input.id) {
    _shown.add(input.id);
    // Keep dedup set bounded — remember the last 200 ids.
    if (_shown.size > 200) {
      const arr = Array.from(_shown);
      _shown.clear();
      arr.slice(-100).forEach((id) => _shown.add(id));
    }
  }

  if (_visibleCount >= MAX_VISIBLE) {
    _queue.push(input);
  } else {
    renderOne(input);
  }

  fireNativeIfHidden(input);
  return true;
}

function fireNativeIfHidden(input: ToastInput): void {
  if (!document.hidden) return;
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(input.title, {
      body: input.body,
      icon: '/icons/icon-192.png',
      tag: input.id || `${input.title}-${Date.now()}`,
    });
    n.onclick = () => {
      window.focus();
      if (input.url) window.open(input.url, '_blank');
      n.close();
    };
  } catch {
    // Permission revoked or other transient error — fall back silently.
  }
}

/**
 * Ask the user for native Notification permission, but no more often than
 * once a week (configurable in settings). Resolves to the current
 * permission state (granted | denied | default).
 */
export async function ensureNativePermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  const s = loadSettings();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  if (s.nativePermissionRequestedAt > Date.now() - weekMs) {
    return Notification.permission;
  }
  updateSettings({ nativePermissionRequestedAt: Date.now() });
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}
