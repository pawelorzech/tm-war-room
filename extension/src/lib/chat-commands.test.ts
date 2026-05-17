/**
 * Pure-function helpers powering the slash-command autocomplete dropdown
 * in the companion chat dock. UI wiring (DOM render + keyboard handler
 * installation) is tested in chat-dock through happy-dom; this file
 * covers the logic that decides WHAT to show.
 */

import { describe, it, expect } from 'vitest';
import {
  detectSlashContext,
  filterCommands,
  nextIndex,
  type ChatCommandInfo,
} from './chat-commands';

const COMMANDS: ChatCommandInfo[] = [
  { name: 'chain', description: 'Chain target controls' },
  { name: 'help', description: 'List commands' },
  { name: 'me', description: 'Emote action' },
  { name: 'poll', description: 'Quick reaction poll' },
];

describe('detectSlashContext', () => {
  it('returns the prefix when input starts with /letter', () => {
    expect(detectSlashContext('/he')).toEqual({ prefix: 'he', start: 1 });
    expect(detectSlashContext('/')).toEqual({ prefix: '', start: 1 });
  });

  it('returns null when input is empty or pure whitespace', () => {
    expect(detectSlashContext('')).toBeNull();
    expect(detectSlashContext('   ')).toBeNull();
  });

  it('returns null when input does not start with /', () => {
    expect(detectSlashContext('hello /help')).toBeNull();
    expect(detectSlashContext('text first')).toBeNull();
  });

  it('returns null once the user types a space (committed to args)', () => {
    expect(detectSlashContext('/help me')).toBeNull();
    expect(detectSlashContext('/me does a thing')).toBeNull();
  });

  it('returns null for /digit at-start (URLs / paths)', () => {
    expect(detectSlashContext('/123')).toBeNull();
  });
});

describe('filterCommands', () => {
  it('returns all commands for an empty prefix', () => {
    expect(filterCommands(COMMANDS, '')).toEqual(COMMANDS);
  });

  it('returns prefix-matching commands (case-insensitive)', () => {
    expect(filterCommands(COMMANDS, 'h')).toEqual([
      { name: 'help', description: 'List commands' },
    ]);
    expect(filterCommands(COMMANDS, 'H')).toEqual([
      { name: 'help', description: 'List commands' },
    ]);
    expect(filterCommands(COMMANDS, 'po')).toEqual([
      { name: 'poll', description: 'Quick reaction poll' },
    ]);
  });

  it('returns nothing when prefix matches nothing', () => {
    expect(filterCommands(COMMANDS, 'z')).toEqual([]);
  });

  it('does not match substrings (anchored at start)', () => {
    // "el" would substring-match "help" — must not appear
    expect(filterCommands(COMMANDS, 'el')).toEqual([]);
  });
});

describe('nextIndex', () => {
  it('cycles down through the list', () => {
    expect(nextIndex(0, 3, 'down')).toBe(1);
    expect(nextIndex(2, 3, 'down')).toBe(0);
  });

  it('cycles up through the list', () => {
    expect(nextIndex(1, 3, 'up')).toBe(0);
    expect(nextIndex(0, 3, 'up')).toBe(2);
  });

  it('clamps to 0 when the list is empty', () => {
    expect(nextIndex(0, 0, 'down')).toBe(0);
    expect(nextIndex(5, 0, 'up')).toBe(0);
  });

  it('snaps a stale index back inside the new bounds', () => {
    expect(nextIndex(9, 3, 'down')).toBe(0);
    expect(nextIndex(9, 3, 'up')).toBe(2);
  });
});
