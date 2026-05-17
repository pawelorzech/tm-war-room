/**
 * Pure-DOM helpers for rendering chat messages in the companion dock.
 *
 * Two reasons this lives in lib/ rather than inline in inject/chat-dock.ts:
 *
 *   1. `chat-dock.ts` is too big to unit-test directly (mounts a whole
 *      Shadow-DOM panel, calls into network helpers, owns state). Splitting
 *      the rendering + event-wiring into pure functions lets us cover them
 *      with happy-dom unit tests.
 *
 *   2. Sharing the URL-linkification + mention-highlight logic across the
 *      companion and the main hub.tri.ovh frontend is a likely follow-up;
 *      this module is the natural home for that shared logic.
 */

import { escapeHtml } from './format';

// ── Body rendering ──────────────────────────────────────────────────────────

// Match http(s)://… URLs and bare torn.com/<path> shortcuts. Torn URLs are the
// load-bearing case (profile / faction / item / rankedwar) and frequently
// appear without the scheme.
//
// Greedy up to whitespace OR the typical sentence-end punctuation set; that
// keeps "hit https://foo," from pulling the trailing comma into the href.
const URL_RE =
  /\b(https?:\/\/[^\s<>"]+|(?:www\.)?torn\.com\/[^\s<>"]+)/gi;
const TRAILING_PUNCT_RE = /[)\].,;:!?'"]+$/;
const MENTION_RE = /@[\w-]+/g;

interface Token {
  kind: 'text' | 'url' | 'mention';
  raw: string;
}

function tokenize(content: string): Token[] {
  // Single-pass scan: at each position, take whichever match (URL / mention)
  // starts first; otherwise emit the next chunk of plain text.
  const tokens: Token[] = [];
  let i = 0;

  while (i < content.length) {
    URL_RE.lastIndex = i;
    MENTION_RE.lastIndex = i;
    const urlMatch = URL_RE.exec(content);
    const mentionMatch = MENTION_RE.exec(content);

    // Pick the earliest match that begins AT OR AFTER the cursor.
    let next: { kind: 'url' | 'mention'; index: number; raw: string } | null = null;
    if (urlMatch && urlMatch.index >= i) {
      next = { kind: 'url', index: urlMatch.index, raw: urlMatch[0] };
    }
    if (mentionMatch && mentionMatch.index >= i) {
      if (!next || mentionMatch.index < next.index) {
        next = { kind: 'mention', index: mentionMatch.index, raw: mentionMatch[0] };
      }
    }

    if (!next) {
      tokens.push({ kind: 'text', raw: content.slice(i) });
      break;
    }

    if (next.index > i) {
      tokens.push({ kind: 'text', raw: content.slice(i, next.index) });
    }

    // Strip trailing sentence punctuation from URLs (and emit it as text).
    let raw = next.raw;
    if (next.kind === 'url') {
      const trail = raw.match(TRAILING_PUNCT_RE);
      if (trail) {
        raw = raw.slice(0, raw.length - trail[0].length);
      }
      tokens.push({ kind: 'url', raw });
      if (trail) tokens.push({ kind: 'text', raw: trail[0] });
    } else {
      tokens.push({ kind: 'mention', raw });
    }

    i = next.index + next.raw.length;
  }

  return tokens;
}

function normaliseUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function renderUrlAnchor(raw: string): string {
  const href = normaliseUrl(raw);
  const escapedHref = escapeHtml(href);
  const escapedText = escapeHtml(raw);
  return `<a class="link" href="${escapedHref}" target="_blank" rel="noopener noreferrer">${escapedText}</a>`;
}

function renderMention(raw: string, mentions: number[], roster: Map<number, string>): string {
  // Build name→id map limited to the message's mentions list (so non-faction
  // names typed with @ aren't linkified — only members we've confirmed).
  const nameToId: Record<string, number> = {};
  for (const pid of mentions) {
    const name = roster.get(pid);
    if (name) nameToId[name.toLowerCase()] = pid;
  }
  const nameLower = raw.slice(1).toLowerCase();
  const pid = nameToId[nameLower];
  if (pid) {
    return `<a class="mention" href="https://www.torn.com/profiles.php?XID=${pid}" target="_blank" rel="noopener noreferrer">${escapeHtml(raw)}</a>`;
  }
  return `<span class="mention">${escapeHtml(raw)}</span>`;
}

