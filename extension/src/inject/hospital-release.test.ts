// Tests for the pure hospital-release transition detector.
//
// detectReleased(prev, now, watched) returns the watched player ids that WERE
// hospitalized (in prev) and are NO LONGER (not in now). This is the signal
// the hospital overlay uses to toast a one-click attack link the moment a
// player the user cares about leaves the hospital.

import { describe, expect, it } from 'vitest';
import { detectReleased } from './hospital-release';

describe('detectReleased', () => {
  it('returns a watched player who was hospitalized in prev but is no longer', () => {
    const prev = new Set([100, 200]);
    const now = new Set([100]); // 200 left the hospital
    const watched = new Set([200]);
    expect(detectReleased(prev, now, watched)).toEqual([200]);
  });

  it('does NOT return a non-watched player who left', () => {
    const prev = new Set([100, 200]);
    const now = new Set([100]); // 200 left, but 200 is not watched
    const watched = new Set([300]);
    expect(detectReleased(prev, now, watched)).toEqual([]);
  });

  it('does NOT return a watched player who is still hospitalized', () => {
    const prev = new Set([200]);
    const now = new Set([200]); // still in hospital
    const watched = new Set([200]);
    expect(detectReleased(prev, now, watched)).toEqual([]);
  });

  it('returns empty when prev is empty', () => {
    const prev = new Set<number>();
    const now = new Set<number>();
    const watched = new Set([200]);
    expect(detectReleased(prev, now, watched)).toEqual([]);
  });

  it('does not mutate its inputs (pure)', () => {
    const prev = new Set([200]);
    const now = new Set<number>();
    const watched = new Set([200]);
    detectReleased(prev, now, watched);
    expect([...prev]).toEqual([200]);
    expect([...now]).toEqual([]);
    expect([...watched]).toEqual([200]);
  });
});
