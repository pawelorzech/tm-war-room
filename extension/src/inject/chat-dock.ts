// Persistent chat dock — floating "chat" button bottom-right of every
// torn.com page that expands into a panel with channel selector, message
// stream, and composer.
//
// Polling strategy:
//   - Collapsed: piggybacks on the chat unread polling from elsewhere.
//     Every 30s we GET /api/chat/unread, badge the button if total > 0.
//   - Open + channel selected: every 5s GET ?after=<lastId> for that
//     channel and append.
// On send: POST /api/chat/channels/{id}/messages with content + auto-
// derived mentions (we don't parse them here, server can handle empty).
// On scroll-to-bottom: POST /api/chat/read for the newest visible msg.

import { ensurePersistentHost } from '../lib/persistent-host';
import {
  ApiError,
  fetchChatChannels,
  fetchChatMessages,
  fetchChatUnread,
  markChatRead,
  sendChatMessage,
} from '../lib/api';
import { getAuth, clearAuth } from '../lib/auth';
import { startPolling, type PollHandle } from '../lib/poll';
import type { ChatChannel, ChatMessage } from '../types';

declare const GM_getValue: <T>(key: string, def?: T) => T;
declare const GM_setValue: (key: string, value: unknown) => void;

const HOST_KIND = 'chat-dock';
const HUB_ORIGIN: string =
  (typeof process !== 'undefined' && process.env && (process.env as Record<string, string>).TM_HUB_ORIGIN) ||
  'https://hub.tri.ovh';
const STATE_KEY = 'tm-hub-companion-chat-dock-state';

interface DockState {
  open: boolean;
  channelId: number | null;
}

function loadState(): DockState {
  try {
    const raw = GM_getValue<string>(STATE_KEY, '');
    if (!raw) return { open: false, channelId: null };
    return JSON.parse(raw) as DockState;
  } catch {
    return { open: false, channelId: null };
  }
}

function saveState(s: DockState): void {
  GM_setValue(STATE_KEY, JSON.stringify(s));
}