/**
 * Render a chat message body to safe HTML.
 *
 * Linkifies:
 *   • full http(s) URLs                  → <a class="link">
 *   • bare torn.com/foo paths             → <a class="link">
 *   • @PlayerName when the id is in the
 *     message's `mentions` list and the
 *     roster knows the name              → <a class="mention">
 *
 * All other text is HTML-escaped.
 */
export function renderMessageBody(
  content: string,
  mentions: number[],
  roster: Map<number, string>,
): string {
  return tokenize(content)
    .map((t) => {
      if (t.kind === 'url') return renderUrlAnchor(t.raw);
      if (t.kind === 'mention') return renderMention(t.raw, mentions, roster);
      return escapeHtml(t.raw);
    })
    .join('');
}

// ── Reaction event wiring ──────────────────────────────────────────────────

export interface ReactionHandlerDeps {
  onToggleReaction: (messageId: number, emoji: string) => void;
  onOpenPicker: (trigger: HTMLElement, messageId: number) => void;
  onClosePicker: () => void;
  isPickerOpen: () => boolean;
}

function findMessageId(target: Element | null): number | null {
  let el: Element | null = target;
  while (el) {
    if (el instanceof HTMLElement && el.dataset.msgId) return Number(el.dataset.msgId);
    el = el.parentElement;
  }
  return null;
}

/**
 * Install a delegated click handler on the messages scroll container.
 *
 * Click classification (top-down):
 *   1. `.reaction-chip`         → toggle that emoji
 *   2. `.reaction-add-trigger`  → open the emoji picker for that message
 *   3. anything else, but a picker is currently open → close it
 *
 * The handler stops propagation only when it acts on (1) or (2), so other
 * listeners on the messages container still fire for general clicks.
 *
 * Returns the listener that was installed, in case callers want to detach.
 */
export function wireReactionHandlers(
  messagesEl: HTMLElement,
  deps: ReactionHandlerDeps,
): (e: Event) => void {
  // Opt-in diagnostic — set `localStorage.setItem('tm-debug', '1')` on
  // torn.com to log every click that reaches this listener. Lets users
  // self-diagnose "the chip does nothing" without us being on a debugging
  // call together. Wrapped in try/catch because some test/sandbox envs
  // expose a `localStorage` global without a working `.getItem`.
  let debug = false;
  try {
    debug = typeof localStorage !== 'undefined' && localStorage.getItem('tm-debug') === '1';
  } catch {
    /* SecurityError in sandboxed contexts — debug stays off. */
  }

  const handler = (e: Event): void => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const chip = target.closest<HTMLElement>('.reaction-chip');
    if (chip && messagesEl.contains(chip)) {
      e.stopPropagation();
      const msgId = findMessageId(chip);
      const emoji = chip.dataset.emoji ?? '';
      if (debug) console.debug('[tm-companion:reaction] chip click', { msgId, emoji });
      if (msgId !== null && emoji) deps.onToggleReaction(msgId, emoji);
      return;
    }

    const trigger = target.closest<HTMLElement>('.reaction-add-trigger');
    if (trigger && messagesEl.contains(trigger)) {
      e.stopPropagation();
      const msgId = findMessageId(trigger);
      if (debug) console.debug('[tm-companion:reaction] trigger click', { msgId });
      if (msgId !== null) deps.onOpenPicker(trigger, msgId);
      return;
    }

    if (debug)
      console.debug(
        '[tm-companion:reaction] click on .messages but not a chip/trigger',
        target.tagName,
        target.className,
      );
    if (deps.isPickerOpen()) deps.onClosePicker();
  };

  messagesEl.addEventListener('click', handler);
  if (debug) console.debug('[tm-companion:reaction] listener installed on', messagesEl);
  return handler;
}
