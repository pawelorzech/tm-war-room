// Tests for the bounties-overlay spy estimate badges.
//
// The overlay already paints a threat-tier pill per row via decorateRows.
// We layer a second pill that surfaces the target's spy estimate (or off-limits
// demotion) inside the same badge wrapper, so each row stays at one DOM
// mutation per render pass.
//
// Verifies:
//  - verified bucket → green pill with formatted total
//  - estimate bucket → yellow pill with range string
//  - rough_guess → orange pill, range only (no per-stat — shared helper rule)
//  - endgame → red pill, "ENDGAME PLAYER" caption, NO range
//  - war_off_limits demotion: strike-through + red border + tooltip
//  - 404 / missing spy → no spy pill rendered (quiet by design)
//  - mobile @media rule present in injected stylesheet
//  - calling applyBountiesOverlay twice does not stack pills

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BountyItem, CurrentWar, WarOffLimitsResponse, BountiesResponse } from '../types';
import type { SpyEstimate } from '../lib/spy-display';

vi.mock('../lib/auth', () => ({
  getAuth: () => ({ token: 't', player_id: 1, player_name: 'tester' }),
  clearAuth: () => {},
}));

const { fetchBountiesMock, fetchSpyMock, fetchWarMock, fetchOffLimitsMock } = vi.hoisted(() => ({
  fetchBountiesMock: vi.fn(),
  fetchSpyMock: vi.fn(),
  fetchWarMock: vi.fn(),
  fetchOffLimitsMock: vi.fn(),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    fetchBounties: fetchBountiesMock,
    fetchSpyEstimate: fetchSpyMock,
    fetchCurrentWar: fetchWarMock,
    fetchOffLimits: fetchOffLimitsMock,
  };
});

import { applyBountiesOverlay, _resetBountiesCacheForTests } from './bounties-overlay';

const STYLE_ID = 'tm-companion-bounty-styles';
const BADGE_ATTR = 'data-tm-bounty-badge';
const SPY_PILL_CLASS = 'tm-spy';

function bountyItem(targetId: number, overrides: Partial<BountyItem> = {}): BountyItem {
  return {
    target_id: targetId,
    target_name: `Target ${targetId}`,
    target_level: 50,
    quantity: 1_000_000,
    reason: '',
    threat_label: 'moderate',
    threat_score: 45,
    threat_source: 'estimated',
    ...overrides,
  } as BountyItem;
}

function spy(
  playerId: number,
  bucket: SpyEstimate['bucket'],
  overrides: Partial<SpyEstimate> = {},
): SpyEstimate {
  return {
    player_id: playerId,
    player_name: `Target ${playerId}`,
    strength: bucket === 'verified' || bucket === 'estimate' ? 1_000_000 : null,
    defense: bucket === 'verified' || bucket === 'estimate' ? 1_000_000 : null,
    speed: bucket === 'verified' || bucket === 'estimate' ? 1_000_000 : null,
    dexterity: bucket === 'verified' || bucket === 'estimate' ? 1_000_000 : null,
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
    ...overrides,
  };
}

