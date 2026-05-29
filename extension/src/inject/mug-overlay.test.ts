import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MugScoreResponse } from '../types';
import { ApiError } from '../lib/api';

const { clearAuthMock } = vi.hoisted(() => ({ clearAuthMock: vi.fn() }));
vi.mock('../lib/auth', () => ({
  getAuth: () => ({ token: 't', player_id: 1, player_name: 'tester' }),
  clearAuth: clearAuthMock,
}));

const { fetchMugScoreMock } = vi.hoisted(() => ({ fetchMugScoreMock: vi.fn() }));
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, fetchMugScore: fetchMugScoreMock };
});

import { applyMugOverlay, _resetMugCacheForTests } from './mug-overlay';

const CHIP = 'tm-mug-chip';

function profile(pid: number): void {
  document.body.innerHTML = `<div id="mainContainer"><a href="/profiles.php?XID=${pid}">P${pid}</a></div>`;
}
function profileDup(pid: number): void {
  document.body.innerHTML = `<div id="mainContainer"><a href="/profiles.php?XID=${pid}">P${pid}</a><a href="/profiles.php?XID=${pid}">P${pid}</a></div>`;
}
function score(pid: number, tier: MugScoreResponse['tier'], n: number, hittable = true): MugScoreResponse {
  return { player_id: pid, score: n, tier, hittable_now: hittable, breakdown: { winnability: 30, money: 30, availability: 20, fresh_cash: 0, poker: 0 } };
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  fetchMugScoreMock.mockReset();
  clearAuthMock.mockReset();
  _resetMugCacheForTests();
});
afterEach(() => vi.restoreAllMocks());

describe('applyMugOverlay', () => {
  it('renders a prime chip with score and a mug link', async () => {
    fetchMugScoreMock.mockResolvedValue(score(100, 'prime', 80));
    profile(100);
    await applyMugOverlay();
    const chip = document.querySelector(`.${CHIP}`) as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.textContent || '').toMatch(/80/);
    expect(chip.classList.contains('tm-mug-prime')).toBe(true);
    const link = document.querySelector(`.${CHIP} a[href*="user2ID="]`) as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toContain('user2ID=100');
    expect(link.getAttribute('href')).toContain('sid=attack');
  });

  it('shows the breakdown in the chip title', async () => {
    fetchMugScoreMock.mockResolvedValue(score(101, 'prime', 80));
    profile(101);
    await applyMugOverlay();
    const chip = document.querySelector(`.${CHIP}`) as HTMLElement;
    expect((chip.getAttribute('title') || '')).toMatch(/win/i);
  });

  it('is quiet for a skip-tier target (no chip)', async () => {
    fetchMugScoreMock.mockResolvedValue(score(102, 'skip', 12));
    profile(102);
    await applyMugOverlay();
    expect(document.querySelector(`.${CHIP}`)).toBeNull();
  });

  it('is idempotent', async () => {
    fetchMugScoreMock.mockResolvedValue(score(103, 'good', 60));
    profile(103);
    await applyMugOverlay();
    await applyMugOverlay();
    expect(document.querySelectorAll(`.${CHIP}`).length).toBe(1);
  });

  it('marks cooldown targets distinctly and omits the mug link', async () => {
    fetchMugScoreMock.mockResolvedValue(score(104, 'cooldown', 20, false));
    profile(104);
    await applyMugOverlay();
    const chip = document.querySelector(`.${CHIP}`) as HTMLElement;
    expect(chip.classList.contains('tm-mug-cooldown')).toBe(true);
    expect(document.querySelector(`.${CHIP} a`)).toBeNull();
  });

  it('collapses multiple anchors for the same player into one chip', async () => {
    fetchMugScoreMock.mockResolvedValue(score(200, 'prime', 80));
    profileDup(200);
    await applyMugOverlay();
    expect(document.querySelectorAll(`.${CHIP}`).length).toBe(1);
    expect(fetchMugScoreMock).toHaveBeenCalledTimes(1);
  });

  it('does not chip the logged-in user', async () => {
    fetchMugScoreMock.mockResolvedValue(score(1, 'prime', 80));
    profile(1);
    await applyMugOverlay();
    expect(document.querySelector(`.${CHIP}`)).toBeNull();
    expect(fetchMugScoreMock).not.toHaveBeenCalledWith(expect.anything(), 1);
  });

  it('clears auth on a 401 from the score endpoint', async () => {
    fetchMugScoreMock.mockRejectedValue(new ApiError('unauthorized', 401));
    profile(105);
    await applyMugOverlay();
    expect(clearAuthMock).toHaveBeenCalled();
    expect(document.querySelector(`.${CHIP}`)).toBeNull();
  });
});