const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #c9d1d9; }

  /* Collapsed button */
  .btn-launch {
    position: fixed;
    right: 12px;
    bottom: 50px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: #238636;
    border: 0;
    color: #fff;
    box-shadow: 0 6px 16px rgba(0,0,0,0.4);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999900;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .btn-launch:hover { transform: scale(1.05); box-shadow: 0 8px 20px rgba(0,0,0,0.5); }
  .btn-launch svg { width: 20px; height: 20px; fill: #fff; }
  .badge {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 18px;
    height: 18px;
    border-radius: 9px;
    background: #f85149;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    padding: 0 4px;
    border: 2px solid #0d1117;
  }

  /* Expanded panel */
  .panel {
    position: fixed;
    right: 12px;
    bottom: 50px;
    width: 360px;
    height: 480px;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 12px 32px rgba(0,0,0,0.55);
    z-index: 999902;
    overflow: hidden;
  }
  .panel.hidden { display: none; }

  .panel-header {
    height: 40px;
    flex-shrink: 0;
    padding: 0 12px;
    border-bottom: 1px solid #21262d;
    display: flex;
    align-items: center;
    gap: 8px;
    background: #161b22;
  }
  .panel-header .ch-select {
    flex: 1;
    background: transparent;
    border: 1px solid #30363d;
    color: #f0f6fc;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    outline: none;
  }
  .panel-header .ch-select:focus { border-color: #58a6ff; }
  .panel-header .header-btn {
    background: transparent;
    border: 0;
    color: #8b949e;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
  }
  .panel-header .header-btn:hover { color: #f0f6fc; background: #21262d; }
  .panel-header .header-btn svg { width: 14px; height: 14px; fill: currentColor; }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: #0d1117;
    scrollbar-width: thin;
    scrollbar-color: #30363d transparent;
  }
  .messages::-webkit-scrollbar { width: 6px; }
  .messages::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }

  .msg {
    display: flex;
    gap: 8px;
    font-size: 12px;
    line-height: 1.45;
    word-wrap: break-word;
    word-break: break-word;
  }
  .msg .meta-col { flex-shrink: 0; min-width: 0; }
  .msg .author {
    color: #58a6ff;
    font-weight: 600;
    margin-right: 6px;
  }
  .msg .time {
    color: #6e7681;
    font-size: 10px;
  }
  .msg .text {
    color: #c9d1d9;
    white-space: pre-wrap;
  }
  .msg .text.mentioned { background: rgba(210, 153, 34, 0.12); padding: 2px 4px; border-radius: 3px; }

  .new-pill {
    position: absolute;
    left: 50%;
    bottom: 78px;
    transform: translateX(-50%);
    background: #1f6feb;
    color: #fff;
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 12px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    border: 0;
  }
  .new-pill.hidden { display: none; }

  .composer {
    flex-shrink: 0;
    border-top: 1px solid #21262d;
    background: #161b22;
    padding: 8px;
    display: flex;
    gap: 6px;
    align-items: flex-end;
  }
  .composer textarea {
    flex: 1;
    background: #0d1117;
    border: 1px solid #30363d;
    color: #c9d1d9;
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 12px;
    font-family: inherit;
    resize: none;
    min-height: 32px;
    max-height: 100px;
    line-height: 1.4;
    outline: none;
  }
  .composer textarea:focus { border-color: #58a6ff; }
  .composer .send {
    height: 32px;
    padding: 0 12px;
    background: #238636;
    color: #fff;
    border: 0;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .composer .send:disabled { background: #21262d; color: #6e7681; cursor: default; }
  .composer .send:hover:not(:disabled) { background: #2ea043; }
  .composer .hint {
    font-size: 9px;
    color: #6e7681;
    text-align: right;
    padding: 2px 8px 0;
  }

  .empty {
    text-align: center;
    color: #6e7681;
    font-size: 12px;
    padding: 16px;
  }
  .error {
    color: #f85149;
    font-size: 11px;
    padding: 4px 8px;
    background: rgba(248, 81, 73, 0.1);
    border-radius: 4px;
    margin: 6px 0;
  }
`;

interface DockController {
  open: () => void;
  close: () => void;
}

let _state: DockState = loadState();
let _channels: ChatChannel[] = [];
let _messages: ChatMessage[] = [];
let _unreadByChannel: Record<number, number> = {};
let _unreadTotal = 0;
let _lastMsgId = 0;
let _messagePoller: PollHandle | null = null;
let _unreadPoller: PollHandle | null = null;
let _atBottom = true;

export function startChatDock(): DockController {
  const { shadow } = ensurePersistentHost({ kind: HOST_KIND, zIndex: 999900 });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);

  // Render launch button + panel container; visibility controlled by state.
  renderLaunchButton(shadow);
  renderPanel(shadow);

  // Always-on polling for unread badge (cheap, single endpoint).
  _unreadPoller = startPolling({
    name: 'chat-unread',
    intervalMs: 30_000,
    fn: () => pollUnread(shadow),
    immediate: true,
  });

  applyState(shadow);

  return {
    open: () => openDock(shadow),
    close: () => closeDock(shadow),
  };
}

// ── Polling ──────────────────────────────────────────────────

async function pollUnread(shadow: ShadowRoot): Promise<void> {
  const auth = getAuth();
  if (!auth) {
    setBadge(shadow, 0);
    return;
  }
  try {
    const r = await fetchChatUnread(auth);
    _unreadByChannel = Object.fromEntries(
      Object.entries(r.channels || {}).map(([k, v]) => [Number(k), Number(v)]),
    );
    _unreadTotal = Number(r.total || 0);
    setBadge(shadow, _unreadTotal);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      clearAuth();
    }
    throw err;
  }
}

async function pollMessages(shadow: ShadowRoot): Promise<void> {
  const auth = getAuth();
  if (!auth || !_state.channelId) return;
  try {
    const r = await fetchChatMessages(auth, _state.channelId, { after: _lastMsgId, limit: 50 });
    if (r.messages.length === 0) return;
    _messages.push(...r.messages);
    _lastMsgId = Math.max(_lastMsgId, ...r.messages.map((m) => m.id));
    renderMessages(shadow);
    if (_atBottom) {
      scrollToBottom(shadow);
      // Mark as read since user is actively at bottom — sync local state.
      void doMarkRead(shadow, auth, _state.channelId, _lastMsgId);
    } else {
      showNewPill(shadow);
    }
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      clearAuth();
    }
    throw err;
  }
}

// ── State / open / close ────────────────────────────────────

function applyState(shadow: ShadowRoot): void {
  const panel = shadow.querySelector('.panel') as HTMLElement | null;
  if (!panel) return;
  if (_state.open) {
    panel.classList.remove('hidden');
    void initOpenChannel(shadow);
  } else {
    panel.classList.add('hidden');
    stopMessagePolling();
  }
}

function openDock(shadow: ShadowRoot): void {
  _state = { ..._state, open: true };
  saveState(_state);
  applyState(shadow);
}

function closeDock(shadow: ShadowRoot): void {
  _state = { ..._state, open: false };
  saveState(_state);
  applyState(shadow);
}

async function initOpenChannel(shadow: ShadowRoot): Promise<void> {
  const auth = getAuth();
  if (!auth) {
    showError(shadow, 'Connect to TM Hub to use chat.');
    return;
  }
  if (_channels.length === 0) {
    try {
      const r = await fetchChatChannels(auth);
      _channels = r.channels.filter((c) => !c.admin_only); // hide admin-only from base UX
    } catch (err) {
      showError(shadow, 'Could not load channels.');
      return;
    }
    populateChannelSelect(shadow);
  }
  if (!_state.channelId && _channels.length > 0) {
    // Default to "general" if present, else first.
    const general = _channels.find((c) => c.name === 'general') || _channels[0];
    _state.channelId = general.id;
    saveState(_state);
    const sel = shadow.querySelector<HTMLSelectElement>('.ch-select');
    if (sel) sel.value = String(_state.channelId);
  }
  if (_state.channelId) {
    await loadChannelInitial(shadow, _state.channelId);
    startMessagePolling(shadow);
  }
}

async function loadChannelInitial(shadow: ShadowRoot, channelId: number): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  _messages = [];
  _lastMsgId = 0;
  renderMessages(shadow);
  try {
    const r = await fetchChatMessages(auth, channelId, { limit: 50 });
    _messages = r.messages;
    _lastMsgId = _messages.length > 0 ? Math.max(..._messages.map((m) => m.id)) : 0;
    renderMessages(shadow);
    scrollToBottom(shadow);
    if (_lastMsgId > 0) {
      await doMarkRead(shadow, auth, channelId, _lastMsgId);
    }
  } catch (err) {
    showError(shadow, 'Could not load messages.');
  }
}

/**
 * Mark a channel as read AND keep the in-memory unread state in sync so the
 * badge / dropdown numbers update before the next pollUnread tick. We zero
 * out the channel locally first (optimistic), then fire the server call,
 * then poke the unread poller for confirmation.
 */
async function doMarkRead(
  shadow: ShadowRoot,
  auth: ReturnType<typeof getAuth>,
  channelId: number,
  messageId: number,
): Promise<void> {
  if (!auth) return;
  // Optimistic local update — UI feels instant.
  _unreadByChannel[channelId] = 0;
  _unreadTotal = Object.values(_unreadByChannel).reduce((a, b) => a + b, 0);
  setBadge(shadow, _unreadTotal);
  populateChannelSelect(shadow);
  try {
    await markChatRead(auth, channelId, messageId);
  } catch {
    // Server failed — next pollUnread will reconcile.
  }
  // Force an unread refresh so we catch any backend reconciliation (and the
  // case where a new message landed between the mark and our optimistic
  // zero-out).
  if (_unreadPoller) _unreadPoller.poke();
}

function startMessagePolling(shadow: ShadowRoot): void {
  stopMessagePolling();
  _messagePoller = startPolling({
    name: 'chat-messages',
    intervalMs: 5_000,
    fn: () => pollMessages(shadow),
    immediate: false,
  });
}

function stopMessagePolling(): void {
  if (_messagePoller) {
    _messagePoller.stop();
    _messagePoller = null;
  }
}

// ── Rendering ───────────────────────────────────────────────

function renderLaunchButton(shadow: ShadowRoot): void {
  const btn = document.createElement('button');
  btn.className = 'btn-launch';
  btn.title = 'TM Hub chat';
  btn.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
    <span class="badge hidden">0</span>
  `;
  shadow.appendChild(btn);
  btn.addEventListener('click', () => {
    const auth = getAuth();
    if (!auth) {
      // Friendly nudge — same flow as the chip's Connect button.
      window.open(`${HUB_ORIGIN}/extension-auth`, 'tm-hub-companion-auth', 'width=520,height=720');
      return;
    }
    if (_state.open) closeDock(shadow);
    else openDock(shadow);
  });
}

function setBadge(shadow: ShadowRoot, count: number): void {
  const badge = shadow.querySelector<HTMLElement>('.btn-launch .badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderPanel(shadow: ShadowRoot): void {
  const panel = document.createElement('div');
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <div class="panel-header">
      <select class="ch-select"><option value="">Loading…</option></select>
      <button class="header-btn" data-act="open-full" title="Open full TM Hub chat">
        <svg viewBox="0 0 16 16"><path d="M3.5 3a.5.5 0 0 0 0 1H12v8.5a.5.5 0 0 0 1 0V3.5a.5.5 0 0 0-.5-.5h-9z"/><path d="M11.854 5.146a.5.5 0 0 1 0 .708L4.207 13.5H10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5V7a.5.5 0 0 1 1 0v5.793l7.646-7.647a.5.5 0 0 1 .708 0z"/></svg>
      </button>
      <button class="header-btn" data-act="close" title="Close">
        <svg viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
      </button>
    </div>
    <div class="messages"><div class="empty">Loading messages…</div></div>
    <button class="new-pill hidden" data-act="scroll-new">↓ New messages</button>
    <div class="composer">
      <textarea placeholder="Message #general" rows="1"></textarea>
      <button class="send" disabled>Send</button>
    </div>
  `;
  shadow.appendChild(panel);

  // Channel switch
  panel.querySelector<HTMLSelectElement>('.ch-select')?.addEventListener('change', async (e) => {
    const val = Number((e.target as HTMLSelectElement).value);
    if (!val) return;
    _state.channelId = val;
    saveState(_state);
    stopMessagePolling();
    await loadChannelInitial(shadow, val);
    startMessagePolling(shadow);
    updatePlaceholder(shadow);
  });

  // Header actions
  panel.querySelector('[data-act="close"]')?.addEventListener('click', () => closeDock(shadow));
  panel.querySelector('[data-act="open-full"]')?.addEventListener('click', () => {
    window.open(`${HUB_ORIGIN}/chat`, '_blank');
  });
  panel.querySelector('[data-act="scroll-new"]')?.addEventListener('click', () => {
    scrollToBottom(shadow);
    hideNewPill(shadow);
    const auth = getAuth();
    if (auth && _state.channelId && _lastMsgId > 0) {
      void doMarkRead(shadow, auth, _state.channelId, _lastMsgId);
    }
  });

  // Composer
  const ta = panel.querySelector<HTMLTextAreaElement>('.composer textarea')!;
  const sendBtn = panel.querySelector<HTMLButtonElement>('.composer .send')!;
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(100, ta.scrollHeight) + 'px';
    sendBtn.disabled = ta.value.trim().length === 0;
  });
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void doSend(shadow, ta, sendBtn);
    }
  });
  sendBtn.addEventListener('click', () => void doSend(shadow, ta, sendBtn));

  // Scroll tracking — when user scrolls to bottom, hide the "new messages"
  // pill AND mark the channel read since they've now seen everything.
  const messages = panel.querySelector<HTMLElement>('.messages')!;
  let _wasAtBottom = _atBottom;
  messages.addEventListener('scroll', () => {
    const distFromBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight;
    _atBottom = distFromBottom < 80;
    if (_atBottom) {
      hideNewPill(shadow);
      if (!_wasAtBottom) {
        const auth = getAuth();
        if (auth && _state.channelId && _lastMsgId > 0) {
          void doMarkRead(shadow, auth, _state.channelId, _lastMsgId);
        }
      }
    }
    _wasAtBottom = _atBottom;
  });
}

function populateChannelSelect(shadow: ShadowRoot): void {
  const sel = shadow.querySelector<HTMLSelectElement>('.ch-select');
  if (!sel) return;
  sel.innerHTML = _channels
    .map((c) => {
      const unread = _unreadByChannel[c.id] || 0;
      const tag = unread > 0 ? ` · ${unread}` : '';
      return `<option value="${c.id}">#${c.name}${tag}</option>`;
    })
    .join('');
  if (_state.channelId) sel.value = String(_state.channelId);
  updatePlaceholder(shadow);
}

function updatePlaceholder(shadow: ShadowRoot): void {
  const ta = shadow.querySelector<HTMLTextAreaElement>('.composer textarea');
  if (!ta) return;
  const ch = _channels.find((c) => c.id === _state.channelId);
  ta.placeholder = ch ? `Message #${ch.name}` : 'Message';
}

function renderMessages(shadow: ShadowRoot): void {
  const wrap = shadow.querySelector<HTMLElement>('.messages');
  if (!wrap) return;
  if (_messages.length === 0) {
    wrap.innerHTML = '<div class="empty">No messages yet — say hi!</div>';
    return;
  }
  const auth = getAuth();
  const me = auth?.player_id || 0;
  wrap.innerHTML = _messages
    .map((m) => {
      const mentioned = m.mentions.includes(me);
      const time = new Date(m.created_at * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `
        <div class="msg">
          <div>
            <span class="author">${escapeHtml(m.player_name)}</span>
            <span class="time">${time}</span>
            <div class="text${mentioned ? ' mentioned' : ''}">${escapeHtml(m.content)}</div>
          </div>
        </div>
      `;
    })
    .join('');
}

function scrollToBottom(shadow: ShadowRoot): void {
  const wrap = shadow.querySelector<HTMLElement>('.messages');
  if (!wrap) return;
  wrap.scrollTop = wrap.scrollHeight;
  _atBottom = true;
}

function showNewPill(shadow: ShadowRoot): void {
  shadow.querySelector('.new-pill')?.classList.remove('hidden');
}

function hideNewPill(shadow: ShadowRoot): void {
  shadow.querySelector('.new-pill')?.classList.add('hidden');
}

function showError(shadow: ShadowRoot, text: string): void {
  const wrap = shadow.querySelector<HTMLElement>('.messages');
  if (!wrap) return;
  wrap.innerHTML = `<div class="error">${escapeHtml(text)}</div>`;
}

async function doSend(
  shadow: ShadowRoot,
  ta: HTMLTextAreaElement,
  sendBtn: HTMLButtonElement,
): Promise<void> {
  const auth = getAuth();
  if (!auth || !_state.channelId) return;
  const content = ta.value.trim();
  if (!content) return;
  sendBtn.disabled = true;
  try {
    const msg = await sendChatMessage(auth, _state.channelId, content, []);
    ta.value = '';
    ta.style.height = 'auto';
    _messages.push(msg);
    _lastMsgId = Math.max(_lastMsgId, msg.id);
    renderMessages(shadow);
    scrollToBottom(shadow);
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) {
      showError(shadow, 'Slow down — chat rate limit hit.');
    } else if (err instanceof ApiError && err.status === 403) {
      showError(shadow, 'You are muted or this channel is admin-only.');
    } else {
      showError(shadow, 'Could not send message.');
    }
  } finally {
    sendBtn.disabled = ta.value.trim().length === 0;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Avoid unused-variable warning in TypeScript.
void _unreadPoller;
