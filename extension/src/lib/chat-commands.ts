/**
 * Pure helpers for the companion's slash-command autocomplete.
 *
 * UI wiring lives in chat-dock.ts; this module is intentionally
 * dependency-free so it can be unit-tested in happy-dom and shared with
 * the main hub frontend if we choose to consolidate later.
 */

export interface ChatCommandInfo {
  name: string;
  description: string;
}

export interface SlashContext {
  /** The text typed after the leading "/" (no slash, no spaces). */
  prefix: string;
  /** Offset where the command name starts (always 1 — directly after /). */
  start: number;
}

const PREFIX_RE = /^\/([A-Za-z][A-Za-z0-9_-]*)?$/;

/**
 * Decide whether the user is mid-typing a slash command. Returns the
 * prefix string the dropdown should filter on, or ``null`` when the
 * dropdown should be hidden (no slash, slash already followed by space,
 * leading digit, etc.).
 *
 * We require the input to start with "/" AND contain no whitespace —
 * once the user types a space, they've committed to the command and
 * we're in "typing args" mode, where the dropdown is no longer useful.
 */
export function detectSlashContext(input: string): SlashContext | null {
  if (!input || /^\s/.test(input)) {
    // Empty or pure whitespace — no dropdown. Note: leading whitespace
    // means the user didn't type a slash first, so this isn't a command.
    if (!input.trim()) return null;
  }
  const m = input.match(PREFIX_RE);
  if (!m) return null;
  return { prefix: m[1] ?? '', start: 1 };
}

/**
 * Return the subset of commands whose name starts with ``prefix``
 * (case-insensitive). An empty prefix returns the full list, so the
 * dropdown shows everything as soon as the user types the lone "/".
 */
export function filterCommands(
  commands: ChatCommandInfo[],
  prefix: string,
): ChatCommandInfo[] {
  if (!prefix) return commands;
  const needle = prefix.toLowerCase();
  return commands.filter((c) => c.name.toLowerCase().startsWith(needle));
}

/**
 * Compute the next highlighted index in a keyboard-navigated dropdown.
 *
 * - ``len === 0`` → 0 (no list)
 * - ``current`` outside the new bounds → clamp back inside
 * - otherwise cycle with wraparound
 */
export function nextIndex(
  current: number,
  len: number,
  direction: 'up' | 'down',
): number {
  if (len <= 0) return 0;
  if (current < 0 || current >= len) {
    return direction === 'down' ? 0 : len - 1;
  }
  if (direction === 'down') return (current + 1) % len;
  return (current - 1 + len) % len;
}
