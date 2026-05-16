// Integration test for the dietetic RUM wiring. happy-dom doesn't ship
// PerformanceObserver for longtask, so we verify the beacon shape and
// pagehide handoff — the longtask path is exercised via direct collector
// invocation in rum.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startRumWire } from './rum-wire';

describe('startRumWire — pagehide beacon', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits a beacon when pagehide fires', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    let t = 1000;
    startRumWire({ now: () => t, sendBeacon });
    t = 1150; // 150ms after boot

    window.dispatchEvent(new Event('pagehide'));

    expect(sendBeacon).toHaveBeenCalledOnce();
    const [url, blob] = sendBeacon.mock.calls[0];
    expect(url).toMatch(/\/api\/companion\/rum$/);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('beacon payload contains only documented fields (no PII)', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    let t = 0;
    startRumWire({ now: () => t, sendBeacon });
    t = 120;
    window.dispatchEvent(new Event('pagehide'));

    const blob = sendBeacon.mock.calls[0][1] as Blob;
    const payload = JSON.parse(await blob.text());

    expect(Object.keys(payload).sort()).toEqual(
      [
        'v',
        'page_kind',
        'tti_ms',
        'tbt_ms',
        'fcp_ms',
        'longtask_count',
        'polls_per_min_visible',
        'polls_per_min_hidden',
        'errors',
        'ts',
      ].sort(),
    );
    // Sanity: TTI reflects the now-delta we provided.
    expect(payload.tti_ms).toBe(120);
  });

  it('collector counts errors from global event listeners', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    const { collector, flush } = startRumWire({ now: () => 0, sendBeacon });

    window.dispatchEvent(new Event('error'));
    window.dispatchEvent(new Event('unhandledrejection'));
    expect(collector.snapshotErrors()).toBe(2);
    flush(); // doesn't throw — counters reset already
  });

  it('flush() is idempotent (multiple pagehide → multiple beacons)', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    startRumWire({ now: () => 0, sendBeacon });
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pagehide'));
    expect(sendBeacon).toHaveBeenCalledTimes(2);
  });
});
