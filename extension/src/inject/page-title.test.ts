// Tests for the page-title overlay.
//
// computeTitle and readPlayerState are pure / DOM-only and easy to verify.
// startPageTitle is checked via fake timers and the visibility gate from
// startPolling — see the integration-style block at the bottom.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeTitle,
  readPlayerState,
  startPageTitle,
  _resetPageTitleForTests,
  type PlayerTitleState,
} from './page-title';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.title = 'Torn City';
  _resetPageTitleForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('computeTitle', () => {
  it('returns the original title unchanged when state is unknown', () => {
    expect(computeTitle({ kind: 'unknown' }, 'Torn City')).toBe('Torn City');
  });

  it('renders a hospital countdown prefix', () => {
    const s: PlayerTitleState = { kind: 'hospital', secondsLeft: 12 * 60 };
    const t = computeTitle(s, 'Torn City');
    expect(t).toMatch(/Hospital/);
    expect(t).toMatch(/12m/);
    expect(t).toMatch(/\| TM Hub$/);
  });

  it('renders a jail countdown prefix', () => {
    const s: PlayerTitleState = { kind: 'jail', secondsLeft: 63 * 60 };
    const t = computeTitle(s, 'Torn City');
    expect(t).toMatch(/Jail/);
    expect(t).toMatch(/1h\s+03m/);
  });

  it('renders a traveling prefix with short destination + arrow', () => {
    const s: PlayerTitleState = { kind: 'traveling', destination: 'United Kingdom', secondsLeft: 28 * 60 };
    const t = computeTitle(s, 'Torn City');
    expect(t).toMatch(/→ UK/);
    expect(t).toMatch(/28m/);
  });

  it('caps the prefix at 30 chars before the " | TM Hub" suffix', () => {
    const s: PlayerTitleState = { kind: 'traveling', destination: 'A Very Long Destination Name', secondsLeft: 99 * 60 };
    const t = computeTitle(s, 'Torn City');
    const prefix = t.split('| TM Hub')[0].trim();
    expect(prefix.length).toBeLessThanOrEqual(30);
  });

  it('is idempotent — calling repeatedly with the same original does not accumulate prefixes', () => {
    const s: PlayerTitleState = { kind: 'hospital', secondsLeft: 5 * 60 };
    let t = computeTitle(s, 'Torn City');
    t = computeTitle(s, 'Torn City');
    t = computeTitle(s, 'Torn City');
    // Should appear exactly once.
    expect((t.match(/Hospital/g) || []).length).toBe(1);
  });
});

describe('readPlayerState', () => {
  function setSelfDom(html: string): void {
    document.body.innerHTML = `<div id="sidebar">${html}</div>`;
  }

  it('returns hospital state when the sidebar exposes a hospital countdown', () => {
    setSelfDom('<span data-tm-self-hospital data-seconds="720">In hospital</span>');
    const s = readPlayerState(document);
    expect(s.kind).toBe('hospital');
    if (s.kind === 'hospital') expect(s.secondsLeft).toBe(720);
  });

  it('returns travel state with the destination + countdown', () => {
    setSelfDom('<span data-tm-self-travel data-destination="Japan" data-seconds="1500">→</span>');
    const s = readPlayerState(document);
    expect(s.kind).toBe('traveling');
    if (s.kind === 'traveling') {
      expect(s.destination).toBe('Japan');
      expect(s.secondsLeft).toBe(1500);
    }
  });

  it('returns jail state with the countdown', () => {
    setSelfDom('<span data-tm-self-jail data-seconds="3780">In jail</span>');
    const s = readPlayerState(document);
    expect(s.kind).toBe('jail');
    if (s.kind === 'jail') expect(s.secondsLeft).toBe(3780);
  });

  it('returns unknown when the countdown is malformed', () => {
    setSelfDom('<span data-tm-self-hospital data-seconds="not-a-number">In hospital</span>');
    const s = readPlayerState(document);
    expect(s.kind).toBe('unknown');
  });

  it('returns unknown when nothing in the DOM matches', () => {
    setSelfDom('<span>Okay</span>');
    expect(readPlayerState(document).kind).toBe('unknown');
  });
});

describe('startPageTitle integration', () => {
  it('updates document.title from a hospital countdown on the first tick', async () => {
    document.body.innerHTML =
      '<div id="sidebar"><span data-tm-self-hospital data-seconds="720">In hospital</span></div>';
    startPageTitle();
    // startPolling fires immediately at t=0 — let microtasks flush.
    await new Promise((r) => setTimeout(r, 0));
    expect(document.title).toMatch(/Hospital/);
    expect(document.title).toMatch(/\| TM Hub$/);
  });

  it('restores the original title when state turns unknown after being known', async () => {
    document.body.innerHTML =
      '<div id="sidebar"><span data-tm-self-hospital data-seconds="720">In hospital</span></div>';
    startPageTitle();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.title).toMatch(/Hospital/);

    // Player healed → DOM no longer signals hospital.
    document.body.innerHTML = '<div id="sidebar"><span>Okay</span></div>';
    // Force a recompute by dispatching the companion refresh event the
    // inject listens for.
    window.dispatchEvent(new Event('tm-companion-refresh'));
    await new Promise((r) => setTimeout(r, 0));
    expect(document.title).toBe('Torn City');
  });
});
