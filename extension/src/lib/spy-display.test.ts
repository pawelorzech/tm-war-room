/**
 * Unit tests for spy-display — pure formatting + classification for the
 * spy intel panel. Same module is duplicated into frontend/src/lib/ (the
 * format.ts precedent); the test in this file is canonical and covers the
 * shared contract.
 */
import { describe, it, expect } from 'vitest';
import {
  bucketStyle,
  formatTotalRange,
  formatPerStat,
  bucketCaption,
} from './spy-display';
import type { SpyEstimate } from './spy-display';

function makeSpy(partial: Partial<SpyEstimate>): SpyEstimate {
  return {
    player_id: 1,
    player_name: 'Test',
    strength: null,
    defense: null,
    speed: null,
    dexterity: null,
    total: 5_000_000_000,
    confidence: 'estimate',
    source: 'tornstats',
    reported_at: null,
    age_days: 5,
    bucket: 'estimate',
    total_range: [4_500_000_000, 5_500_000_000],
    range_width_pct: 10,
    heuristic_confidence: null,
    ...partial,
  };
}

describe('bucketStyle', () => {
  it('verified → green palette', () => {
    const s = bucketStyle('verified');
    expect(s.badgeText).toBe('VERIFIED SPY');
    expect(s.color).toBe('green');
  });
  it('estimate → yellow palette', () => {
    const s = bucketStyle('estimate');
    expect(s.badgeText).toBe('ESTIMATE');
    expect(s.color).toBe('yellow');
  });
  it('rough_guess → orange palette', () => {
    const s = bucketStyle('rough_guess');
    expect(s.badgeText).toBe('ROUGH GUESS');
    expect(s.color).toBe('orange');
  });
});

describe('formatTotalRange', () => {
  it('verified renders integer with commas', () => {
    const out = formatTotalRange(5_234_567_890, [5_234_567_890, 5_234_567_890], 'verified');
    expect(out).toBe('5,234,567,890');
  });

  it('estimate renders B-suffix range', () => {
    const out = formatTotalRange(5_000_000_000, [4_500_000_000, 5_500_000_000], 'estimate');
    expect(out).toBe('4.5B — 5.5B');
  });

  it('rough_guess renders wide B-suffix range', () => {
    const out = formatTotalRange(5_000_000_000, [500_000_000, 50_000_000_000], 'rough_guess');
    expect(out).toBe('500M — 50B');
  });

  it('rough_guess with total=0 renders "? — ?"', () => {
    const out = formatTotalRange(0, [0, 0], 'rough_guess');
    expect(out).toBe('? — ?');
  });

  it('missing total_range falls back to single total formatted', () => {
    const out = formatTotalRange(5_000_000_000, undefined, 'estimate');
    expect(out).toBe('5.00B');
  });
});

describe('formatPerStat', () => {
  it('returns null for rough_guess', () => {
    const spy = makeSpy({ bucket: 'rough_guess', strength: null });
    expect(formatPerStat(spy)).toBeNull();
  });

  it('returns null when any per-stat is null', () => {
    const spy = makeSpy({ bucket: 'estimate', strength: 1_000_000_000, defense: null });
    expect(formatPerStat(spy)).toBeNull();
  });

  it('renders formatted grid when all per-stat present', () => {
    const spy = makeSpy({
      bucket: 'verified',
      strength: 1_300_000_000,
      defense: 1_300_000_000,
      speed: 1_400_000_000,
      dexterity: 1_200_000_000,
    });
    const grid = formatPerStat(spy);
    expect(grid).not.toBeNull();
    expect(grid!.str).toBe('1.30B');
    expect(grid!.spd).toBe('1.40B');
  });

  it('prefixes ~ for estimate bucket', () => {
    const spy = makeSpy({
      bucket: 'estimate',
      strength: 1_100_000_000,
      defense: 1_100_000_000,
      speed: 1_200_000_000,
      dexterity: 1_100_000_000,
    });
    const grid = formatPerStat(spy);
    expect(grid!.str).toBe('~1.10B');
  });
});

describe('bucketCaption', () => {
  it('rough_guess explains heuristic inputs', () => {
    const spy = makeSpy({
      bucket: 'rough_guess',
      source: 'estimated',
      level: 100,
    });
    const caption = bucketCaption(spy);
    expect(caption).toMatch(/from public stats/i);
  });

  it('verified shows last-spied timing', () => {
    const spy = makeSpy({ bucket: 'verified', age_days: 3, source: 'tornstats' });
    const caption = bucketCaption(spy);
    expect(caption).toContain('3 days old');
    expect(caption).toContain('tornstats');
  });

  it('estimate shows age + source', () => {
    const spy = makeSpy({ bucket: 'estimate', age_days: 14, source: 'yata' });
    const caption = bucketCaption(spy);
    expect(caption).toContain('14 days old');
    expect(caption).toContain('yata');
  });
});
