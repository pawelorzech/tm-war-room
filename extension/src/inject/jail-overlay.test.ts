// Tests for the jail-overlay spy estimate pill.
//
// Jail rows already show mate / enemy / off-limits / target pills via
// decorateRows. We add a fifth pill for the player's spy bucket (verified /
// estimate / rough_guess / endgame). The known set is widened so a player with
// ONLY spy data still gets decorated.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnownSpiesResponse, KeysResponse, EnemyResponse, WarOffLimitsResponse, TargetsResponse } from '../types';
import type { SpyEstimate } from '../lib/spy-display';

vi.mock('../lib/auth', () => ({
  getAuth: () => ({ token: 't', player_id: 1, player_name: 'tester' }),
  clearAuth: () => {},
}));

const { fetchKeysMock, fetchEnemyMock, fetchOffLimitsMock, fetchTargetsMock, fetchKnownSpiesMock, getCachedFeatureFlagsMock } = vi.hoisted(() => ({
  fetchKeysMock: vi.fn(),
  fetchEnemyMock: vi.fn(),
  fetchOffLimitsMock: vi.fn(),
  fetchTargetsMock: vi.fn(),
  fetchKnownSpiesMock: vi.fn(),
  getCachedFeatureFlagsMock: vi.fn(() => ({ hit_calling: false })),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    fetchKeys: fetchKeysMock,
    fetchEnemy: fetchEnemyMock,
    fetchOffLimits: fetchOffLimitsMock,
    fetchTargets: fetchTargetsMock,
    fetchKnownSpies: fetchKnownSpiesMock,
    getCachedFeatureFlags: getCachedFeatureFlagsMock,
  };
});

import { applyJailOverlay, _resetJailCacheForTests } from './jail-overlay';

const STYLE_ID = 'tm-companion-jail-styles';
const BADGE_ATTR = 'data-tm-jail-badge';
const SPY_PILL_CLASS = 'pill-spy';

function spy(playerId: number, bucket: SpyEstimate['bucket'], extras: Partial<SpyEstimate> = {}): SpyEstimate {
  const hasStats = bucket === 'verified' || bucket === 'estimate';
  return {
    player_id: playerId,
    player_name: `P${playerId}`,
    strength: hasStats ? 1_000_000 : null,
    defense: hasStats ? 1_000_000 : null,
    speed: hasStats ? 1_000_000 : null,
    dexterity: hasStats ? 1_000_000 : null,
    total: 4_000_000,
    confidence: 'estimate',
    source: 'tornstats',
    reported_at: '2026-05-10',
    age_days: 7,
    bucket,
    total_range:
      bucket === 'endgame'
        ? [null, null]
        : bucket === 'rough_guess'
          ? [2_000_000, 8_000_000]
          : [3_500_000, 4_500_000],
    range_width_pct: 25,
    ...extras,
  };
}

function setJailRow(pid: number): void {
  document.body.innerHTML = `
    <div id="mainContainer">
      <ul class="jail-list">
        <li><a href="/profiles.php?XID=${pid}">P${pid}</a></li>
      </ul>
    </div>
  `;
}

