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
  addChatReaction,
  ApiError,
  fetchChatChannels,
  fetchChatCommands,
  fetchChatMessages,
  fetchChatUnread,
  fetchMemberAvatars,
  fetchOverview,
  markChatRead,
  removeChatReaction,
  sendChatMessage,
} from '../lib/api';
import { getAuth, clearAuth, openAuthPage } from '../lib/auth';
import { startPolling, type PollHandle } from '../lib/poll';
import type { ChatChannel, ChatMessage } from '../types';

declare const GM_getValue: <T>(key: string, def?: T) => T;
declare const GM_setValue: (key: string, value: unknown) => void;

import { HUB_ORIGIN } from '../env';
import { escapeHtml } from '../lib/format';
import { renderMessageBody, wireReactionHandlers } from '../lib/chat-render';
import {
  detectSlashContext,
  filterCommands,
  nextIndex,
  type ChatCommandInfo,
} from '../lib/chat-commands';

const HOST_KIND = 'chat-dock';
const STATE_KEY = 'tm-hub-companion-chat-dock-state';
const ONBOARD_SEEN_KEY = 'seen-onboard-popover';

function getOnboardSeen(): boolean {
  return Boolean(GM_getValue<boolean>(ONBOARD_SEEN_KEY, false));
}

function setOnboardSeen(): void {
  GM_setValue(ONBOARD_SEEN_KEY, true);
}

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

  /* Disconnected state — yellow ring, plug icon, gentle pulse so first-time
     visitors don't mistake it for a passive UI element. */
  .btn-launch.disconnected {
    background: #161b22;
    border: 2px solid #d29922;
    color: #d29922;
    animation: tm-pulse-ring 2s ease-in-out infinite;
  }
  .btn-launch.disconnected svg { fill: #d29922; width: 18px; height: 18px; }
  .btn-launch.disconnected:hover { background: #21262d; }
  @keyframes tm-pulse-ring {
    0%, 100% { box-shadow: 0 6px 16px rgba(0,0,0,0.4), 0 0 0 0 rgba(210,153,34,0.45); }
    50%      { box-shadow: 0 6px 16px rgba(0,0,0,0.4), 0 0 0 8px rgba(210,153,34,0); }
  }

  /* Onboarding popover — anchored above the launch button. */
  .onboard {
    position: fixed;
    right: 12px;
    bottom: 108px;
    width: 280px;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 10px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.55);
    padding: 14px 14px 12px;
    z-index: 999903;
    font-size: 12px;
    line-height: 1.45;
  }
  .onboard::after {
    content: '';
    position: absolute;
    right: 22px;
    bottom: -7px;
    width: 12px;
    height: 12px;
    background: #161b22;
    border-right: 1px solid #30363d;
    border-bottom: 1px solid #30363d;
    transform: rotate(45deg);
  }
  .onboard .head {
    color: #f0f6fc;
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 6px;
  }
  .onboard .body {
    color: #8b949e;
    margin-bottom: 12px;
  }
  .onboard .actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }
  .onboard .obtn {
    border: 0;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .onboard .obtn.secondary { background: transparent; color: #8b949e; }
  .onboard .obtn.secondary:hover { background: #21262d; color: #c9d1d9; }
  .onboard .obtn.primary { background: #d29922; color: #fff; }
  .onboard .obtn.primary:hover { background: #e3b34d; }
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
    gap: 2px;
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
    padding: 1px 0;
  }
  .msg.group-start { margin-top: 6px; }
  .msg .avatar-col {
    flex: 0 0 28px;
    width: 28px;
    display: flex;
    justify-content: flex-end;
    align-items: flex-start;
  }
  .msg .avatar-col img,
  .msg .avatar-col .avatar-fallback {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    display: block;
  }
  .msg .avatar-col .avatar-fallback {
    background: #21262d;
    color: #c9d1d9;
    font-size: 10px;
    font-weight: 700;
    text-align: center;
    line-height: 28px;
    text-transform: uppercase;
  }
  .msg .avatar-col .avatar-fallback.bot {
    background: rgba(210, 153, 34, 0.18);
    color: #d29922;
  }
  /* Hover-revealed timestamp gutter for grouped messages */
  .msg .avatar-col .gutter-time {
    font-size: 9px;
    color: #6e7681;
    text-align: right;
    padding-right: 2px;
    line-height: 1;
    padding-top: 4px;
    opacity: 0;
    transition: opacity 0.1s;
    user-select: none;
    width: 100%;
  }
  .msg:hover .avatar-col .gutter-time { opacity: 1; }
  .msg .body-col { flex: 1; min-width: 0; }
  .msg .author {
    color: #58a6ff;
    font-weight: 600;
    margin-right: 6px;
    text-decoration: none;
  }
  .msg a.author:hover { text-decoration: underline; }
  .msg .author.bot { color: #d29922; }
  .msg .text a.mention {
    color: #58a6ff;
    background: rgba(88, 166, 255, 0.12);
    padding: 0 2px;
    border-radius: 3px;
    text-decoration: none;
    font-weight: 500;
  }
  .msg .text a.mention:hover { text-decoration: underline; }
  .msg .text .mention {
    color: #58a6ff;
    background: rgba(88, 166, 255, 0.06);
    padding: 0 2px;
    border-radius: 3px;
  }
  .msg .text a.link {
    color: #58a6ff;
    text-decoration: underline;
    text-underline-offset: 2px;
    word-break: break-all;
  }
  .msg .text a.link:hover { color: #79b8ff; }
  .msg .time {
    color: #6e7681;
    font-size: 10px;
  }
  .msg .text {
    color: #c9d1d9;
    white-space: pre-wrap;
  }
  .msg .text.mentioned { background: rgba(210, 153, 34, 0.12); padding: 2px 4px; border-radius: 3px; }

  .msg .reactions {
    display: flex; flex-wrap: wrap; gap: 4px;
    margin-top: 4px;
  }
  .msg .reaction-chip {
    display: inline-flex; align-items: center; gap: 4px;
    height: 22px; padding: 0 8px;
    border-radius: 999px;
    border: 1px solid #30363d;
    background: #161b22;
    color: #c9d1d9;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    user-select: none;
  }
  .msg .reaction-chip:hover { border-color: rgba(35, 134, 54, 0.4); }
  .msg .reaction-chip.mine {
    border-color: rgba(35, 134, 54, 0.6);
    background: rgba(35, 134, 54, 0.12);
    color: #56d364;
  }
  .msg .reaction-chip .count { font-weight: 600; font-variant-numeric: tabular-nums; }
  .msg { position: relative; }
  .msg .reaction-add-trigger {
    position: absolute;
    top: 2px; right: 6px;
    width: 22px; height: 22px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 6px;
    border: 1px solid #30363d;
    background: #161b22;
    color: #6e7681;
    cursor: pointer;
    opacity: 0;
    transition: opacity 120ms;
    font-size: 12px;
    line-height: 1;
  }
  .msg:hover .reaction-add-trigger, .msg .reaction-add-trigger.open { opacity: 1; }
  .msg .reaction-add-trigger:hover { color: #c9d1d9; border-color: #6e7681; }
  .reaction-picker {
    position: absolute; z-index: 5;
    display: flex; flex-wrap: wrap; gap: 2px;
    max-width: 200px;
    padding: 4px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  .reaction-picker button {
    width: 24px; height: 24px;
    background: transparent; border: none; border-radius: 4px;
    color: #c9d1d9; font-size: 14px; line-height: 1;
    cursor: pointer;
  }
  .reaction-picker button:hover { background: #30363d; }

  .composer { position: relative; }
  .cmd-autocomplete {
    position: absolute;
    left: 8px; right: 8px;
    bottom: 100%;
    margin-bottom: 6px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    max-height: 180px;
    overflow-y: auto;
    z-index: 10;
  }
  .cmd-autocomplete.hidden { display: none; }
  .cmd-row {
    display: flex; gap: 8px; align-items: baseline;
    width: 100%;
    padding: 6px 10px;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    color: #c9d1d9;
    font: inherit;
  }
  .cmd-row:hover, .cmd-row.selected { background: #30363d; }
  .cmd-row .name { color: #58a6ff; font-weight: 600; font-family: monospace; }
  .cmd-row .desc { color: #6e7681; font-size: 11px; }
  .cmd-empty { padding: 6px 10px; color: #6e7681; font-size: 11px; }

  .date-sep {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 2px 2px;
  }
  .date-sep .line {
    flex: 1 1 auto;
    height: 1px;
    background: #30363d;
  }
  .date-sep span.label {
    flex: 0 0 auto;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #c9d1d9;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 999px;
    padding: 2px 10px;
    white-space: nowrap;
  }

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
// Faction roster (playerId → name). Used to linkify @mentions inside message
// content — only IDs that appear in a message's `mentions[]` AND match a
// known faction member become clickable.
let _roster: Map<number, string> = new Map();
// Avatar URLs keyed by player_id (B2-hosted member avatars).
let _avatars: Map<number, string> = new Map();

async function loadRoster(): Promise<void> {
  if (_roster.size > 0) return;
  const auth = getAuth();
  if (!auth) return;
  try {
    const ov = await fetchOverview(auth);
    _roster = new Map(ov.members.map((m) => [m.id, m.name]));
  } catch {
    // Dock still works without — mentions just fall back to styled non-link.
  }
}

async function loadAvatars(): Promise<void> {
  if (_avatars.size > 0) return;
  const auth = getAuth();
  if (!auth) return;
  try {
    const r = await fetchMemberAvatars(auth);
    _avatars = new Map(
      Object.entries(r.avatars).map(([k, v]) => [Number(k), v]),
    );
  } catch {
    // Falls back to initials avatar.
  }
}

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

  // Prime the faction roster once so @mentions can be linkified. Re-renders
  // pull from _roster, so a late arrival just upgrades visible mentions on
  // the next render tick (poll cadence). No-op if not authenticated yet.
  void loadRoster();
  // Same idea for avatars — late arrival just upgrades the next render.
  void loadAvatars();

  // Heartbeat: flip the launch-button between connected (green chat) and
  // disconnected (yellow plug) variants without requiring a page reload.
  // Cheap — single getAuth() + maybe a node swap. Matches the cadence of
  // the status chip so the two stay in sync visually.
  setInterval(() => renderLaunchButton(shadow), 5_000);

  // First-run nudge: if the user is not connected AND has never seen the
  // popover, surface it ~1.5s after page load (gives Torn time to paint
  // its own chrome so our popover doesn't fight for attention).
  if (!getAuth() && !getOnboardSeen()) {
    setTimeout(() => {
      if (!getAuth() && !getOnboardSeen()) {
        // Persist "seen" the moment the auto-popover renders, not on
        // dismiss. Otherwise a user who navigates away (or whose first
        // tap on Connect didn't navigate, like on PDA pre-fix) sees the
        // same prompt on every page load.
        setOnboardSeen();
        showOnboardPopover(shadow);
      }
    }, 1500);
  }

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
  // Idempotent — re-renders flip the visual state when auth flips. Triggered
  // by the 5s heartbeat in startChatDock plus by the auth-listener handoff.
  shadow.querySelectorAll('.btn-launch').forEach((n) => n.remove());

  const auth = getAuth();
  const btn = document.createElement('button');
  btn.className = auth ? 'btn-launch' : 'btn-launch disconnected';
  btn.title = auth ? 'TM Hub chat' : 'Connect TM Hub Companion';
  btn.innerHTML = auth
    ? `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
       <span class="badge hidden">0</span>`
    // Plug icon — visual cue that something needs to be plugged in.
    : `<svg viewBox="0 0 24 24"><path d="M16 7V3h-2v4h-4V3H8v4H6c-1.1 0-2 .9-2 2v5.5c0 1.93 1.57 3.5 3.5 3.5V21h2v-3h5v3h2v-3.01c1.93 0 3.5-1.56 3.5-3.49V9c0-1.1-.9-2-2-2h-2z"/></svg>`;
  shadow.appendChild(btn);

  btn.addEventListener('click', () => {
    const a = getAuth();
    if (!a) {
      // Always show the popover-monit on click — it acts as a gate that
      // explains what's about to happen. Even users who dismissed the
      // auto-shown variant get this on the next click.
      showOnboardPopover(shadow);
      return;
    }
    if (_state.open) closeDock(shadow);
    else openDock(shadow);
  });
}

function showOnboardPopover(shadow: ShadowRoot): void {
  // Remove any prior popover so successive triggers don't stack.
  shadow.querySelectorAll('.onboard').forEach((n) => n.remove());

  const pop = document.createElement('div');
  pop.className = 'onboard';
  pop.innerHTML = `
    <div class="head">👋 TM Hub Companion is installed</div>
    <div class="body">
      Connect with your Torn API key to enable chat, attack overlay,
      bounty hints and more. The form opens in a window — we'll bring
      you right back here when it's done.
    </div>
    <div class="actions">
      <button class="obtn secondary" data-act="later">Later</button>
      <button class="obtn primary" data-act="connect">Connect now</button>
    </div>
  `;
  shadow.appendChild(pop);

  const cleanup = () => {
    pop.remove();
    setOnboardSeen();
    document.removeEventListener('click', outsideHandler);
  };

  // Outside click dismisses. Defer attaching the listener so the click that
  // opened the popover (when it came from the launch button) doesn't
  // immediately close it.
  function outsideHandler(e: MouseEvent): void {
    const target = e.target as Node;
    if (!shadow.host.contains(target)) cleanup();
  }
  setTimeout(() => document.addEventListener('click', outsideHandler), 100);

  pop.querySelector('[data-act="connect"]')?.addEventListener('click', () => {
    cleanup();
    openAuthPage(HUB_ORIGIN);
  });
  pop.querySelector('[data-act="later"]')?.addEventListener('click', cleanup);
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
  const composerWrap = panel.querySelector<HTMLElement>('.composer')!;
  let _autocompleteIndex = 0;
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(100, ta.scrollHeight) + 'px';
    sendBtn.disabled = ta.value.trim().length === 0;
    updateAutocomplete(composerWrap, ta.value);
  });
  ta.addEventListener('keydown', (e) => {
    const visible = isAutocompleteOpen(composerWrap);
    if (visible && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const list = currentAutocompleteList();
      _autocompleteIndex = nextIndex(
        _autocompleteIndex,
        list.length,
        e.key === 'ArrowDown' ? 'down' : 'up',
      );
      paintAutocompleteSelection(composerWrap, _autocompleteIndex);
      return;
    }
    if (visible && (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey))) {
      e.preventDefault();
      const list = currentAutocompleteList();
      const picked = list[_autocompleteIndex] ?? list[0];
      if (picked) acceptAutocomplete(ta, picked);
      hideAutocomplete(composerWrap);
      return;
    }
    if (visible && e.key === 'Escape') {
      e.preventDefault();
      hideAutocomplete(composerWrap);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void doSend(shadow, ta, sendBtn);
    }
  });
  ta.addEventListener('blur', () => {
    // Delay so a click on a dropdown row still registers.
    setTimeout(() => hideAutocomplete(composerWrap), 120);
  });
  sendBtn.addEventListener('click', () => void doSend(shadow, ta, sendBtn));

  // Dropdown row clicks
  composerWrap.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.cmd-row');
    if (!row) return;
    const name = row.dataset.cmd;
    if (!name) return;
    acceptAutocomplete(ta, { name, description: row.dataset.desc ?? '' });
    hideAutocomplete(composerWrap);
    ta.focus();
  });

  // Pre-load command list once auth is ready so the first "/" feels instant.
  void warmupChatCommands();

  // Reactions — delegated click on chips / + buttons / picker.
  const messagesEl = panel.querySelector<HTMLElement>('.messages')!;
  wireReactionHandlers(messagesEl, {
    onToggleReaction: (msgId, emoji) => void toggleReaction(shadow, msgId, emoji),
    onOpenPicker: (trigger, msgId) => {
      if (trigger.classList.contains('open')) closePicker(shadow);
      else openPickerNear(shadow, trigger, msgId);
    },
    onClosePicker: () => closePicker(shadow),
    isPickerOpen: () => !!shadow.querySelector('.reaction-picker'),
  });

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

function dayDelta(ts: number): { dayDiff: number; date: Date } {
  const d = new Date(ts * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((today.getTime() - msgDay.getTime()) / 86400000);
  return { dayDiff, date: d };
}

function formatChatTime(ts: number): string {
  const { dayDiff, date } = dayDelta(ts);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (dayDiff === 0) return time;
  if (dayDiff === 1) return `Yesterday ${time}`;
  if (dayDiff < 7) return `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

function formatDateSep(ts: number): string {
  const { dayDiff, date } = dayDelta(ts);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return date.toLocaleDateString([], { weekday: 'long' });
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
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
  const GROUP_WINDOW = 5 * 60; // seconds; matches main chat
  let lastDateLabel = '';
  let prev: ChatMessage | null = null;
  wrap.innerHTML = _messages
    .map((m) => {
      const mentioned = m.mentions.includes(me);
      const dateLabel = formatDateSep(m.created_at);
      const showSeparator = dateLabel !== lastDateLabel;
      const separator = showSeparator
        ? `<div class="date-sep"><span class="line"></span><span class="label">${escapeHtml(dateLabel)}</span><span class="line"></span></div>`
        : '';
      lastDateLabel = dateLabel;

      const sameAuthor =
        !!prev &&
        prev.player_id === m.player_id &&
        (prev.bot_id ?? null) === (m.bot_id ?? null);
      const withinWindow =
        !!prev && m.created_at - prev.created_at <= GROUP_WINDOW;
      const grouped = !showSeparator && sameAuthor && withinWindow;
      prev = m;

      // Avatar column: full avatar (or initials) when starting a block,
      // hover-revealed timestamp when grouped.
      let avatarCol = '';
      if (grouped) {
        const hover = date24Hm(m.created_at);
        avatarCol = `<div class="avatar-col"><div class="gutter-time">${hover}</div></div>`;
      } else if (m.bot_id) {
        avatarCol = `<div class="avatar-col"><div class="avatar-fallback bot">B</div></div>`;
      } else {
        const url = _avatars.get(m.player_id);
        if (url) {
          avatarCol = `<div class="avatar-col"><img src="${escapeHtml(url)}" alt="${escapeHtml(m.player_name)}" loading="lazy" decoding="async"></div>`;
        } else {
          const initials = escapeHtml(m.player_name.slice(0, 2));
          avatarCol = `<div class="avatar-col"><div class="avatar-fallback">${initials}</div></div>`;
        }
      }

      const headerHtml = grouped
        ? ''
        : `${
            m.bot_id
              ? `<span class="author bot">${escapeHtml(m.player_name)}</span>`
              : `<a class="author" href="https://www.torn.com/profiles.php?XID=${m.player_id}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.player_name)}</a>`
          }<span class="time">${formatChatTime(m.created_at)}</span>`;

      const cls = `msg${grouped ? '' : ' group-start'}`;
      const reactionsHtml = renderReactions(m, me);
      return `
        ${separator}
        <div class="${cls}" data-msg-id="${m.id}">
          ${avatarCol}
          <div class="body-col">
            ${headerHtml}
            <div class="text${mentioned ? ' mentioned' : ''}">${renderMessageBody(m.content, m.mentions, _roster)}</div>
            ${reactionsHtml}
          </div>
          <button type="button" class="reaction-add-trigger" data-add-trigger="1" title="Add reaction" aria-label="Add reaction">☺︎</button>
        </div>
      `;
    })
    .join('');
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '✅', '❌', '👀', '💀', '🚀', '🟢', '🟡', '🔴'];

function renderReactions(m: ChatMessage, me: number): string {
  const list = m.reactions ?? [];
  // Skip the wrapper entirely when there are no chips — keeps the gap
  // between messages tight. The "+" affordance lives in the hover action
  // overlay (data-react-trigger) instead of a permanent in-flow button.
  if (list.length === 0) return '';
  const chips = list
    .map((r) => {
      const mine = me > 0 && r.players.some((p) => p.id === me);
      const names = r.players.map((p) => p.name).join(', ') || `${r.count}`;
      return `<button type="button" class="reaction-chip${mine ? ' mine' : ''}" data-emoji="${escapeHtml(r.emoji)}" title="${escapeHtml(names)} reacted with ${escapeHtml(r.emoji)}"><span aria-hidden>${escapeHtml(r.emoji)}</span><span class="count">${r.count}</span></button>`;
    })
    .join('');
  return `<div class="reactions">${chips}</div>`;
}

function closePicker(shadow: ShadowRoot): void {
  shadow.querySelector('.reaction-picker')?.remove();
  shadow.querySelectorAll('.reaction-add-trigger.open').forEach((el) => el.classList.remove('open'));
}

function openPickerNear(shadow: ShadowRoot, anchor: HTMLElement, msgId: number): void {
  closePicker(shadow);
  anchor.classList.add('open');
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  picker.innerHTML = QUICK_EMOJIS
    .map((e) => `<button type="button" data-pick="${escapeHtml(e)}">${escapeHtml(e)}</button>`)
    .join('');
  // Position above the + button.
  const messages = shadow.querySelector<HTMLElement>('.messages');
  if (!messages) return;
  const rect = anchor.getBoundingClientRect();
  const wrapRect = messages.getBoundingClientRect();
  picker.style.left = `${rect.left - wrapRect.left + messages.scrollLeft}px`;
  picker.style.top = `${rect.top - wrapRect.top + messages.scrollTop - 36}px`;
  picker.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('button[data-pick]');
    if (!btn) return;
    const emoji = btn.dataset.pick ?? '';
    await toggleReaction(shadow, msgId, emoji);
    closePicker(shadow);
  });
  messages.appendChild(picker);
}

async function toggleReaction(shadow: ShadowRoot, msgId: number, emoji: string): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  const target = _messages.find((mm) => mm.id === msgId);
  if (!target) return;
  const existing = (target.reactions ?? []).find((r) => r.emoji === emoji);
  const mineAlready = !!(existing && existing.players.some((p) => p.id === auth.player_id));
  try {
    const res = mineAlready
      ? await removeChatReaction(auth, msgId, emoji)
      : await addChatReaction(auth, msgId, emoji);
    applyReactionUpdate(msgId, emoji, res.reaction);
    renderMessages(shadow);
  } catch {
    // Server is the source of truth — next poll will reconcile.
  }
}

function applyReactionUpdate(
  msgId: number,
  emoji: string,
  reaction: { emoji: string; count: number; players: { id: number; name: string }[] },
): void {
  const msg = _messages.find((m) => m.id === msgId);
  if (!msg) return;
  const list = msg.reactions ? [...msg.reactions] : [];
  const idx = list.findIndex((r) => r.emoji === emoji);
  if (reaction.count === 0) {
    if (idx >= 0) list.splice(idx, 1);
  } else if (idx >= 0) {
    list[idx] = reaction;
  } else {
    list.push(reaction);
  }
  msg.reactions = list;
}

function date24Hm(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

// ── Slash-command autocomplete ─────────────────────────────────────────────

let _chatCommands: ChatCommandInfo[] = [];
let _chatCommandsFetchedAt = 0;
const COMMAND_CACHE_TTL_MS = 60_000;
let _autocompleteVisibleList: ChatCommandInfo[] = [];

async function warmupChatCommands(): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  const age = Date.now() - _chatCommandsFetchedAt;
  if (_chatCommands.length > 0 && age < COMMAND_CACHE_TTL_MS) return;
  try {
    const r = await fetchChatCommands(auth);
    _chatCommands = r.commands;
    _chatCommandsFetchedAt = Date.now();
  } catch {
    // Non-fatal; autocomplete is a nicety, not a critical path.
  }
}

function isAutocompleteOpen(composer: HTMLElement): boolean {
  const ac = composer.querySelector<HTMLElement>('.cmd-autocomplete');
  return !!ac && !ac.classList.contains('hidden');
}

function currentAutocompleteList(): ChatCommandInfo[] {
  return _autocompleteVisibleList;
}

function hideAutocomplete(composer: HTMLElement): void {
  const ac = composer.querySelector<HTMLElement>('.cmd-autocomplete');
  if (ac) ac.classList.add('hidden');
  _autocompleteVisibleList = [];
}

function paintAutocomplete(
  composer: HTMLElement,
  list: ChatCommandInfo[],
  selectedIdx: number,
): void {
  let ac = composer.querySelector<HTMLElement>('.cmd-autocomplete');
  if (!ac) {
    ac = document.createElement('div');
    ac.className = 'cmd-autocomplete';
    composer.appendChild(ac);
  }
  ac.classList.remove('hidden');
  if (list.length === 0) {
    ac.innerHTML = `<div class="cmd-empty">No matching commands</div>`;
    return;
  }
  ac.innerHTML = list
    .map((c, i) => {
      const sel = i === selectedIdx ? ' selected' : '';
      return `<button type="button" class="cmd-row${sel}" data-cmd="${escapeHtml(c.name)}" data-desc="${escapeHtml(c.description)}"><span class="name">/${escapeHtml(c.name)}</span><span class="desc">${escapeHtml(c.description)}</span></button>`;
    })
    .join('');
}

function paintAutocompleteSelection(composer: HTMLElement, idx: number): void {
  const rows = composer.querySelectorAll<HTMLElement>('.cmd-row');
  rows.forEach((row, i) => {
    row.classList.toggle('selected', i === idx);
    if (i === idx) row.scrollIntoView({ block: 'nearest' });
  });
}

function updateAutocomplete(composer: HTMLElement, value: string): void {
  const ctx = detectSlashContext(value);
  if (!ctx) {
    hideAutocomplete(composer);
    return;
  }
  // Kick a background refresh if the cache is stale; we'll re-paint on
  // resolve. Meanwhile render whatever we have (or empty).
  void warmupChatCommands().then(() => {
    // Only repaint if the user is still typing a slash prefix.
    const stillCtx = detectSlashContext(composer.querySelector<HTMLTextAreaElement>('textarea')?.value ?? '');
    if (!stillCtx) return;
    _autocompleteVisibleList = filterCommands(_chatCommands, stillCtx.prefix);
    paintAutocomplete(composer, _autocompleteVisibleList, 0);
  });
  _autocompleteVisibleList = filterCommands(_chatCommands, ctx.prefix);
  paintAutocomplete(composer, _autocompleteVisibleList, 0);
}

function acceptAutocomplete(
  ta: HTMLTextAreaElement,
  picked: ChatCommandInfo,
): void {
  ta.value = `/${picked.name} `;
  // Re-trigger sizing + send-button enable
  ta.dispatchEvent(new Event('input'));
  ta.focus();
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


// Avoid unused-variable warning in TypeScript.
void _unreadPoller;
