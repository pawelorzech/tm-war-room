// Characterization tests for `startPolling` — the visibility-aware polling
// helper. These lock the contract that every network poller in the Companion
// depends on after the Sprint 1.5 consolidation:
//
//   - cadence: fn() fires every intervalMs while the tab is visible
//   - hidden tab: ZERO fires across multiple cadence periods
//   - resume:  fires immediately on `visibilitychange` back to visible
//   - errors:  exponential backoff (intervalMs * 2^n) capped at 5 min
//   - stop():  cancels timers + removes the visibilitychange listener
//   - poke():  forces an immediate run on top of the schedule
//   - immediate=false: first scheduled fire is at intervalMs, not 0
//
// Why this file exists: `index.ts` used to call `setInterval(refresh, 30s)`
// directly, with no hidden-tab gate. We migrated that loop (and the feature-
// flag refresh) onto `startPolling`. Locking poll.ts's contract here is the
// safety net that lets the index.ts pollers keep their old cadence guarantee
// while gaining the hidden-tab pause for free.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startPolling } from './poll';

const setHidden = (hidden: boolean): void => {
  Object.defineProperty(document, 'visibilityState', {
    value: hidden ? 'hidden' : 'visible',
    configurable: true,
  });
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
};

describe('startPolling — cadence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs fn immediately when immediate=true (default)', async () => {
    const fn = vi.fn();
    const h = startPolling({ name: 'test', intervalMs: 30_000, fn });
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
    h.stop();
  });

  it('defers first run by intervalMs when immediate=false', async () => {
    const fn = vi.fn();
    const h = startPolling({ name: 'test', intervalMs: 30_000, fn, immediate: false });
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fn).toHaveBeenCalledTimes(1);
    h.stop();
  });

  it('fires fn every intervalMs while the tab stays visible', async () => {
    const fn = vi.fn();
    const h = startPolling({ name: 'test', intervalMs: 30_000, fn });
    await vi.advanceTimersByTimeAsync(1); // immediate
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fn).toHaveBeenCalledTimes(4);
    h.stop();
  });

  it('awaits async fn before scheduling the next tick (no overlap)', async () => {
    const pending: Array<() => void> = [];
    const fn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          pending.push(resolve);
        }),
    );
    const h = startPolling({ name: 'test', intervalMs: 30_000, fn });
    await vi.advanceTimersByTimeAsync(1); // immediate tick fires, but it's pending
    expect(fn).toHaveBeenCalledTimes(1);

    // Advance past the cadence — second tick must NOT fire while first pending.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fn).toHaveBeenCalledTimes(1);

    // Resolve the in-flight call, then advance one cadence: second tick fires.
    pending[0]();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fn).toHaveBeenCalledTimes(2);
    h.stop();
  });
});

describe('startPolling — Page Visibility (hidden tab gate)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does NOT call fn across 3 cadence periods while hidden', async () => {
    const fn = vi.fn();
    setHidden(true);
    const h = startPolling({ name: 'test', intervalMs: 30_000, fn });
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fn).not.toHaveBeenCalled();
    h.stop();
  });

  it('fires immediately when visibilitychange flips to visible', async () => {
    const fn = vi.fn();
    setHidden(true);
    const h = startPolling({ name: 'test', intervalMs: 30_000, fn });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fn).not.toHaveBeenCalled();

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
    h.stop();
  });

  it('drops pending timer when tab goes hidden mid-cycle', async () => {
    const fn = vi.fn();
    const h = startPolling({ name: 'test', intervalMs: 30_000, fn });
    await vi.advanceTimersByTimeAsync(1); // immediate call → 1
    expect(fn).toHaveBeenCalledTimes(1);

    // Halfway through the next cycle, tab goes hidden.
    await vi.advanceTimersByTimeAsync(15_000);
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));

    // Advance well past when the second tick would have fired; must NOT fire.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fn).toHaveBeenCalledTimes(1);
    h.stop();
  });
});

describe('startPolling — exponential backoff on error', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
    // Suppress console.warn noise from the scheduler's failure path.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('doubles delay after each consecutive error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const h = startPolling({ name: 'test', intervalMs: 10_000, fn });

    // Tick 1: immediate. After failure, next scheduled at 10s * 2^1 = 20s.
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);

    // Advancing 19s should NOT reach tick 2.
    await vi.advanceTimersByTimeAsync(19_000);
    expect(fn).toHaveBeenCalledTimes(1);

    // One more ms crosses the 20s boundary → tick 2.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fn).toHaveBeenCalledTimes(2);

    // After tick 2 failure: next delay 10s * 2^2 = 40s.
    await vi.advanceTimersByTimeAsync(39_000);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fn).toHaveBeenCalledTimes(3);

    h.stop();
  });

  it('resets backoff to intervalMs on the first success after errors', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const h = startPolling({ name: 'test', intervalMs: 10_000, fn });

    await vi.advanceTimersByTimeAsync(1); // tick 1 — fails → next at 20s
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20_000); // tick 2 — success → reset
    expect(fn).toHaveBeenCalledTimes(2);

    // After reset, cadence is back to base intervalMs (10s).
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fn).toHaveBeenCalledTimes(3);

    h.stop();
  });

  it('caps backoff at 5 minutes (MAX_BACKOFF_MS)', async () => {
    // With intervalMs = 60s, 2^n explodes fast. Verify we never wait > 5 min.
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const h = startPolling({ name: 'test', intervalMs: 60_000, fn });

    await vi.advanceTimersByTimeAsync(1); // tick 1
    expect(fn).toHaveBeenCalledTimes(1);

    // After 10 consecutive errors, the un-capped delay would be 60s * 2^10
    // ≈ 17 hours. Capped at 5 min, so over 30 min we expect ≥ 6 ticks.
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    }
    // Conservative lower bound: at minimum we should see 6+ ticks once capped.
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(6);

    h.stop();
  });
});

describe('startPolling — handle controls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stop() cancels all future ticks', async () => {
    const fn = vi.fn();
    const h = startPolling({ name: 'test', intervalMs: 30_000, fn });
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
    h.stop();
    await vi.advanceTimersByTimeAsync(30_000 * 5);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stop() removes the visibilitychange listener', async () => {
    const fn = vi.fn();
    const h = startPolling({ name: 'test', intervalMs: 30_000, fn });
    await vi.advanceTimersByTimeAsync(1);
    h.stop();

    // After stop(), flipping visibility must not re-schedule a tick.
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('poke() forces an immediate run on top of the schedule', async () => {
    const fn = vi.fn();
    const h = startPolling({ name: 'test', intervalMs: 30_000, fn, immediate: false });
    // No immediate run.
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).not.toHaveBeenCalled();

    h.poke();
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
    h.stop();
  });
});
