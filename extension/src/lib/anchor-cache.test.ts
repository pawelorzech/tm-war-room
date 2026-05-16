// Sprint 1.5 quick win #11 — cache findFirstAnchor results so repeated
// renders on the same page kind don't re-walk the selector list 3-4 times.
//
// Self-invalidating: if the cached element has been detached from the
// document (which happens on SPA navigation), the next lookup retries.
// No explicit invalidate-on-URL-change wiring needed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findFirstAnchor, _resetAnchorCache } from './anchor-cache';

const SELECTORS = ['#a', '#b', '#c'] as const;

describe('findFirstAnchor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    _resetAnchorCache();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the first matching element', () => {
    document.body.innerHTML = '<div id="b">two</div><div id="c">three</div>';
    const el = findFirstAnchor(SELECTORS, 'profile');
    expect(el?.id).toBe('b');
  });

  it('returns null when no selector matches', () => {
    expect(findFirstAnchor(SELECTORS, 'profile')).toBeNull();
  });

  it('caches the result — second call skips querySelector', () => {
    document.body.innerHTML = '<div id="a"></div>';
    const spy = vi.spyOn(document, 'querySelector');
    findFirstAnchor(SELECTORS, 'profile'); // miss → 1 call
    findFirstAnchor(SELECTORS, 'profile'); // hit → 0 calls
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('re-resolves when the cached element is detached from the document', () => {
    document.body.innerHTML = '<div id="a"></div>';
    const first = findFirstAnchor(SELECTORS, 'profile');
    expect(first?.id).toBe('a');
    // Simulate SPA navigation removing the old node and inserting a fresh one.
    document.body.innerHTML = '<div id="b"></div>';
    const second = findFirstAnchor(SELECTORS, 'profile');
    expect(second?.id).toBe('b');
  });

  it('keeps independent caches per cacheKey', () => {
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    const profile = findFirstAnchor(['#a'], 'profile');
    const stocks = findFirstAnchor(['#b'], 'stocks');
    expect(profile?.id).toBe('a');
    expect(stocks?.id).toBe('b');
  });
});
