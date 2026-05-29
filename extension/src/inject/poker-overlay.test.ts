import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/auth', () => ({ getAuth: () => ({ token: 't', player_id: 1, player_name: 'me' }), clearAuth: () => {} }));

import { applyPokerOverlay, decoratePokerSeats, detectStoodUp, _resetPokerStateForTests } from './poker-overlay';

function seat(pid: number, name: string, chips: number | string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tm-test-seat';
  el.setAttribute('data-player-id', String(pid));
  el.innerHTML = `<a href="/profiles.php?XID=${pid}">${name}</a><span class="chips">${chips}</span>`;
  return el;
}

beforeEach(() => { document.body.innerHTML = ''; _resetPokerStateForTests(); });
afterEach(() => vi.restoreAllMocks());

describe('decoratePokerSeats', () => {
  it('adds a quick-attack link next to each seated opponent', () => {
    const s = seat(50, 'Rich', 5_000_000);
    document.body.appendChild(s);
    decoratePokerSeats([s], { bigStackThreshold: 1_000_000, selfId: 1 });
    const link = s.querySelector('a[href*="loader.php?sid=attack"]') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toContain('user2ID=50');
  });

  it('flags a big stack', () => {
    const s = seat(51, 'Whale', 9_000_000);
    document.body.appendChild(s);
    decoratePokerSeats([s], { bigStackThreshold: 1_000_000, selfId: 1 });
    expect(s.querySelector('.tm-poker-bigstack')).toBeTruthy();
  });

  it('does not decorate the player themselves', () => {
    const s = seat(1, 'me', 100);
    document.body.appendChild(s);
    decoratePokerSeats([s], { bigStackThreshold: 1_000_000, selfId: 1 });
    expect(s.querySelector('a[href*="attack"]')).toBeNull();
  });
});

describe('detectStoodUp', () => {
  it('returns players who left between snapshots, big stack first', () => {
    const prev = new Map([[50, { name: 'Rich', chips: 5_000_000 }], [51, { name: 'Small', chips: 100 }]]);
    const now = new Map([[51, { name: 'Small', chips: 100 }]]);
    const left = detectStoodUp(prev, now, 1_000_000);
    expect(left.map((p) => p.playerId)).toEqual([50]);
    expect(left[0].bigStack).toBe(true);
  });

  it('returns empty when nobody left', () => {
    const prev = new Map([[50, { name: 'Rich', chips: 5_000_000 }]]);
    const now = new Map([[50, { name: 'Rich', chips: 5_000_000 }]]);
    expect(detectStoodUp(prev, now, 1_000_000)).toEqual([]);
  });
});

describe('applyPokerOverlay', () => {
  it('no toast storm when leaving the table', () => {
    document.body.appendChild(seat(50, 'Rich', 5_000_000));
    document.body.appendChild(seat(51, 'Whale', 9_000_000));
    applyPokerOverlay(); // snapshots the table
    document.body.innerHTML = ''; // left the table — no seats
    applyPokerOverlay();
    expect(document.querySelectorAll('.tm-poker-toast').length).toBe(0);
  });

  it('toasts a player who stood up, once', () => {
    document.body.appendChild(seat(50, 'Rich', 5_000_000));
    document.body.appendChild(seat(51, 'Small', 100));
    applyPokerOverlay();
    document.querySelector('[data-player-id="50"]')!.remove(); // 50 stands up, 51 stays
    applyPokerOverlay();
    const toasts = document.querySelectorAll('.tm-poker-toast');
    expect(toasts.length).toBe(1);
    expect(toasts[0].textContent).toContain('Rich');
    applyPokerOverlay(); // 51 still seated — no new diff
    expect(document.querySelectorAll('.tm-poker-toast').length).toBe(1);
  });

  it('does not toast when the player themselves leaves', () => {
    document.body.appendChild(seat(1, 'me', 100));
    document.body.appendChild(seat(50, 'Rich', 5_000_000));
    applyPokerOverlay();
    document.querySelector('[data-player-id="1"]')!.remove(); // self stands up, 50 stays
    applyPokerOverlay();
    expect(document.querySelectorAll('.tm-poker-toast').length).toBe(0);
  });
});

describe('decoratePokerSeats edge cases', () => {
  it('decoratePokerSeats is idempotent', () => {
    const s = seat(50, 'Rich', 5_000_000);
    document.body.appendChild(s);
    decoratePokerSeats([s], { bigStackThreshold: 1_000_000, selfId: 1 });
    decoratePokerSeats([s], { bigStackThreshold: 1_000_000, selfId: 1 });
    expect(s.querySelectorAll('.tm-poker-attack').length).toBe(1);
  });

  it('flags an abbreviated big stack', () => {
    const s = seat(52, 'BigWhale', '1.2b');
    document.body.appendChild(s);
    decoratePokerSeats([s], { bigStackThreshold: 1_000_000, selfId: 1 });
    expect(s.querySelector('.tm-poker-bigstack')).toBeTruthy();
  });
});