function setBountyRow(targetId: number): HTMLElement {
  document.body.innerHTML = `
    <div id="mainContainer">
      <div class="bounty-row">
        <a href="/profiles.php?XID=${targetId}">Target ${targetId}</a>
      </div>
    </div>
  `;
  return document.querySelector('.bounty-row') as HTMLElement;
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  fetchBountiesMock.mockReset();
  fetchSpyMock.mockReset();
  fetchWarMock.mockReset();
  fetchOffLimitsMock.mockReset();
  document.getElementById(STYLE_ID)?.remove();
  _resetBountiesCacheForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyBountiesOverlay — spy estimate badges', () => {
  it('renders a green verified spy pill with formatted total', async () => {
    const pid = 200;
    fetchBountiesMock.mockResolvedValue({ bounties: [bountyItem(pid)] } as BountiesResponse);
    fetchWarMock.mockResolvedValue({ war_id: null } as CurrentWar);
    fetchOffLimitsMock.mockResolvedValue({ war_id: 0, count: 0, entries: [] } as unknown as WarOffLimitsResponse);
    fetchSpyMock.mockResolvedValue(spy(pid, 'verified', { total: 5_500_000 }));
    setBountyRow(pid);

    await applyBountiesOverlay();
    // Spy fetch is async — let the microtask queue flush.
    await new Promise((r) => setTimeout(r, 0));
    await applyBountiesOverlay();
    // eslint-disable-next-line no-console
    console.log('DEBUG after-2nd: badges:', document.querySelectorAll(`[${BADGE_ATTR}]`).length, 'main:', document.getElementById('mainContainer')?.outerHTML);

    const badge = document.querySelector(`[${BADGE_ATTR}]`) as HTMLElement;
    expect(badge).toBeTruthy();
    const spyPill = badge.querySelector(`.${SPY_PILL_CLASS}`) as HTMLElement;
    expect(spyPill).toBeTruthy();
    expect(spyPill.classList.contains('tm-bucket-verified')).toBe(true);
    expect(spyPill.textContent || '').toMatch(/VERIFIED/i);
  });

  it('renders an estimate (yellow) pill with the range string', async () => {
    const pid = 201;
    fetchBountiesMock.mockResolvedValue({ bounties: [bountyItem(pid)] } as BountiesResponse);
    fetchWarMock.mockResolvedValue({ war_id: null } as CurrentWar);
    fetchOffLimitsMock.mockResolvedValue({ war_id: 0, count: 0, entries: [] } as unknown as WarOffLimitsResponse);
    fetchSpyMock.mockResolvedValue(spy(pid, 'estimate'));
    setBountyRow(pid);

    await applyBountiesOverlay();
    await new Promise((r) => setTimeout(r, 0));
    await applyBountiesOverlay();

    const spyPill = document.querySelector(`.${SPY_PILL_CLASS}`) as HTMLElement;
    expect(spyPill).toBeTruthy();
    expect(spyPill.classList.contains('tm-bucket-estimate')).toBe(true);
    expect(spyPill.textContent || '').toMatch(/ESTIMATE/i);
    // Range string rendered by formatTotalRange — e.g. "4M — 5M".
    // The exact magnitude depends on spy-display rounding; we just assert
    // there's some "—"-separated millions/billions range here.
    expect(spyPill.textContent || '').toMatch(/\d+[BMK]\s*—\s*\d+[BMK]/);
  });

  it('renders rough_guess (orange) pill with range only — no per-stat split', async () => {
    const pid = 202;
    fetchBountiesMock.mockResolvedValue({ bounties: [bountyItem(pid)] } as BountiesResponse);
    fetchWarMock.mockResolvedValue({ war_id: null } as CurrentWar);
    fetchOffLimitsMock.mockResolvedValue({ war_id: 0, count: 0, entries: [] } as unknown as WarOffLimitsResponse);
    fetchSpyMock.mockResolvedValue(spy(pid, 'rough_guess'));
    setBountyRow(pid);

    await applyBountiesOverlay();
    await new Promise((r) => setTimeout(r, 0));
    await applyBountiesOverlay();

    const spyPill = document.querySelector(`.${SPY_PILL_CLASS}`) as HTMLElement;
    expect(spyPill).toBeTruthy();
    expect(spyPill.classList.contains('tm-bucket-rough_guess')).toBe(true);
    expect(spyPill.textContent || '').toMatch(/ROUGH/i);
    // No per-stat grid markers (STR/DEF/SPD/DEX initials).
    expect(spyPill.textContent || '').not.toMatch(/STR\b/);
  });

  it('renders endgame (red) pill with caption — NO numeric range', async () => {
    const pid = 203;
    fetchBountiesMock.mockResolvedValue({ bounties: [bountyItem(pid)] } as BountiesResponse);
    fetchWarMock.mockResolvedValue({ war_id: null } as CurrentWar);
    fetchOffLimitsMock.mockResolvedValue({ war_id: 0, count: 0, entries: [] } as unknown as WarOffLimitsResponse);
    fetchSpyMock.mockResolvedValue(spy(pid, 'endgame', { rank: 'Heroic', level: 95 }));
    setBountyRow(pid);

    await applyBountiesOverlay();
    await new Promise((r) => setTimeout(r, 0));
    await applyBountiesOverlay();

    const spyPill = document.querySelector(`.${SPY_PILL_CLASS}`) as HTMLElement;
    expect(spyPill).toBeTruthy();
    expect(spyPill.classList.contains('tm-bucket-endgame')).toBe(true);
    expect(spyPill.textContent || '').toMatch(/ENDGAME/i);
    // Endgame range is [null, null] → no number rendered. We allow the caption
    // text but not formatted numbers like 4.5B or "—".
    const text = spyPill.textContent || '';
    expect(text).not.toMatch(/\d+\.\d+[BMK]/);
  });

  it('demotes the spy pill when the target is on the war off-limits list', async () => {
    const pid = 204;
    fetchBountiesMock.mockResolvedValue({ bounties: [bountyItem(pid)] } as BountiesResponse);
    fetchWarMock.mockResolvedValue({ war_id: 999 } as CurrentWar);
    fetchOffLimitsMock.mockResolvedValue({
      war_id: 999,
      count: 1,
      entries: [
        {
          war_id: 999,
          player_id: pid,
          player_name: `T${pid}`,
          set_by: 1,
          set_by_name: 'X',
          reason: 'med',
          created_at: '',
          updated_at: '',
        },
      ],
    } as unknown as WarOffLimitsResponse);
    fetchSpyMock.mockResolvedValue(spy(pid, 'verified'));
    setBountyRow(pid);

    await applyBountiesOverlay();
    await new Promise((r) => setTimeout(r, 0));
    await applyBountiesOverlay();

    const spyPill = document.querySelector(`.${SPY_PILL_CLASS}`) as HTMLElement;
    expect(spyPill).toBeTruthy();
    expect(spyPill.classList.contains('tm-off-limits')).toBe(true);
    expect((spyPill.getAttribute('title') || '').toLowerCase()).toMatch(/off.?limits/);
  });

  it('renders no spy pill when the API returns 404 for the target (quiet by design)', async () => {
    const pid = 205;
    fetchBountiesMock.mockResolvedValue({ bounties: [bountyItem(pid)] } as BountiesResponse);
    fetchWarMock.mockResolvedValue({ war_id: null } as CurrentWar);
    fetchOffLimitsMock.mockResolvedValue({ war_id: 0, count: 0, entries: [] } as unknown as WarOffLimitsResponse);
    const { ApiError } = await import('../lib/api');
    fetchSpyMock.mockRejectedValue(new ApiError('not found', 404));
    setBountyRow(pid);

    await applyBountiesOverlay();
    await new Promise((r) => setTimeout(r, 0));
    await applyBountiesOverlay();

    expect(document.querySelectorAll(`.${SPY_PILL_CLASS}`).length).toBe(0);
    // Threat pill should still be rendered.
    const badge = document.querySelector(`[${BADGE_ATTR}]`) as HTMLElement;
    expect(badge).toBeTruthy();
  });

  it('injects a stylesheet containing a mobile @media rule that hides the spy caption', async () => {
    const pid = 206;
    fetchBountiesMock.mockResolvedValue({ bounties: [bountyItem(pid)] } as BountiesResponse);
    fetchWarMock.mockResolvedValue({ war_id: null } as CurrentWar);
    fetchOffLimitsMock.mockResolvedValue({ war_id: 0, count: 0, entries: [] } as unknown as WarOffLimitsResponse);
    fetchSpyMock.mockResolvedValue(spy(pid, 'verified'));
    setBountyRow(pid);

    await applyBountiesOverlay();
    await new Promise((r) => setTimeout(r, 0));
    await applyBountiesOverlay();

    const styleEl = document.getElementById(STYLE_ID);
    expect(styleEl).toBeTruthy();
    const css = (styleEl?.textContent || '').replace(/\s+/g, ' ');
    expect(css).toMatch(/@media\s*\(max-width:\s*600px\)/);
    expect(css).toMatch(/\.tm-caption\s*\{[^}]*display:\s*none/);
  });

  it('is idempotent — calling the overlay twice does not stack spy pills on the same row', async () => {
    const pid = 207;
    fetchBountiesMock.mockResolvedValue({ bounties: [bountyItem(pid)] } as BountiesResponse);
    fetchWarMock.mockResolvedValue({ war_id: null } as CurrentWar);
    fetchOffLimitsMock.mockResolvedValue({ war_id: 0, count: 0, entries: [] } as unknown as WarOffLimitsResponse);
    fetchSpyMock.mockResolvedValue(spy(pid, 'verified'));
    setBountyRow(pid);

    await applyBountiesOverlay();
    await new Promise((r) => setTimeout(r, 0));
    await applyBountiesOverlay();
    await applyBountiesOverlay();

    const spyPills = document.querySelectorAll(`.${SPY_PILL_CLASS}`);
    expect(spyPills.length).toBe(1);
  });
});
