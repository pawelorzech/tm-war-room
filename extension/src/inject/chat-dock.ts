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
  endChainAssist,
  fetchChainAssist,
  fetchChatChannels,
  fetchChatCommands,
  fetchChatMessages,
  fetchChatUnread,
  fetchMemberAvatars,
  fetchOcDigest,
  fetchOverview,
  fetchWarRoomCard,
  joinChainAssist,
  markChatRead,
  removeChatReaction,
  resolveChatEntities,
  searchChatMessages,
  sendChatMessage,
  type ChainAssistResponse,
  type OcDigestResponse,
  type WarRoomCardResponse,
} from '../lib/api';
import { getAuth, clearAuth, openAuthPage } from '../lib/auth';
import { startPolling, type PollHandle } from '../lib/poll';
import type { ChatChannel, ChatMessage, EntityCard, EntityRef } from '../types';

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

  .search-panel {
    border-bottom: 1px solid #30363d;
    background: #161b22;
    padding: 6px 8px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .search-panel.hidden { display: none; }
  .search-panel .search-row {
    display: flex; align-items: center; gap: 6px;
  }
  .search-panel input.search-input {
    flex: 1;
    background: #0d1117;
    color: #c9d1d9;
    border: 1px solid #30363d;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 12px;
    outline: none;
  }
  .search-panel input.search-input:focus { border-color: #58a6ff; }
  .search-panel .search-close {
    background: transparent; border: none; color: #6e7681;
    font-size: 11px; cursor: pointer; padding: 0 4px;
  }
  .search-panel .search-chips {
    display: flex; flex-wrap: wrap; gap: 4px;
  }
  .search-panel .search-chips span {
    font-size: 10px; padding: 1px 6px; border-radius: 3px;
    background: rgba(56, 139, 253, 0.15); color: #79c0ff;
  }
  .search-panel .search-results {
    max-height: 280px; overflow-y: auto;
    display: flex; flex-direction: column;
    border-top: 1px solid #30363d;
    margin: 0 -8px -6px -8px;
  }
  .search-panel .search-row-empty {
    font-size: 11px; color: #6e7681; padding: 8px;
  }
  .search-panel .search-result {
    text-align: left; background: transparent; border: 0;
    border-bottom: 1px solid #30363d;
    padding: 6px 8px; cursor: pointer; color: inherit;
    font-family: inherit;
  }
  .search-panel .search-result:hover { background: #21262d; }
  .search-panel .search-result:last-child { border-bottom: 0; }
  .search-panel .search-result .meta {
    font-size: 10px; color: #6e7681;
  }
  .search-panel .search-result .meta .name { color: #56d364; font-weight: 500; }
  .search-panel .search-result .snippet {
    font-size: 12px; color: #c9d1d9; margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .search-panel .search-result mark {
    background: rgba(210, 153, 34, 0.4); color: #f0f6fc;
    padding: 0 1px; border-radius: 2px;
  }

  .war-room-card {
    border-bottom: 1px solid rgba(248, 81, 73, 0.4);
    background: rgba(248, 81, 73, 0.06);
    padding: 6px 8px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .war-room-card.hidden { display: none; }
  .war-room-card .wrc-row1 {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  }
  .war-room-card .wrc-tag {
    font-size: 9px; padding: 1px 6px; border-radius: 3px;
    background: #f85149; color: #fff; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  .war-room-card .wrc-name { color: #c9d1d9; font-weight: 500; font-size: 12px; }
  .war-room-card .wrc-score { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .war-room-card .wrc-score.lead-up { color: #56d364; }
  .war-room-card .wrc-score.lead-down { color: #ff7b72; }
  .war-room-card .wrc-score.lead-tie { color: #6e7681; }
  .war-room-card .wrc-meta { color: #6e7681; font-size: 11px; }
  .war-room-card .wrc-targets {
    display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
  }
  .war-room-card .wrc-targets-label {
    color: #6e7681; font-size: 9px; text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .war-room-card .wrc-target {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 1px 6px; border-radius: 4px;
    border: 1px solid rgba(248, 81, 73, 0.4);
    background: #161b22;
    color: #c9d1d9;
    font-size: 11px;
    text-decoration: none;
  }
  .war-room-card .wrc-target:hover { background: rgba(248, 81, 73, 0.1); }
  .war-room-card .wrc-target .lvl { color: #6e7681; }
  .war-room-card .wrc-empty { font-size: 11px; color: #6e7681; font-style: italic; }

  .oc-digest-card {
    border-bottom: 1px solid rgba(210, 153, 34, 0.4);
    background: rgba(210, 153, 34, 0.06);
    padding: 6px 8px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .oc-digest-card.hidden { display: none; }
  .oc-digest-card .oc-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .oc-digest-card .oc-tag {
    font-size: 9px; padding: 1px 6px; border-radius: 3px;
    background: #d29922; color: #0d1117; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  .oc-digest-card .oc-summary { color: #c9d1d9; font-size: 12px; }
  .oc-digest-card .oc-summary .ready { color: #56d364; font-weight: 500; }
  .oc-digest-card .oc-summary .waiting { color: #6e7681; }
  .oc-digest-card .oc-summary .tool { color: #ff7b72; }
  .oc-digest-card .oc-summary .travel { color: #79c0ff; }
  .oc-digest-card .oc-toggle {
    margin-left: auto; background: transparent; border: 0; color: #6e7681;
    cursor: pointer; font-size: 13px;
  }
  .oc-digest-card .oc-toggle:hover { color: #c9d1d9; }
  .oc-digest-card .oc-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .oc-digest-card .oc-row-label {
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px;
  }
  .oc-digest-card .oc-row-label.ready { color: #56d364; }
  .oc-digest-card .oc-row-label.tool { color: #ff7b72; }
  .oc-digest-card .oc-row-label.travel { color: #79c0ff; }
  .oc-digest-card .oc-chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 1px 6px; border-radius: 4px;
    background: #161b22;
    border: 1px solid #30363d;
    font-size: 11px;
  }
  .oc-digest-card .oc-chip.ready { border-color: rgba(35, 134, 54, 0.4); }
  .oc-digest-card .oc-chip.tool { border-color: rgba(248, 81, 73, 0.4); }
  .oc-digest-card .oc-chip.travel { border-color: rgba(56, 139, 253, 0.4); }
  .oc-digest-card .oc-chip .name { color: #c9d1d9; }
  .oc-digest-card .oc-chip .meta { color: #6e7681; }

  .chain-assist-card {
    margin-top: 4px;
    border-radius: 6px;
    border: 1px solid rgba(248, 81, 73, 0.4);
    background: #161b22;
    overflow: hidden;
  }
  .chain-assist-card.closed { border-color: #30363d; }
  .chain-assist-card .ca-head {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    padding: 5px 8px;
  }
  .chain-assist-card .ca-tag {
    font-size: 9px; padding: 1px 6px; border-radius: 3px;
    background: #f85149; color: #fff; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  .chain-assist-card.closed .ca-tag { background: #30363d; color: #8b949e; }
  .chain-assist-card .ca-name {
    color: #c9d1d9; font-weight: 500; font-size: 12px;
    text-decoration: none;
  }
  .chain-assist-card .ca-name:hover { text-decoration: underline; }
  .chain-assist-card .ca-meta { font-size: 11px; color: #6e7681; }
  .chain-assist-card .ca-state { font-size: 11px; }
  .chain-assist-card .ca-state.s-Okay { color: #56d364; }
  .chain-assist-card .ca-state.s-Hospital,
  .chain-assist-card .ca-state.s-Jail,
  .chain-assist-card .ca-state.s-Federal { color: #ff7b72; }
  .chain-assist-card .ca-state.s-Traveling,
  .chain-assist-card .ca-state.s-Abroad { color: #79c0ff; }
  .chain-assist-card .ca-attack {
    margin-left: auto;
    font-size: 11px; font-weight: 500;
    color: #ff7b72; padding: 2px 8px;
    border-radius: 4px; text-decoration: none;
  }
  .chain-assist-card .ca-attack:hover { background: rgba(248, 81, 73, 0.1); }
  .chain-assist-card .ca-foot {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    padding: 0 8px 6px 8px;
  }
  .chain-assist-card .ca-hitter {
    font-size: 11px; padding: 1px 8px; border-radius: 999px;
    background: rgba(35, 134, 54, 0.15); color: #56d364;
  }
  .chain-assist-card .ca-empty { font-size: 11px; color: #6e7681; font-style: italic; }
  .chain-assist-card .ca-btn {
    font-size: 11px; padding: 2px 10px; border-radius: 4px;
    border: 0; cursor: pointer; font-family: inherit;
  }
  .chain-assist-card .ca-btn.join {
    background: #238636; color: #fff;
  }
  .chain-assist-card .ca-btn.join:hover:not(:disabled) { background: #2ea043; }
  .chain-assist-card .ca-btn.join:disabled { opacity: 0.6; cursor: default; }
  .chain-assist-card .ca-btn.end {
    margin-left: auto; background: transparent; color: #6e7681;
  }
  .chain-assist-card .ca-btn.end:hover:not(:disabled) { color: #ff7b72; }
  .chain-assist-card .ca-err { padding: 0 8px 6px 8px; color: #ff7b72; font-size: 11px; }

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

  .msg .entities {
    display: flex; flex-wrap: wrap; gap: 6px;
    margin-top: 4px;
  }
  .msg .entity-card {
    display: inline-flex; align-items: stretch;
    max-width: 100%; min-width: 0;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 6px;
    overflow: hidden;
    text-decoration: none;
    color: inherit;
  }
  .msg .entity-card:hover { background: #21262d; }
  .msg .entity-card .ec-main { display: flex; align-items: center; gap: 6px; padding: 4px 8px; min-width: 0; text-decoration: none; color: inherit; flex: 1; }
  .msg .entity-card .ec-body { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
  .msg .entity-card .ec-line1 { display: flex; align-items: center; gap: 4px; font-size: 12px; }
  .msg .entity-card .ec-line2 { display: flex; align-items: center; gap: 4px; font-size: 11px; }
  .msg .entity-card .ec-name { color: #c9d1d9; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
  .msg .entity-card .ec-muted { color: #6e7681; }
  .msg .entity-card .ec-tag {
    font-size: 10px; padding: 0 4px; border-radius: 3px;
    background: rgba(35, 134, 54, 0.15); color: #56d364;
    white-space: nowrap;
  }
  .msg .entity-card .ec-war-tag {
    background: rgba(248, 81, 73, 0.15); color: #ff7b72;
    text-transform: uppercase;
  }
  .msg .entity-card .ec-chip {
    font-size: 10px; padding: 0 4px; border-radius: 3px;
    white-space: nowrap;
  }
  .msg .entity-card .ec-money { color: #56d364; }
  .msg .entity-card .ec-up { color: #56d364; }
  .msg .entity-card .ec-down { color: #ff7b72; }
  .msg .entity-card .ec-action {
    display: inline-flex; align-items: center;
    padding: 0 8px;
    font-size: 11px; font-weight: 500;
    color: #ff7b72;
    border-left: 1px solid #30363d;
    text-decoration: none;
  }
  .msg .entity-card .ec-action:hover { background: rgba(248, 81, 73, 0.1); }
  .msg .entity-card.ec-item img { width: 24px; height: 24px; object-fit: contain; margin: 4px 0 4px 8px; }
  .msg .entity-card.ec-item { padding: 0; align-items: center; gap: 0; }
  .msg .entity-card.ec-item .ec-body { padding: 4px 8px 4px 6px; }
  .msg .entity-card.ec-faction .ec-body,
  .msg .entity-card.ec-war .ec-body { padding: 4px 8px; }

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
    position: fixed; z-index: 2147483646;
    display: flex; align-items: center; gap: 4px;
    padding: 6px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 999px;
    box-shadow: 0 6px 16px rgba(0,0,0,0.5);
    animation: reactionPickerIn 120ms ease-out;
  }
  .reaction-picker button {
    width: 28px; height: 28px;
    background: transparent; border: none; border-radius: 8px;
    color: #c9d1d9; font-size: 18px; line-height: 1;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: transform 80ms ease, background 80ms ease;
  }
  .reaction-picker button:hover {
    transform: scale(1.15);
    background: rgba(255,255,255,0.08);
  }
  .reaction-picker button.more-btn {
    color: #8b949e; font-size: 16px; font-weight: 700;
  }
  @keyframes reactionPickerIn {
    from { opacity: 0; transform: scale(0.92) translateY(4px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

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
// Resolved entity-card cache: key = `${kind}:${id}`. Negative results are
// cached too (value undefined) so a missing entity doesn't spam retries.
const _entityCache: Map<string, { ts: number; card: EntityCard | null }> = new Map();
const _entityInflight: Set<string> = new Set();

const ENTITY_TTL_MS: Record<EntityRef['kind'], number> = {
  player: 60_000,
  faction: 60_000,
  item: 300_000,
  rankedwar: 15_000,
};

function entityKey(kind: EntityRef['kind'], id: number): string {
  return `${kind}:${id}`;
}

function entityFresh(key: string, kind: EntityRef['kind']): boolean {
  const entry = _entityCache.get(key);
  if (!entry) return false;
  return Date.now() - entry.ts < ENTITY_TTL_MS[kind];
}

function collectUnresolvedEntities(): { kind: EntityRef['kind']; id: number }[] {
  const out: Map<string, { kind: EntityRef['kind']; id: number }> = new Map();
  for (const m of _messages) {
    for (const e of m.entities ?? []) {
      if (typeof e.id !== 'number' || e.id <= 0) continue;
      const key = entityKey(e.kind, e.id);
      if (entityFresh(key, e.kind)) continue;
      if (_entityInflight.has(key)) continue;
      if (out.has(key)) continue;
      out.set(key, { kind: e.kind, id: e.id });
    }
  }
  return [...out.values()];
}

async function resolveVisibleEntities(shadow: ShadowRoot): Promise<void> {
  const refs = collectUnresolvedEntities();
  if (refs.length === 0) return;
  const auth = getAuth();
  if (!auth) return;
  // Cap each batch to 50 — matches MAX_BATCH server-side. If there's more
  // than that, the first 50 win and the rest get picked up on the next render
  // pass (cheap because cache marks them all in_progress on first hit).
  const batch = refs.slice(0, 50);
  for (const r of batch) _entityInflight.add(entityKey(r.kind, r.id));
  try {
    const { entities } = await resolveChatEntities(auth, batch);
    const now = Date.now();
    for (const r of batch) {
      const key = entityKey(r.kind, r.id);
      _entityCache.set(key, { ts: now, card: entities[key] ?? null });
    }
  } catch {
    // Don't poison the cache permanently; let the next render retry after
    // a short cooldown.
    const cooldown = Date.now() - ENTITY_TTL_MS.rankedwar + 5000;
    for (const r of batch) {
      const key = entityKey(r.kind, r.id);
      if (!_entityCache.has(key)) _entityCache.set(key, { ts: cooldown, card: null });
    }
  } finally {
    for (const r of batch) _entityInflight.delete(entityKey(r.kind, r.id));
  }
  renderMessages(shadow);
}

type StatusColor = 'green' | 'red' | 'blue' | 'gray';
const STATUS_BG: Record<StatusColor, string> = {
  green: 'rgba(35, 134, 54, 0.2)',
  red: 'rgba(248, 81, 73, 0.2)',
  blue: 'rgba(56, 139, 253, 0.2)',
  gray: 'rgba(110, 118, 129, 0.2)',
};
const STATUS_FG: Record<StatusColor, string> = {
  green: '#56d364',
  red: '#ff7b72',
  blue: '#79c0ff',
  gray: '#8b949e',
};

function fmtMoney(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v}`;
}

function fmtRemaining(secs: number): string {
  if (secs <= 0) return 'Ended';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function renderEntityCard(card: EntityCard): string {
  if (card.kind === 'player') {
    const bg = STATUS_BG[card.status_color];
    const fg = STATUS_FG[card.status_color];
    const tag = card.faction_tag
      ? `<span class="ec-tag">${escapeHtml(card.faction_tag)}</span>`
      : '';
    const last = card.last_action_text
      ? `<span class="ec-muted">· ${escapeHtml(card.last_action_text)}</span>`
      : '';
    return `
      <div class="entity-card ec-player">
        <a class="ec-main" href="${escapeHtml(card.profile_url)}" target="_blank" rel="noopener noreferrer">
          <div class="ec-body">
            <div class="ec-line1">
              <span class="ec-name">${escapeHtml(card.name)}</span>
              <span class="ec-muted">L${card.level}</span>
              ${tag}
            </div>
            <div class="ec-line2">
              <span class="ec-chip" style="background:${bg};color:${fg}">${escapeHtml(card.status_text)}</span>
              ${last}
            </div>
          </div>
        </a>
        <a class="ec-action" href="${escapeHtml(card.attack_url)}" target="_blank" rel="noopener noreferrer" title="Attack">Attack</a>
      </div>
    `;
  }
  if (card.kind === 'item') {
    const price = card.market_low > 0 ? `Market ${fmtMoney(card.market_low)}` : 'Not on market';
    const circ = card.circulation > 0
      ? `<span class="ec-muted"> · ${card.circulation.toLocaleString()} in circ</span>`
      : '';
    return `
      <a class="entity-card ec-item" href="${escapeHtml(card.market_url)}" target="_blank" rel="noopener noreferrer">
        <img src="${escapeHtml(card.image)}" alt="" loading="lazy" decoding="async">
        <div class="ec-body">
          <div class="ec-line1">
            <span class="ec-name">${escapeHtml(card.name)}</span>
            ${card.type ? `<span class="ec-muted">· ${escapeHtml(card.type)}</span>` : ''}
          </div>
          <div class="ec-line2">
            <span class="ec-money">${escapeHtml(price)}</span>${circ}
          </div>
        </div>
      </a>
    `;
  }
  if (card.kind === 'faction') {
    const tag = card.tag
      ? `<span class="ec-tag">${escapeHtml(card.tag)}</span>`
      : '';
    const meta: string[] = [];
    if (card.members_count > 0) meta.push(`👥 ${card.members_count}`);
    if (card.respect > 0) meta.push(`${card.respect.toLocaleString()} resp`);
    if (card.rank_name) meta.push(escapeHtml(card.rank_name));
    return `
      <a class="entity-card ec-faction" href="${escapeHtml(card.url)}" target="_blank" rel="noopener noreferrer">
        <div class="ec-body">
          <div class="ec-line1">${tag}<span class="ec-name">${escapeHtml(card.name)}</span></div>
          <div class="ec-line2 ec-muted">${meta.join(' · ')}</div>
        </div>
      </a>
    `;
  }
  // rankedwar
  const lead = card.score_us - card.score_them;
  const leadClass = lead > 0 ? 'ec-up' : lead < 0 ? 'ec-down' : 'ec-muted';
  const remainder = !card.ended && card.time_remaining_s > 0
    ? `<span class="ec-muted"> · ${escapeHtml(fmtRemaining(card.time_remaining_s))}</span>`
    : '';
  const target = card.target_score > 0
    ? `<span class="ec-muted"> · target ${card.target_score.toLocaleString()}</span>`
    : '';
  return `
    <a class="entity-card ec-war" href="${escapeHtml(card.url)}" target="_blank" rel="noopener noreferrer">
      <div class="ec-body">
        <div class="ec-line1">
          <span class="ec-tag ec-war-tag">${card.ended ? 'RW ENDED' : 'RW LIVE'}</span>
          <span class="ec-name">vs ${escapeHtml(card.opponent_name || 'Opponent')}</span>
        </div>
        <div class="ec-line2">
          <span class="${leadClass}">${card.score_us.toLocaleString()} – ${card.score_them.toLocaleString()}</span>${target}${remainder}
        </div>
      </div>
    </a>
  `;
}

function renderEntities(m: ChatMessage): string {
  const ents = m.entities ?? [];
  if (ents.length === 0) return '';
  const cards: string[] = [];
  for (const e of ents) {
    if (typeof e.id !== 'number' || e.id <= 0) continue;
    const entry = _entityCache.get(entityKey(e.kind, e.id));
    if (!entry || !entry.card) continue;
    cards.push(renderEntityCard(entry.card));
  }
  if (cards.length === 0) return '';
  return `<div class="entities">${cards.join('')}</div>`;
}

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
    stopWarCardPolling(shadow);
    stopOcDigestPolling(shadow);
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
    startWarCardPolling(shadow, _state.channelId);
    startOcDigestPolling(shadow, _state.channelId);
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

// ── Chain assist cards (Task #10) ───────────────────────────
const CHAIN_MARKER_RE = /^:chain-assist:(\d+):/;
const _assistCache: Map<number, ChainAssistResponse> = new Map();
let _assistRefreshTimer: number | null = null;

const ASSIST_STATE_CLASS_OK = ['Okay', 'Hospital', 'Jail', 'Federal', 'Traveling', 'Abroad'];
function statusClass(state: string): string {
  return ASSIST_STATE_CLASS_OK.includes(state) ? `s-${state}` : '';
}

function renderChainAssistInto(slot: HTMLElement, assistId: number, data: ChainAssistResponse | null, error?: string): void {
  if (error && !data) {
    slot.innerHTML = `<div class="chain-assist-card closed"><div class="ca-head"><span class="ca-meta">Assist #${assistId}: ${escapeHtml(error)}</span></div></div>`;
    return;
  }
  if (!data) {
    slot.innerHTML = `<div class="chain-assist-card"><div class="ca-head"><span class="ca-meta">Loading chain assist…</span></div></div>`;
    return;
  }
  const closed = data.ended_at !== null;
  const me = getAuth()?.player_id ?? 0;
  const isLeader = me === data.started_by;
  const alreadyHitting = data.hitters.some((h) => h.id === me);
  const attackUrl = `https://www.torn.com/page.php?sid=attack&user2ID=${data.target_id}`;
  const profileUrl = `https://www.torn.com/profiles.php?XID=${data.target_id}`;
  const tagLabel = closed ? 'Closed' : 'Chain';
  const hittersHtml = data.hitters.length > 0
    ? data.hitters.map((h) => `<span class="ca-hitter">${escapeHtml(h.name)}</span>`).join('')
    : `<span class="ca-empty">No one's joined yet.</span>`;
  const joinBtn = !closed && !alreadyHitting
    ? `<button type="button" class="ca-btn join" data-join-id="${assistId}">I'm hitting</button>`
    : '';
  const endBtn = !closed && isLeader
    ? `<button type="button" class="ca-btn end" data-end-id="${assistId}">End</button>`
    : '';
  const attackHtml = !closed
    ? `<a class="ca-attack" href="${escapeHtml(attackUrl)}" target="_blank" rel="noopener noreferrer">Attack</a>`
    : '';
  slot.innerHTML = `
    <div class="chain-assist-card${closed ? ' closed' : ''}">
      <div class="ca-head">
        <span class="ca-tag">${tagLabel}</span>
        <a class="ca-name" href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.target_name || `Player ${data.target_id}`)}</a>
        <span class="ca-state ${statusClass(data.target_status_state)}">· ${escapeHtml(data.target_status_state || '?')}</span>
        <span class="ca-meta">· led by ${escapeHtml(data.started_by_name || `#${data.started_by}`)}</span>
        ${attackHtml}
      </div>
      <div class="ca-foot">
        ${hittersHtml}
        ${joinBtn}
        ${endBtn}
      </div>
    </div>
  `;
}

async function hydrateChainAssistSlots(shadow: ShadowRoot): Promise<void> {
  const slots = shadow.querySelectorAll<HTMLElement>('.chain-assist-slot');
  if (slots.length === 0) {
    if (_assistRefreshTimer != null) {
      clearInterval(_assistRefreshTimer);
      _assistRefreshTimer = null;
    }
    return;
  }
  const auth = getAuth();
  if (!auth) return;

  const ids = new Set<number>();
  slots.forEach((s) => {
    const id = Number(s.dataset.assistId);
    if (id > 0) ids.add(id);
  });

  // First paint with cached values.
  slots.forEach((s) => {
    const id = Number(s.dataset.assistId);
    if (id > 0) renderChainAssistInto(s, id, _assistCache.get(id) ?? null);
  });

  // Fetch all visible assists in parallel; ignore individual failures.
  await Promise.all([...ids].map(async (id) => {
    try {
      const data = await fetchChainAssist(auth, id);
      _assistCache.set(id, data);
    } catch {
      // leave cache as-is so the next tick retries
    }
  }));
  slots.forEach((s) => {
    const id = Number(s.dataset.assistId);
    if (id > 0) renderChainAssistInto(s, id, _assistCache.get(id) ?? null);
  });

  // Keep refreshing while any non-closed assist remains on screen.
  if (_assistRefreshTimer == null) {
    _assistRefreshTimer = window.setInterval(() => {
      const present = shadow.querySelectorAll<HTMLElement>('.chain-assist-slot');
      if (present.length === 0) {
        if (_assistRefreshTimer != null) {
          clearInterval(_assistRefreshTimer);
          _assistRefreshTimer = null;
        }
        return;
      }
      void hydrateChainAssistSlots(shadow);
    }, 10_000);
  }
}

async function handleAssistJoinClick(shadow: ShadowRoot, assistId: number, btn: HTMLButtonElement): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  btn.disabled = true;
  btn.textContent = 'Joining…';
  try {
    const updated = await joinChainAssist(auth, assistId);
    _assistCache.set(assistId, updated);
    void hydrateChainAssistSlots(shadow);
  } catch (e) {
    const slot = btn.closest<HTMLElement>('.chain-assist-slot');
    if (slot) {
      const errMsg = e instanceof ApiError ? `${e.status} ${e.message}` : String(e);
      renderChainAssistInto(slot, assistId, _assistCache.get(assistId) ?? null, errMsg);
    }
  }
}

async function handleAssistEndClick(shadow: ShadowRoot, assistId: number, btn: HTMLButtonElement): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  btn.disabled = true;
  btn.textContent = 'Closing…';
  try {
    const updated = await endChainAssist(auth, assistId);
    _assistCache.set(assistId, updated);
    void hydrateChainAssistSlots(shadow);
  } catch (e) {
    const errMsg = e instanceof ApiError ? `${e.status} ${e.message}` : String(e);
    const slot = btn.closest<HTMLElement>('.chain-assist-slot');
    if (slot) {
      renderChainAssistInto(slot, assistId, _assistCache.get(assistId) ?? null, errMsg);
    }
  }
}

// ── OC 2.0 digest card (Task #12) ───────────────────────────
let _ocCardPoller: PollHandle | null = null;
const OC_COLLAPSED_KEY = 'tm-hub-companion-oc-collapsed';

function isOcDigestChannel(channelId: number): boolean {
  const ch = _channels.find((c) => c.id === channelId);
  return ch?.name === 'general' || ch?.name === 'leadership';
}

function renderOcDigest(shadow: ShadowRoot, data: OcDigestResponse | null): void {
  const el = shadow.querySelector<HTMLElement>('.oc-digest-card');
  if (!el) return;
  if (!data || !data.active) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  const c = data.counts ?? { ready: 0, waiting: 0, blocked_tools: 0, traveling: 0 };
  // Empty queue → hide the card; no signal to share.
  if (c.ready === 0 && c.waiting === 0) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }

  // Default collapsed — when a faction has many traveling members the
  // expanded list dominates the dock; the summary line is enough at a
  // glance. User opt-in to expand via the ▾ toggle.
  let collapsed = true;
  try {
    const pref = localStorage.getItem(OC_COLLAPSED_KEY);
    if (pref === '0') collapsed = false;
  } catch { /* ignore */ }

  const toolPart = c.blocked_tools > 0
    ? ` · <span class="tool">${c.blocked_tools}</span> tool gap${c.blocked_tools === 1 ? '' : 's'}`
    : '';
  const travelPart = c.traveling > 0
    ? ` · <span class="travel">${c.traveling}</span> traveling`
    : '';
  const summary = `<span class="oc-summary">
    <span class="ready">${c.ready}</span> ready · <span class="waiting">${c.waiting} waiting</span>${toolPart}${travelPart}
  </span>`;

  let body = '';
  if (!collapsed) {
    const CHIP_CAP = 5;
    const overflowChip = (n: number) => `<span class="oc-chip"><span class="meta">+${n} more</span></span>`;
    const rows: string[] = [];
    if (data.ready && data.ready.length > 0) {
      const visible = data.ready.slice(0, CHIP_CAP);
      const overflow = data.ready.length - visible.length;
      rows.push(`<div class="oc-row"><span class="oc-row-label ready">Ready:</span>${
        visible.map((o) => `<span class="oc-chip ready"><span class="name">${escapeHtml(o.name)}</span><span class="meta">${o.filled}/${o.total}</span></span>`).join('')
      }${overflow > 0 ? overflowChip(overflow) : ''}</div>`);
    }
    if (data.blocked_by_tool && data.blocked_by_tool.length > 0) {
      const visible = data.blocked_by_tool.slice(0, CHIP_CAP);
      const overflow = data.blocked_by_tool.length - visible.length;
      rows.push(`<div class="oc-row"><span class="oc-row-label tool">Missing tools:</span>${
        visible.map((t) => `<span class="oc-chip tool"><span class="name">${escapeHtml(t.tool)}</span>${t.count > 1 ? `<span class="meta">×${t.count}</span>` : ''}</span>`).join('')
      }${overflow > 0 ? overflowChip(overflow) : ''}</div>`);
    }
    if (data.traveling_members && data.traveling_members.length > 0) {
      const visible = data.traveling_members.slice(0, CHIP_CAP);
      const overflow = data.traveling_members.length - visible.length;
      rows.push(`<div class="oc-row"><span class="oc-row-label travel">Traveling:</span>${
        visible.map((m) => `<span class="oc-chip travel"><span class="name">${escapeHtml(m.name)}</span><span class="meta">${escapeHtml(m.status_text)}</span></span>`).join('')
      }${overflow > 0 ? overflowChip(overflow) : ''}</div>`);
    }
    body = rows.join('');
  }

  el.innerHTML = `
    <div class="oc-head">
      <span class="oc-tag">OC 2.0</span>
      ${summary}
      <button type="button" class="oc-toggle" data-act="oc-toggle">${collapsed ? '▾' : '▴'}</button>
    </div>
    ${body}
  `;
  el.classList.remove('hidden');

  el.querySelector<HTMLButtonElement>('[data-act="oc-toggle"]')?.addEventListener('click', () => {
    try {
      const next = localStorage.getItem(OC_COLLAPSED_KEY) === '1' ? '0' : '1';
      localStorage.setItem(OC_COLLAPSED_KEY, next);
    } catch { /* ignore */ }
    // Re-render with the toggled state without re-fetching.
    renderOcDigest(shadow, data);
  });
}

async function refreshOcDigest(shadow: ShadowRoot): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  try {
    const data = await fetchOcDigest(auth);
    renderOcDigest(shadow, data);
  } catch {
    renderOcDigest(shadow, null);
  }
}

function startOcDigestPolling(shadow: ShadowRoot, channelId: number): void {
  stopOcDigestPolling(shadow);
  if (!isOcDigestChannel(channelId)) return;
  _ocCardPoller = startPolling({
    name: 'chat-oc-digest',
    intervalMs: 300_000,
    fn: () => refreshOcDigest(shadow),
    immediate: true,
  });
}

function stopOcDigestPolling(shadow: ShadowRoot): void {
  if (_ocCardPoller) {
    _ocCardPoller.stop();
    _ocCardPoller = null;
  }
  renderOcDigest(shadow, null);
}

// ── War-room card (Task #9) ─────────────────────────────────
let _warCardPoller: PollHandle | null = null;

function isWarRoomChannel(channelId: number): boolean {
  const ch = _channels.find((c) => c.id === channelId);
  return ch?.name === 'war-room';
}

function renderWarRoomCard(shadow: ShadowRoot, data: WarRoomCardResponse | null): void {
  const el = shadow.querySelector<HTMLElement>('.war-room-card');
  if (!el) return;
  if (!data || !data.active) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  const scoreUs = data.score_us ?? 0;
  const scoreThem = data.score_them ?? 0;
  const lead = scoreUs - scoreThem;
  const leadCls = lead > 0 ? 'lead-up' : lead < 0 ? 'lead-down' : 'lead-tie';
  const target = data.target_score
    ? `<span class="wrc-meta">/ ${data.target_score.toLocaleString()}</span>`
    : '';
  // ``time_remaining_s`` arrives as 0 once the war's scheduled end has
  // passed even if the war is still scoring. Show "Target reached" when
  // either side has already crossed target_score, otherwise omit the chip.
  const targetReached = (data.target_score ?? 0) > 0 && (
    (data.score_us ?? 0) >= (data.target_score ?? 0) ||
    (data.score_them ?? 0) >= (data.target_score ?? 0)
  );
  const remainingSecs = data.time_remaining_s ?? 0;
  const remaining = remainingSecs > 0
    ? `<span class="wrc-meta">· ${fmtWarRemaining(remainingSecs)} left</span>`
    : (targetReached
        ? `<span class="wrc-meta" style="color:#d29922">· Target reached</span>`
        : '');
  const targets = (data.top_targets ?? [])
    .map((t) => `
      <a class="wrc-target" href="${escapeHtml(t.attack_url)}" target="_blank" rel="noopener noreferrer" title="L${t.level} · ${escapeHtml(t.threat_label)} · ${escapeHtml(t.status_text)}">
        <span>${escapeHtml(t.name)}</span><span class="lvl">L${t.level}</span>
      </a>`)
    .join('');
  const targetsRow = data.top_targets && data.top_targets.length > 0
    ? `<div class="wrc-targets"><span class="wrc-targets-label">Easiest now:</span>${targets}</div>`
    : `<div class="wrc-empty">No attackable enemies right now.</div>`;
  el.innerHTML = `
    <div class="wrc-row1">
      <span class="wrc-tag">RW Live</span>
      <span class="wrc-name">vs ${escapeHtml(data.opponent_name || 'Opponent')}</span>
      <span class="wrc-score ${leadCls}">${scoreUs.toLocaleString()} – ${scoreThem.toLocaleString()}</span>
      ${target}
      ${remaining}
    </div>
    ${targetsRow}
  `;
  el.classList.remove('hidden');
}

function fmtWarRemaining(secs: number): string {
  if (secs <= 0) return '0m';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

async function refreshWarCard(shadow: ShadowRoot): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  try {
    const data = await fetchWarRoomCard(auth);
    renderWarRoomCard(shadow, data);
  } catch {
    renderWarRoomCard(shadow, null);
  }
}

function startWarCardPolling(shadow: ShadowRoot, channelId: number): void {
  stopWarCardPolling(shadow);
  if (!isWarRoomChannel(channelId)) return;
  _warCardPoller = startPolling({
    name: 'chat-war-card',
    intervalMs: 30_000,
    fn: () => refreshWarCard(shadow),
    immediate: true,
  });
}

function stopWarCardPolling(shadow: ShadowRoot): void {
  if (_warCardPoller) {
    _warCardPoller.stop();
    _warCardPoller = null;
  }
  renderWarRoomCard(shadow, null);
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
  // Idempotent — if startChatDock ran more than once (SPA re-init, hot reload),
  // a stale .panel can linger with its delegated click listener bound to a
  // detached `.messages`. Then `shadow.querySelector('.panel')` returns the
  // stale one (or the new one, depending on order) while clicks land on the
  // other panel's `.messages` and never reach the bound handler. The visible
  // symptom: reaction chips look right but clicks do nothing. Strip prior
  // panels first; renderLaunchButton already follows this pattern.
  shadow.querySelectorAll('.panel').forEach((n) => n.remove());

  const panel = document.createElement('div');
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <div class="panel-header">
      <select class="ch-select"><option value="">Loading…</option></select>
      <button class="header-btn" data-act="search" title="Search chat">
        <svg viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>
      </button>
      <button class="header-btn" data-act="open-full" title="Open full TM Hub chat">
        <svg viewBox="0 0 16 16"><path d="M3.5 3a.5.5 0 0 0 0 1H12v8.5a.5.5 0 0 0 1 0V3.5a.5.5 0 0 0-.5-.5h-9z"/><path d="M11.854 5.146a.5.5 0 0 1 0 .708L4.207 13.5H10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5V7a.5.5 0 0 1 1 0v5.793l7.646-7.647a.5.5 0 0 1 .708 0z"/></svg>
      </button>
      <button class="header-btn" data-act="close" title="Close">
        <svg viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
      </button>
    </div>
    <div class="search-panel hidden">
      <div class="search-row">
        <input class="search-input" placeholder='Search… try "from:Bombel has:link xanax"' />
        <button class="search-close" data-act="search-close">Esc</button>
      </div>
      <div class="search-chips"></div>
      <div class="search-results"></div>
    </div>
    <div class="war-room-card hidden"></div>
    <div class="oc-digest-card hidden"></div>
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
    stopWarCardPolling(shadow);
    stopOcDigestPolling(shadow);
    await loadChannelInitial(shadow, val);
    startMessagePolling(shadow);
    startWarCardPolling(shadow, val);
    startOcDigestPolling(shadow, val);
    updatePlaceholder(shadow);
  });

  // Header actions
  panel.querySelector('[data-act="close"]')?.addEventListener('click', () => closeDock(shadow));
  panel.querySelector('[data-act="open-full"]')?.addEventListener('click', () => {
    window.open(`${HUB_ORIGIN}/chat`, '_blank');
  });
  // Search panel toggle + handlers (Roadmap Task #5 — companion parity).
  const searchPanel = panel.querySelector<HTMLElement>('.search-panel');
  const searchInput = panel.querySelector<HTMLInputElement>('.search-input');
  const searchChips = panel.querySelector<HTMLElement>('.search-chips');
  const searchResults = panel.querySelector<HTMLElement>('.search-results');
  let _searchTimer: number | null = null;
  let _searchSeq = 0;

  function setSearchOpen(open: boolean): void {
    if (!searchPanel) return;
    searchPanel.classList.toggle('hidden', !open);
    if (open) {
      searchInput?.focus();
    } else {
      if (searchInput) searchInput.value = '';
      if (searchChips) searchChips.innerHTML = '';
      if (searchResults) searchResults.innerHTML = '';
    }
  }

  async function runSearch(query: string): Promise<void> {
    if (!searchResults || !searchChips) return;
    const auth = getAuth();
    if (!auth) return;
    if (!query.trim()) {
      searchChips.innerHTML = '';
      searchResults.innerHTML = '';
      return;
    }
    const myReq = ++_searchSeq;
    searchResults.innerHTML = '<div class="search-row-empty">Searching…</div>';
    try {
      const r = await searchChatMessages(auth, query, 30);
      if (myReq !== _searchSeq) return; // stale response
      const chips: string[] = [];
      if (r.parsed.from_name) chips.push(`from:${escapeHtml(r.parsed.from_name)}`);
      if (r.parsed.in_channel) chips.push(`in:${escapeHtml(r.parsed.in_channel)}`);
      for (const h of r.parsed.has) chips.push(`has:${escapeHtml(h)}`);
      if (r.parsed.before_ts_max)
        chips.push(`before:${new Date(r.parsed.before_ts_max * 1000).toISOString().slice(0, 10)}`);
      if (r.parsed.after_ts_min)
        chips.push(`after:${new Date(r.parsed.after_ts_min * 1000).toISOString().slice(0, 10)}`);
      for (const n of r.parsed.neg_text) chips.push(`-${escapeHtml(n)}`);
      searchChips.innerHTML = chips.map((c) => `<span>${c}</span>`).join('');

      if (r.messages.length === 0) {
        searchResults.innerHTML = '<div class="search-row-empty">No matches.</div>';
        return;
      }
      const channelMap = new Map<number, string>();
      for (const ch of _channels) channelMap.set(ch.id, ch.name);
      searchResults.innerHTML = r.messages.map((m) => {
        const ch = channelMap.get(m.channel_id) ?? String(m.channel_id);
        const when = new Date(m.created_at * 1000).toLocaleString();
        // m.snippet from FTS5 already contains <mark> tags around hits and
        // no user-controllable HTML; falling back to escaped body otherwise.
        const body = m.snippet ?? escapeHtml(m.content.slice(0, 200));
        return `<button type="button" class="search-result" data-channel-id="${m.channel_id}" data-msg-id="${m.id}">
          <div class="meta"><span class="name">${escapeHtml(m.player_name)}</span> · #${escapeHtml(ch)} · ${escapeHtml(when)}</div>
          <div class="snippet">${body}</div>
        </button>`;
      }).join('');
    } catch (err) {
      if (myReq !== _searchSeq) return;
      const msg = err instanceof ApiError ? `${err.status} ${err.message}` : String(err);
      searchResults.innerHTML = `<div class="search-row-empty">Error: ${escapeHtml(msg)}</div>`;
    }
  }

  panel.querySelector('[data-act="search"]')?.addEventListener('click', () => {
    if (!searchPanel) return;
    setSearchOpen(searchPanel.classList.contains('hidden'));
  });
  panel.querySelector('[data-act="search-close"]')?.addEventListener('click', () => setSearchOpen(false));
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setSearchOpen(false);
  });
  searchInput?.addEventListener('input', () => {
    if (_searchTimer) window.clearTimeout(_searchTimer);
    _searchTimer = window.setTimeout(() => {
      void runSearch(searchInput.value);
    }, 250);
  });
  searchResults?.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.search-result');
    if (!btn) return;
    const chId = Number(btn.dataset.channelId);
    if (!chId) return;
    setSearchOpen(false);
    if (chId !== _state.channelId) {
      _state.channelId = chId;
      saveState(_state);
      stopMessagePolling();
      stopWarCardPolling(shadow);
      stopOcDigestPolling(shadow);
      await loadChannelInitial(shadow, chId);
      startMessagePolling(shadow);
      startWarCardPolling(shadow, chId);
      startOcDigestPolling(shadow, chId);
      const sel = panel.querySelector<HTMLSelectElement>('.ch-select');
      if (sel) sel.value = String(chId);
      updatePlaceholder(shadow);
    }
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

  // Chain-assist join / end — delegated click handler.
  messagesEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const joinBtn = target.closest<HTMLButtonElement>('button[data-join-id]');
    if (joinBtn) {
      const id = Number(joinBtn.dataset.joinId);
      if (id > 0) void handleAssistJoinClick(shadow, id, joinBtn);
      return;
    }
    const endBtn = target.closest<HTMLButtonElement>('button[data-end-id]');
    if (endBtn) {
      const id = Number(endBtn.dataset.endId);
      if (id > 0) void handleAssistEndClick(shadow, id, endBtn);
    }
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
      const entitiesHtml = renderEntities(m);
      const chainMatch = m.content.match(CHAIN_MARKER_RE);
      const chainAssistId = chainMatch ? Number(chainMatch[1]) : null;
      const bodyText = chainAssistId
        ? m.content.slice(chainMatch![0].length).trim()
        : m.content;
      const chainSlot = chainAssistId
        ? `<div class="chain-assist-slot" data-assist-id="${chainAssistId}"></div>`
        : '';
      return `
        ${separator}
        <div class="${cls}" data-msg-id="${m.id}">
          ${avatarCol}
          <div class="body-col">
            ${headerHtml}
            <div class="text${mentioned ? ' mentioned' : ''}">${renderMessageBody(bodyText, m.mentions, _roster)}</div>
            ${chainSlot}
            ${entitiesHtml}
            ${reactionsHtml}
          </div>
          <button type="button" class="reaction-add-trigger" data-add-trigger="1" title="Add reaction" aria-label="Add reaction">☺︎</button>
        </div>
      `;
    })
    .join('');
  // Hydrate any chain-assist slots present in the freshly-rendered DOM.
  void hydrateChainAssistSlots(shadow);
  // Kick off entity resolution for any newly-rendered messages. The render
  // happens immediately with whatever's already cached; this fills in the
  // rest asynchronously and re-renders when results arrive.
  void resolveVisibleEntities(shadow);
}

const QUICK_EMOJIS_TOP = ['👍', '❤️', '😂', '🎉', '🔥', '✅', '👀'];
const QUICK_EMOJIS_REST = ['❌', '💀', '🚀', '🟢', '🟡', '🔴'];
const QUICK_EMOJIS_ALL = [...QUICK_EMOJIS_TOP, ...QUICK_EMOJIS_REST];

function emojiButtonsHtml(emojis: readonly string[]): string {
  return emojis
    .map((e) => `<button type="button" data-pick="${escapeHtml(e)}">${escapeHtml(e)}</button>`)
    .join('');
}

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

// Keep the picker fully inside the viewport on the X axis. Anchors near the
// right edge of the dock used to position the picker so its tail spilled off
// screen — emojis were rendered but unreachable. offsetWidth requires the
// element to be in the DOM, so call this AFTER appendChild.
function clampPickerHorizontal(picker: HTMLElement, desiredLeft: number, margin = 8): void {
  const maxLeft = window.innerWidth - picker.offsetWidth - margin;
  picker.style.left = `${Math.max(margin, Math.min(desiredLeft, maxLeft))}px`;
}

function openPickerNear(shadow: ShadowRoot, anchor: HTMLElement, msgId: number): void {
  closePicker(shadow);
  anchor.classList.add('open');
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  // Default: top-7 most-used emojis + "⋯" trigger to expand to full set.
  // Single-row pill — no flex-wrap — beats the old 3-row 200px tile.
  picker.innerHTML =
    emojiButtonsHtml(QUICK_EMOJIS_TOP) +
    '<button type="button" class="more-btn" data-more aria-label="More reactions" title="More reactions">⋯</button>';
  // Mount at shadow-root level, NOT inside .messages: renderMessages() rewrites
  // .messages.innerHTML on every poll / websocket / entity-resolve cycle and
  // would silently delete the picker before the user can pick an emoji
  // (symptom: "+" looks dead). Viewport-relative `position: fixed` keeps the
  // picker tethered visually to the trigger across those re-renders.
  const rect = anchor.getBoundingClientRect();
  picker.style.top = `${rect.top - 44}px`;
  // `left` is set post-append by clampPickerHorizontal — it needs offsetWidth,
  // which is 0 until the element is in the DOM.
  picker.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('button[data-more]')) {
      // Expand in place — keep the picker element so the entry animation and
      // outside-click handler stay valid. closePicker() would tear it down.
      picker.innerHTML = emojiButtonsHtml(QUICK_EMOJIS_ALL);
      // Re-clamp horizontal position so the now-wider picker doesn't spill
      // past the viewport edge.
      clampPickerHorizontal(picker, rect.left);
      return;
    }
    const btn = target.closest<HTMLElement>('button[data-pick]');
    if (!btn) return;
    const emoji = btn.dataset.pick ?? '';
    await toggleReaction(shadow, msgId, emoji);
    closePicker(shadow);
  });
  shadow.appendChild(picker);
  // Clamp AFTER mount so offsetWidth reflects the rendered pill width.
  // Without this, anchors near the right dock edge spawned a picker that
  // overflowed the viewport and made the rightmost emojis unclickable.
  clampPickerHorizontal(picker, rect.left);
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
  } catch (err) {
    // Surface failures instead of swallowing them — a silent catch hid a
    // multi-panel listener-binding bug for an entire deploy cycle. We still
    // want next-poll reconciliation as the eventual source of truth, but the
    // user needs to know their tap did something.
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      clearAuth();
      showError(shadow, 'Session expired — reconnect TM Hub Companion.');
    } else if (err instanceof ApiError && err.status === 429) {
      showError(shadow, 'Slow down — reaction rate limit hit.');
    } else {
      showError(shadow, `Reaction failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
    console.warn('[tm-companion:reaction] toggleReaction failed', { msgId, emoji, err });
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
