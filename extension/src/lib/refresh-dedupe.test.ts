// Refresh-dedupe pure helper — see refresh-dedupe.ts for the why.
//
// refresh() in index.ts has four entry points (setInterval, watchUrlChanges,
// installAuthListener, tm-companion-refresh event). The MutationObserver in
// torn-pages.ts can fire its callback dozens of times per second on heavy
// pages like the faction roster. Without dedupe we end up doing redundant
// network fetches. This helper isolates the "should I skip this refresh
// invocation?" decision so it can be unit-tested without spinning up the
// full bootstrap.

import { describe, expect, it } from 'vitest';
import { shouldSkipRefresh } from './refresh-dedupe';

describe('shouldSkipRefresh', () => {
  const WINDOW_MS = 250;
  const HREF_A = 'https://www.torn.com/profiles.php?XID=1';
  const HREF_B = 'https://www.torn.com/profiles.php?XID=2';

  it('returns true when a refresh is already in flight', () => {
    // In-flight is the hard guard — even on a brand new href, we never
    // re-enter refresh() while one is mid-execution.
    const skip = shouldSkipRefresh(1000, HREF_A, HREF_B, 0, WINDOW_MS, true);
    expect(skip).toBe(true);
  });

  it('returns true when called with same href inside dedupe window', () => {
    // Mutation observer burst case: 5 mutations in 50ms, same URL.
    // Only the first one should run; the rest are noise.
    const skip = shouldSkipRefresh(1100, HREF_A, HREF_A, 1000, WINDOW_MS, false);
    expect(skip).toBe(true);
  });

  it('returns false when href has changed', () => {
    // Real SPA navigation — even if we just refreshed 10ms ago, the new
    // URL means new data is needed.
    const skip = shouldSkipRefresh(1010, HREF_B, HREF_A, 1000, WINDOW_MS, false);
    expect(skip).toBe(false);
  });

  it('returns false when same href but past the dedupe window', () => {
    // setInterval tick (every 30s) — same URL but well past 250ms,
    // so the periodic re-poll for fresh data must run.
    const skip = shouldSkipRefresh(1300, HREF_A, HREF_A, 1000, WINDOW_MS, false);
    expect(skip).toBe(false);
  });

  it('returns false on first refresh (no prior state)', () => {
    // Boot: lastHref is null, lastAt is 0. Never skip the first run.
    const skip = shouldSkipRefresh(1000, HREF_A, null, 0, WINDOW_MS, false);
    expect(skip).toBe(false);
  });

  it('returns false at exactly the window boundary', () => {
    // Edge: now - lastAt === WINDOW_MS means the window has elapsed.
    // Skip is strict-less-than, so this should NOT skip.
    const skip = shouldSkipRefresh(1250, HREF_A, HREF_A, 1000, WINDOW_MS, false);
    expect(skip).toBe(false);
  });

  it('returns true just before the window boundary', () => {
    // 1ms before the window closes — still inside, still skip.
    const skip = shouldSkipRefresh(1249, HREF_A, HREF_A, 1000, WINDOW_MS, false);
    expect(skip).toBe(true);
  });

  it('in-flight takes precedence over href + window logic', () => {
    // Even if href differs and window has elapsed, in-flight still wins —
    // serializes refresh() so we never overlap fetches.
    const skip = shouldSkipRefresh(9999, HREF_B, HREF_A, 1000, WINDOW_MS, true);
    expect(skip).toBe(true);
  });
});
