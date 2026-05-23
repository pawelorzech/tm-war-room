// Tests for the hospital-overlay redesign.
//
// Visual contract: each decorated row gets a 4px role stripe (inset boxShadow)
// in mate > off-limits > enemy > target priority, plus a compact spy chip
// appended after the player name link when a spy estimate is available. No
// loud role pills, no full-row tinted background — the stripe carries the role
// and the chip carries the spy bucket + short total range.

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

import { applyHospitalOverlay, _resetHospitalCacheForTests } from './hospital-overlay';

const STYLE_ID = 'tm-companion-hospital-styles';
const BADGE_ATTR = 'data-tm-hospital-badge';
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

function setHospitalRow(pid: number): void {
  document.body.innerHTML = `
    <div id="mainContainer">
      <ul class="hospital-list">
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
  _resetHospitalCacheForTests();
  mockBase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyHospitalOverlay — spy chip', () => {
  it('renders a verified spy chip on the hospital row', async () => {
    const pid = 300;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'verified')], count: 1 } as unknown as KnownSpiesResponse);
    setHospitalRow(pid);

    await applyHospitalOverlay({ warId: null });

    const chip = document.querySelector(`.${SPY_CHIP_CLASS}`) as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.classList.contains('tm-bucket-verified')).toBe(true);
    expect(chip.textContent || '').toMatch(/verified/i);
    // Compact format — no raw 10-digit total in the chip itself; it lives in
    // the title tooltip instead.
    expect(chip.textContent || '').not.toMatch(/4,000,000/);
    expect((chip.getAttribute('title') || '')).toMatch(/Verified spy/);
  });

  it('renders an estimate chip with a range string', async () => {
    const pid = 301;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'estimate')], count: 1 } as unknown as KnownSpiesResponse);
    setHospitalRow(pid);

    await applyHospitalOverlay({ warId: null });

    const chip = document.querySelector(`.${SPY_CHIP_CLASS}`) as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.classList.contains('tm-bucket-estimate')).toBe(true);
    expect(chip.textContent || '').toMatch(/\d+[BMK]\s*—\s*\d+[BMK]/);
    expect(chip.textContent || '').toMatch(/est\./);
  });

  it('renders rough_guess chip with range only, no per-stat split', async () => {
    const pid = 302;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'rough_guess')], count: 1 } as unknown as KnownSpiesResponse);
    setHospitalRow(pid);

    await applyHospitalOverlay({ warId: null });

    const chip = document.querySelector(`.${SPY_CHIP_CLASS}`) as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.classList.contains('tm-bucket-rough_guess')).toBe(true);
    expect(chip.textContent || '').not.toMatch(/STR\b/);
  });

  it('renders endgame chip without any numeric range', async () => {
    const pid = 303;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'endgame', { rank: 'Heroic', level: 95 })], count: 1 } as unknown as KnownSpiesResponse);
    setHospitalRow(pid);

    await applyHospitalOverlay({ warId: null });

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
    setHospitalRow(pid);

    await applyHospitalOverlay({ warId: 999 });

    const chip = document.querySelector(`.${SPY_CHIP_CLASS}`) as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.classList.contains('tm-off-limits')).toBe(true);
    expect((chip.getAttribute('title') || '')).toMatch(/OFF-LIMITS/);
  });

  it('renders nothing extra when the player is not in any TM data set (quiet by design)', async () => {
    const pid = 305;
    setHospitalRow(pid);

    await applyHospitalOverlay({ warId: null });

    expect(document.querySelectorAll(`[${BADGE_ATTR}]`).length).toBe(0);
  });

  it('is idempotent — calling the overlay twice does not duplicate spy chips', async () => {
    const pid = 307;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'verified')], count: 1 } as unknown as KnownSpiesResponse);
    setHospitalRow(pid);

    await applyHospitalOverlay({ warId: null });
    await applyHospitalOverlay({ warId: null });

    expect(document.querySelectorAll(`.${SPY_CHIP_CLASS}`).length).toBe(1);
  });
});

describe('applyHospitalOverlay — role stripe', () => {
  function setHospitalRowFor(pid: number): HTMLElement {
    setHospitalRow(pid);
    return document.querySelector('li') as HTMLElement;
  }

  it('paints a green inset stripe for a TM mate', async () => {
    const pid = 400;
    fetchKeysMock.mockResolvedValue({ keys: [{ player_id: pid, player_name: `P${pid}` }] } as unknown as KeysResponse);
    const row = setHospitalRowFor(pid);

    await applyHospitalOverlay({ warId: null });

    expect(row.style.boxShadow).toMatch(/inset 4px 0 0/);
    expect(row.style.boxShadow.toLowerCase()).toContain('#3fb950');
    // Background tint is gone — the stripe carries the role.
    expect(row.style.backgroundColor).toBe('');
  });

  it('paints a red inset stripe for a war enemy', async () => {
    const pid = 401;
    fetchEnemyMock.mockResolvedValue({ members: [{ id: pid, name: `P${pid}` }] } as unknown as EnemyResponse);
    const row = setHospitalRowFor(pid);

    await applyHospitalOverlay({ warId: null });

    expect(row.style.boxShadow.toLowerCase()).toContain('#f85149');
    expect(row.style.backgroundColor).toBe('');
  });

  it('paints a purple inset stripe for a saved target', async () => {
    const pid = 402;
    fetchTargetsMock.mockResolvedValue({
      targets: [{ player_id: pid, player_name: `P${pid}`, tag: 'lazy', created_at: '', updated_at: '' }],
      count: 1,
    } as unknown as TargetsResponse);
    const row = setHospitalRowFor(pid);

    await applyHospitalOverlay({ warId: null });

    expect(row.style.boxShadow.toLowerCase()).toContain('#a78bfa');
  });

  it('renders no role pills next to the player name (stripe replaces them)', async () => {
    const pid = 403;
    fetchKeysMock.mockResolvedValue({ keys: [{ player_id: pid, player_name: `P${pid}` }] } as unknown as KeysResponse);
    setHospitalRow(pid);

    await applyHospitalOverlay({ warId: null });

    // The legacy "TM mate" / "war enemy" / "🚫 OFF-LIMITS" / "🎯 target" pills
    // are gone — the row stripe carries the role.
    expect(document.body.textContent || '').not.toMatch(/TM mate/);
    expect(document.querySelectorAll('.pill-mate').length).toBe(0);
    expect(document.querySelectorAll('.pill-enemy').length).toBe(0);
    expect(document.querySelectorAll('.pill-offlimits').length).toBe(0);
    expect(document.querySelectorAll('.pill-target').length).toBe(0);
  });
});

describe('applyHospitalOverlay — scoping (no leak into Information sidebar)', () => {
  it('does NOT decorate an XID anchor that lives outside any list row', async () => {
    const pid = 500;
    // Mock the player as a TM mate so the data map has them. The anchor below
    // is the one Torn renders inside the left-side "Information" panel on
    // hospitalview.php — a <div>, not an <li>/<tr>, not class-matched. The
    // companion must skip it so the user's own name plate stays clean.
    fetchKeysMock.mockResolvedValue({ keys: [{ player_id: pid, player_name: `P${pid}` }] } as unknown as KeysResponse);
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'verified')], count: 1 } as unknown as KnownSpiesResponse);
    document.body.innerHTML = `
      <div id="mainContainer">
        <div class="info-cont">
          <div class="user-info-cont">
            <a href="/profiles.php?XID=${pid}">P${pid}</a>
          </div>
        </div>
        <ul class="hospital-list">
          <li><a href="/profiles.php?XID=${pid}">P${pid}</a></li>
        </ul>
      </div>
    `;

    await applyHospitalOverlay({ warId: null });

    // Exactly one decoration site — the hospital list row.
    expect(document.querySelectorAll(`[${BADGE_ATTR}]`).length).toBe(1);
    expect(document.querySelectorAll(`.${SPY_CHIP_CLASS}`).length).toBe(1);
    // The Information sidebar anchor is untouched (nothing inserted after it).
    const sidebarAnchor = document.querySelector('.info-cont a') as HTMLElement;
    expect(sidebarAnchor.nextElementSibling).toBeNull();
    // Stripe is on the LI, not the sidebar div.
    const sidebarDiv = document.querySelector('.user-info-cont') as HTMLElement;
    expect(sidebarDiv.style.boxShadow).toBe('');
    const row = document.querySelector('li') as HTMLElement;
    expect(row.style.boxShadow).toMatch(/inset 4px 0 0/);
  });

  // Reference to STYLE_ID (otherwise unused after dropping the @media test).
  it('still injects a stylesheet with the hospital chip rules', async () => {
    const pid = 501;
    fetchKnownSpiesMock.mockResolvedValue({ estimates: [spy(pid, 'verified')], count: 1 } as unknown as KnownSpiesResponse);
    setHospitalRow(pid);

    await applyHospitalOverlay({ warId: null });

    const styleEl = document.getElementById(STYLE_ID);
    expect(styleEl).toBeTruthy();
    expect((styleEl?.textContent || '')).toMatch(/spy-chip/);
    expect((styleEl?.textContent || '')).toMatch(/tm-bucket-verified/);
  });
});
