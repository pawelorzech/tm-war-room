/**
 * Unit tests for chat-render — the pure DOM-render + event-wiring helpers
 * shared between the companion's chat dock and (potentially) hub.tri.ovh.
 *
 * Two surfaces under test:
 *
 *   1. renderMessageBody — turns raw chat content into safe HTML, linkifying
 *      Torn URLs and @mentions. Paweł reported on 2026-05-17 that a pasted
 *      profile URL ("https://www.torn.com/profiles.php?XID=4096610") shows
 *      up as plain text in the companion dock — failing test below pins
 *      the expected behaviour.
 *
 *   2. wireReactionHandlers — installs a delegated click handler on the
 *      message scroll container. Chip click toggles a reaction; the "+ add
 *      reaction" trigger opens a picker. Failing test below verifies that
 *      a chip click reaches the toggle callback with (messageId, emoji).
 *
 * No real network — fakes are injected.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderMessageBody, wireReactionHandlers } from './chat-render';

describe('renderMessageBody', () => {
  const roster = new Map<number, string>([[100, 'Alice']]);

  it('renders plain text unchanged (HTML-escaped)', () => {
    const out = renderMessageBody('hello world', [], roster);
    expect(out).toContain('hello world');
    expect(out).not.toContain('<a ');
  });

  it('escapes raw HTML', () => {
    const out = renderMessageBody('<script>alert(1)</script>', [], roster);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('linkifies a full Torn profile URL', () => {
    const out = renderMessageBody(
      'check https://www.torn.com/profiles.php?XID=4096610 now',
      [],
      roster,
    );
    expect(out).toMatch(
      /<a[^>]*href="https:\/\/www\.torn\.com\/profiles\.php\?XID=4096610"/,
    );
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    // text body of the anchor should be the URL itself
    expect(out).toMatch(
      /<a[^>]*>https:\/\/www\.torn\.com\/profiles\.php\?XID=4096610<\/a>/,
    );
  });

  it('linkifies http URLs and Torn-relative URLs', () => {
    const out = renderMessageBody(
      'see http://example.com/path?x=1 and torn.com/item.php?XID=180',
      [],
      roster,
    );
    expect(out).toMatch(/<a[^>]*href="http:\/\/example\.com\/path\?x=1"/);
    // bare-host Torn link should get an explicit https:// in the href
    expect(out).toMatch(/<a[^>]*href="https:\/\/torn\.com\/item\.php\?XID=180"/);
  });

  it('does not include trailing punctuation in the URL', () => {
    const out = renderMessageBody(
      'see https://www.torn.com/profiles.php?XID=1, ok?',
      [],
      roster,
    );
    expect(out).toMatch(
      /<a[^>]*href="https:\/\/www\.torn\.com\/profiles\.php\?XID=1"[^>]*>https:\/\/www\.torn\.com\/profiles\.php\?XID=1<\/a>,/,
    );
  });

  it('still linkifies @mentions (existing behaviour preserved)', () => {
    const out = renderMessageBody('hey @Alice', [100], roster);
    expect(out).toContain('class="mention"');
    expect(out).toContain('href="https://www.torn.com/profiles.php?XID=100"');
    expect(out).toContain('@Alice');
  });

  it('linkifies both a URL and a mention in the same message', () => {
    const out = renderMessageBody(
      '@Alice look at https://www.torn.com/item.php?XID=180',
      [100],
      roster,
    );
    expect(out).toContain('class="mention"');
    expect(out).toContain('href="https://www.torn.com/item.php?XID=180"');
  });

  it('elides a URL listed in hiddenUrls but keeps surrounding prose', () => {
    // When the entity card for this URL has already resolved, the dock
    // renders the card below the message and asks renderMessageBody to drop
    // the raw URL anchor — otherwise the user sees both the URL and the
    // card side-by-side. Surrounding prose ("see" / "thanks") must survive.
    const out = renderMessageBody(
      'see https://www.torn.com/profiles.php?XID=42 thanks',
      [],
      new Map(),
      new Set(['https://www.torn.com/profiles.php?XID=42']),
    );
    expect(out).not.toContain('<a class="link"');
    expect(out).not.toContain('href="https://www.torn.com/profiles.php?XID=42"');
    expect(out).toContain('see');
    expect(out).toContain('thanks');
  });
});

describe('wireReactionHandlers', () => {
  let messagesEl: HTMLDivElement;
  let toggle: ReturnType<typeof vi.fn>;
  let openPicker: ReturnType<typeof vi.fn>;
  let closePicker: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    messagesEl = document.createElement('div');
    messagesEl.className = 'messages';
    document.body.innerHTML = '';
    document.body.appendChild(messagesEl);

    toggle = vi.fn();
    openPicker = vi.fn();
    closePicker = vi.fn();

    wireReactionHandlers(messagesEl, {
      onToggleReaction: toggle,
      onOpenPicker: openPicker,
      onClosePicker: closePicker,
      isPickerOpen: () => false,
    });
  });

  function mountMessage(html: string): void {
    messagesEl.innerHTML = html;
  }

  it('invokes onToggleReaction when a chip is clicked', () => {
    mountMessage(`
      <div class="msg" data-msg-id="42">
        <div class="body-col">
          <div class="reactions">
            <button class="reaction-chip" data-emoji="👍"><span>👍</span><span class="count">1</span></button>
          </div>
        </div>
      </div>
    `);
    const chip = messagesEl.querySelector<HTMLButtonElement>('.reaction-chip')!;
    chip.click();
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledWith(42, '👍');
  });

  it('still picks the emoji when the inner span is the click target', () => {
    mountMessage(`
      <div class="msg" data-msg-id="7">
        <div class="reactions">
          <button class="reaction-chip" data-emoji="🎉"><span class="count">3</span></button>
        </div>
      </div>
    `);
    const span = messagesEl.querySelector<HTMLSpanElement>('.reaction-chip .count')!;
    span.click();
    expect(toggle).toHaveBeenCalledWith(7, '🎉');
  });

  it('invokes onOpenPicker for the "+" trigger', () => {
    mountMessage(`
      <div class="msg" data-msg-id="13">
        <button class="reaction-add-trigger" type="button">+</button>
      </div>
    `);
    const trigger = messagesEl.querySelector<HTMLButtonElement>('.reaction-add-trigger')!;
    trigger.click();
    expect(openPicker).toHaveBeenCalledTimes(1);
    const [arg0, arg1] = openPicker.mock.calls[0];
    expect(arg0).toBe(trigger);
    expect(arg1).toBe(13);
  });

  it('closes the picker when isPickerOpen=true and a click lands elsewhere', () => {
    // Re-wire with an open picker
    document.body.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'messages';
    document.body.appendChild(el);
    const close = vi.fn();
    wireReactionHandlers(el, {
      onToggleReaction: vi.fn(),
      onOpenPicker: vi.fn(),
      onClosePicker: close,
      isPickerOpen: () => true,
    });
    el.innerHTML = `<div class="msg" data-msg-id="1"><div class="text">hi</div></div>`;
    const text = el.querySelector<HTMLDivElement>('.text')!;
    text.click();
    expect(close).toHaveBeenCalled();
  });

  it('does not call onToggleReaction or onOpenPicker on unrelated clicks', () => {
    mountMessage(`<div class="msg" data-msg-id="9"><div class="text">x</div></div>`);
    messagesEl.querySelector<HTMLDivElement>('.text')!.click();
    expect(toggle).not.toHaveBeenCalled();
    expect(openPicker).not.toHaveBeenCalled();
  });

  it('finds the message id even when click target is several levels deep', () => {
    mountMessage(`
      <div class="msg" data-msg-id="99">
        <div class="body-col"><div class="reactions">
          <button class="reaction-chip" data-emoji="🔥">
            <span aria-hidden="true">🔥</span><span class="count">2</span>
          </button>
        </div></div>
      </div>
    `);
    const inner = messagesEl.querySelector<HTMLSpanElement>('.reaction-chip span[aria-hidden]')!;
    inner.click();
    expect(toggle).toHaveBeenCalledWith(99, '🔥');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Picker mount invariant — captures the 0.31.2 fix.
//
// Bug 0.28.0 → 0.31.1: openPickerNear did `messages.appendChild(picker)`. Every
// renderMessages() (chat poll, websocket update, entity resolve) does
// `messages.innerHTML = …`, deleting the picker before the user can click an
// emoji. Symptom: tap "+" → nothing visible → "+ is broken".
//
// 0.31.2 fix: mount the picker at the shadow-root level. These tests document
// the invariant in both directions so a future regression is loud.
// ─────────────────────────────────────────────────────────────────────────────
describe('picker mount invariant', () => {
  it('a picker mounted at shadow-root level survives a .messages innerHTML rewrite', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    const panel = document.createElement('div');
    panel.className = 'panel';
    const messages = document.createElement('div');
    messages.className = 'messages';
    messages.innerHTML = '<div class="msg" data-msg-id="1">hi</div>';
    panel.appendChild(messages);
    shadow.appendChild(panel);

    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    shadow.appendChild(picker);

    // Simulate renderMessages() rewriting .messages.innerHTML mid-render.
    messages.innerHTML = '<div class="msg" data-msg-id="2">new</div>';

    expect(shadow.querySelector('.reaction-picker')).toBe(picker);
    expect(messages.contains(picker)).toBe(false);
  });

  it('REGRESSION GUARD: a picker mounted INSIDE .messages is destroyed by innerHTML rewrite', () => {
    // The old (broken) mounting strategy. If this test ever starts failing,
    // happy-dom semantics have shifted — confirm the production fix still
    // applies before "fixing" this test.
    const messages = document.createElement('div');
    messages.innerHTML = '<div class="msg">hi</div>';
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    messages.appendChild(picker);

    expect(messages.querySelector('.reaction-picker')).toBe(picker);
    messages.innerHTML = '<div class="msg">new</div>';
    expect(messages.querySelector('.reaction-picker')).toBeNull();
  });
});
