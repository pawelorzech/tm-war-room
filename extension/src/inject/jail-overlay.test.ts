// Tests for the jail-overlay redesign. Mirrors hospital-overlay.test.ts —
// stripe carries the role, compact spy chip carries the bucket + total range,
// no loud role pills, no full-row tinted background.

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
const SPY_CHIP_CLASS = 'spy-chip';

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

describe('applyJailOverlay — spy chip', () => {
  it('renders a verified spy chip on the jail row', async () => {
    const pid = 300;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'verified')], count: 1 } as unknown as KnownSpiesResponse);
    setJailRow(pid);

    await applyJailOverlay({ warId: null });

    const chip = document.querySelector(`.${SPY_CHIP_CLASS}`) as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.classList.contains('tm-bucket-verified')).toBe(true);
    expect(chip.textContent || '').toMatch(/verified/i);
    expect((chip.getAttribute('title') || '')).toMatch(/Verified spy/);
  });

  it('renders an estimate chip with a range string', async () => {
    const pid = 301;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'estimate')], count: 1 } as unknown as KnownSpiesResponse);
    setJailRow(pid);

    await applyJailOverlay({ warId: null });

    const chip = document.querySelector(`.${SPY_CHIP_CLASS}`) as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.classList.contains('tm-bucket-estimate')).toBe(true);
    expect(chip.textContent || '').toMatch(/\d+[BMK]\s*—\s*\d+[BMK]/);
    expect(chip.textContent || '').toMatch(/est\./);
  });

  it('renders rough_guess chip with range only, no per-stat split', async () => {
    const pid = 302;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'rough_guess')], count: 1 } as unknown as KnownSpiesResponse);
    setJailRow(pid);

    await applyJailOverlay({ warId: null });

    const chip = document.querySelector(`.${SPY_CHIP_CLASS}`) as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.classList.contains('tm-bucket-rough_guess')).toBe(true);
    expect(chip.textContent || '').not.toMatch(/STR\b/);
  });

  it('renders endgame chip without any numeric range', async () => {
    const pid = 303;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'endgame', { rank: 'Heroic', level: 95 })], count: 1 } as unknown as KnownSpiesResponse);
    setJailRow(pid);

    await applyJailOverlay({ warId: null });

    const chip = document.querySelector(`.${SPY_CHIP_CLASS}`) as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.classList.contains('tm-bucket-endgame')).toBe(true);
    expect(chip.textContent || '').not.toMatch(/\d+\.\d+[BMK]/);
  });

  it('demotes the spy chip when the row is in the war off-limits map', async () => {
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

    const chip = document.querySelector(`.${SPY_CHIP_CLASS}`) as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.classList.contains('tm-off-limits')).toBe(true);
    expect((chip.getAttribute('title') || '')).toMatch(/OFF-LIMITS/);
  });

  it('renders nothing extra when the player is not in any TM data set (quiet by design)', async () => {
    const pid = 305;
    setJailRow(pid);

    await applyJailOverlay({ warId: null });

    expect(document.querySelectorAll(`[${BADGE_ATTR}]`).length).toBe(0);
  });

  it('is idempotent — calling the overlay twice does not duplicate spy chips', async () => {
    const pid = 307;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'verified')], count: 1 } as unknown as KnownSpiesResponse);
    setJailRow(pid);

    await applyJailOverlay({ warId: null });
    await applyJailOverlay({ warId: null });

    expect(document.querySelectorAll(`.${SPY_CHIP_CLASS}`).length).toBe(1);
  });
});

describe('applyJailOverlay — role stripe & scoping', () => {
  it('paints a green inset stripe for a TM mate', async () => {
    const pid = 400;
    fetchKeysMock.mockResolvedValue({ keys: [{ player_id: pid, player_name: `P${pid}` }] } as unknown as KeysResponse);
    setJailRow(pid);

    await applyJailOverlay({ warId: null });

    const row = document.querySelector('li') as HTMLElement;
    expect(row.style.boxShadow).toMatch(/inset 4px 0 0/);
    expect(row.style.boxShadow.toLowerCase()).toContain('#3fb950');
    expect(row.style.backgroundColor).toBe('');
  });

  it('paints a red inset stripe for a war enemy', async () => {
    const pid = 401;
    fetchEnemyMock.mockResolvedValue({ members: [{ id: pid, name: `P${pid}` }] } as unknown as EnemyResponse);
    setJailRow(pid);

    await applyJailOverlay({ warId: null });

    const row = document.querySelector('li') as HTMLElement;
    expect(row.style.boxShadow.toLowerCase()).toContain('#f85149');
  });

  it('does NOT decorate an XID anchor outside any list row (Information sidebar leak fix)', async () => {
    const pid = 500;
    fetchKeysMock.mockResolvedValue({ keys: [{ player_id: pid, player_name: `P${pid}` }] } as unknown as KeysResponse);
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'verified')], count: 1 } as unknown as KnownSpiesResponse);
    document.body.innerHTML = `
      <div id="mainContainer">
        <div class="info-cont">
          <div class="user-info-cont">
            <a href="/profiles.php?XID=${pid}">P${pid}</a>
          </div>
        </div>
        <ul class="jail-list">
          <li><a href="/profiles.php?XID=${pid}">P${pid}</a></li>
        </ul>
      </div>
    `;

    await applyJailOverlay({ warId: null });

    expect(document.querySelectorAll(`[${BADGE_ATTR}]`).length).toBe(1);
    expect(document.querySelectorAll(`.${SPY_CHIP_CLASS}`).length).toBe(1);
    const sidebarAnchor = document.querySelector('.info-cont a') as HTMLElement;
    expect(sidebarAnchor.nextElementSibling).toBeNull();
  });

  it('still injects a stylesheet with the jail chip rules', async () => {
    const pid = 501;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'verified')], count: 1 } as unknown as KnownSpiesResponse);
    setJailRow(pid);

    await applyJailOverlay({ warId: null });

    const styleEl = document.getElementById(STYLE_ID);
    expect(styleEl).toBeTruthy();
    expect((styleEl?.textContent || '')).toMatch(/spy-chip/);
    expect((styleEl?.textContent || '')).toMatch(/tm-bucket-verified/);
  });
});