function mockBase(): void {
  fetchKeysMock.mockResolvedValue({ keys: [] } as unknown as KeysResponse);
  fetchEnemyMock.mockResolvedValue({ members: [] } as unknown as EnemyResponse);
  fetchOffLimitsMock.mockResolvedValue({ war_id: 0, count: 0, entries: [] } as unknown as WarOffLimitsResponse);
  fetchTargetsMock.mockResolvedValue({ targets: [], count: 0 } as unknown as TargetsResponse);
  fetchKnownSpiesMock.mockResolvedValue({ estimates: [], count: 0 } as unknown as KnownSpiesResponse);
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  fetchKeysMock.mockReset();
  fetchEnemyMock.mockReset();
  fetchOffLimitsMock.mockReset();
  fetchTargetsMock.mockReset();
  fetchKnownSpiesMock.mockReset();
  document.getElementById(STYLE_ID)?.remove();
  _resetJailCacheForTests();
  mockBase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyJailOverlay — spy estimate pill', () => {
  it('renders a verified spy pill on the jail row', async () => {
    const pid = 300;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'verified')], count: 1 } as unknown as KnownSpiesResponse);
    setJailRow(pid);

    await applyJailOverlay({ warId: null });

    const pill = document.querySelector(`.${SPY_PILL_CLASS}`) as HTMLElement;
    expect(pill).toBeTruthy();
    expect(pill.classList.contains('tm-bucket-verified')).toBe(true);
    expect(pill.textContent || '').toMatch(/VERIFIED/i);
  });

  it('renders an estimate pill with a range string', async () => {
    const pid = 301;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'estimate')], count: 1 } as unknown as KnownSpiesResponse);
    setJailRow(pid);

    await applyJailOverlay({ warId: null });

    const pill = document.querySelector(`.${SPY_PILL_CLASS}`) as HTMLElement;
    expect(pill).toBeTruthy();
    expect(pill.classList.contains('tm-bucket-estimate')).toBe(true);
    expect(pill.textContent || '').toMatch(/\d+[BMK]\s*—\s*\d+[BMK]/);
  });

  it('renders rough_guess pill with range only, no per-stat split', async () => {
    const pid = 302;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'rough_guess')], count: 1 } as unknown as KnownSpiesResponse);
    setJailRow(pid);

    await applyJailOverlay({ warId: null });

    const pill = document.querySelector(`.${SPY_PILL_CLASS}`) as HTMLElement;
    expect(pill).toBeTruthy();
    expect(pill.classList.contains('tm-bucket-rough_guess')).toBe(true);
    expect(pill.textContent || '').not.toMatch(/STR\b/);
  });

  it('renders endgame pill without any numeric range', async () => {
    const pid = 303;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'endgame', { rank: 'Heroic', level: 95 })], count: 1 } as unknown as KnownSpiesResponse);
    setJailRow(pid);

    await applyJailOverlay({ warId: null });

    const pill = document.querySelector(`.${SPY_PILL_CLASS}`) as HTMLElement;
    expect(pill).toBeTruthy();
    expect(pill.classList.contains('tm-bucket-endgame')).toBe(true);
    expect(pill.textContent || '').not.toMatch(/\d+\.\d+[BMK]/);
  });

  it('demotes the spy pill when the row is in the war off-limits map', async () => {
    const pid = 304;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'verified')], count: 1 } as unknown as KnownSpiesResponse);
    fetchOffLimitsMock.mockResolvedValue({
      war_id: 999,
      count: 1,
      entries: [
        {
          war_id: 999,
          player_id: pid,
          player_name: `P${pid}`,
          set_by: 1,
          set_by_name: 'X',
          reason: 'medded',
          created_at: '',
          updated_at: '',
        },
      ],
    } as unknown as WarOffLimitsResponse);
    setJailRow(pid);

    await applyJailOverlay({ warId: 999 });

    const pill = document.querySelector(`.${SPY_PILL_CLASS}`) as HTMLElement;
    expect(pill).toBeTruthy();
    expect(pill.classList.contains('tm-off-limits')).toBe(true);
  });

  it('renders nothing extra when the player is not in any TM data set (quiet by design)', async () => {
    const pid = 305;
    // fetchKnownSpies returns no spies, no keys/enemy/off-limits/targets.
    setJailRow(pid);

    await applyJailOverlay({ warId: null });

    expect(document.querySelectorAll(`[${BADGE_ATTR}]`).length).toBe(0);
  });

  it('injects a stylesheet containing a mobile @media rule that hides the spy caption', async () => {
    const pid = 306;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'verified')], count: 1 } as unknown as KnownSpiesResponse);
    setJailRow(pid);

    await applyJailOverlay({ warId: null });

    const styleEl = document.getElementById(STYLE_ID);
    expect(styleEl).toBeTruthy();
    const css = (styleEl?.textContent || '').replace(/\s+/g, ' ');
    expect(css).toMatch(/@media\s*\(max-width:\s*599px\)/);
    expect(css).toMatch(/\.spy-caption\s*\{[^}]*display:\s*none/);
  });

  it('is idempotent — calling the overlay twice does not duplicate spy pills', async () => {
    const pid = 307;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'verified')], count: 1 } as unknown as KnownSpiesResponse);
    setJailRow(pid);

    await applyJailOverlay({ warId: null });
    await applyJailOverlay({ warId: null });

    expect(document.querySelectorAll(`.${SPY_PILL_CLASS}`).length).toBe(1);
  });
});
