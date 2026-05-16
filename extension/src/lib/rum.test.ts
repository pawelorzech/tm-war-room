// Sprint 0 — Companion RUM beacon tests (red-first, then green).
//
// Spec: extension/docs/rum-privacy-review.md.
// The beacon collects anonymous perf signals and POSTs to /api/companion/rum
// at most once per minute per tab (or on pagehide). Zero PII.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBeaconPayload, RumCollector } from './rum';

describe('buildBeaconPayload — zero PII, schema-compliant', () => {
  it('produces only the documented fields', () => {
    const payload = buildBeaconPayload({
      version: '0.27.2',
      pageKind: 'profile',
      ttiMs: 142,
      tbtMs: 28,
      fcpMs: 305,
      longtaskCount: 1,
      pollsPerMinVisible: 4,
      pollsPerMinHidden: 0,
      errors: 0,
      ts: '2026-05-17T10:00:00.000Z',
    });
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
  });

  it('never includes player_id, full url, ua, ip, referrer, or message even if passed in source', () => {
    // The function signature should make this structurally impossible — but
    // the contract is important enough to assert explicitly. If you ever
    // add a field to BeaconSource, this test forces you to update the
    // privacy review document at the same time.
    const payload = buildBeaconPayload({
      version: '0.27.2',
      pageKind: 'attack',
      ttiMs: 100,
      tbtMs: 10,
      fcpMs: null,
      longtaskCount: 0,
      pollsPerMinVisible: 0,
      pollsPerMinHidden: 0,
      errors: 0,
      ts: '2026-05-17T10:00:00.000Z',
    });
    const forbidden = [
      'player_id', 'faction_id', 'url', 'pathname', 'search',
      'user_agent', 'ua', 'ip', 'referrer', 'message', 'stack',
      'api_key', 'token', 'authorization', 'cookie',
    ];
    for (const k of forbidden) {
      expect(payload as unknown as Record<string, unknown>).not.toHaveProperty(k);
    }
  });

  it('rounds float ms values to integers (backend schema requires int)', () => {
    const payload = buildBeaconPayload({
      version: '0.27.2',
      pageKind: 'profile',
      ttiMs: 142.7,
      tbtMs: 28.3,
      fcpMs: 305.5,
      longtaskCount: 1,
      pollsPerMinVisible: 4,
      pollsPerMinHidden: 0,
      errors: 0,
      ts: '2026-05-17T10:00:00.000Z',
    });
    expect(payload.tti_ms).toBe(143);
    expect(payload.tbt_ms).toBe(28);
    expect(payload.fcp_ms).toBe(306);
  });

  it('preserves fcp_ms=null (Firefox/Safari fallback case)', () => {
    const payload = buildBeaconPayload({
      version: '0.27.2',
      pageKind: 'profile',
      ttiMs: 100,
      tbtMs: 10,
      fcpMs: null,
      longtaskCount: 0,
      pollsPerMinVisible: 0,
      pollsPerMinHidden: 0,
      errors: 0,
      ts: '2026-05-17T10:00:00.000Z',
    });
    expect(payload.fcp_ms).toBeNull();
  });

  it('clamps absurd values to backend ceiling so we degrade instead of 422', () => {
    const payload = buildBeaconPayload({
      version: '0.27.2',
      pageKind: 'profile',
      ttiMs: 99_999_999, // clock skew or runaway timer
      tbtMs: 99_999_999,
      fcpMs: 99_999_999,
      longtaskCount: 99_999,
      pollsPerMinVisible: 99_999,
      pollsPerMinHidden: 99_999,
      errors: 99_999,
      ts: '2026-05-17T10:00:00.000Z',
    });
    expect(payload.tti_ms).toBeLessThanOrEqual(60_000);
    expect(payload.tbt_ms).toBeLessThanOrEqual(60_000);
    expect(payload.fcp_ms).toBeLessThanOrEqual(60_000);
    expect(payload.longtask_count).toBeLessThanOrEqual(1000);
    expect(payload.errors).toBeLessThanOrEqual(1000);
  });
});

describe('RumCollector — counters and lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('counts polls separately for visible vs hidden tabs', () => {
    const c = new RumCollector();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    c.recordPoll();
    c.recordPoll();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    c.recordPoll();
    c.recordPoll();
    c.recordPoll();
    const snap = c.snapshotPolls();
    expect(snap.visible).toBe(2);
    expect(snap.hidden).toBe(3);
  });

  it('snapshotPolls resets counters to zero (rolling window)', () => {
    const c = new RumCollector();
    c.recordPoll();
    c.snapshotPolls();
    const after = c.snapshotPolls();
    expect(after.visible).toBe(0);
    expect(after.hidden).toBe(0);
  });

  it('recordLongTask increments count and accumulates blocking time', () => {
    const c = new RumCollector();
    c.recordLongTask(60); // (60-50)=10 ms blocking
    c.recordLongTask(120); // (120-50)=70 ms blocking
    c.recordLongTask(40); // below threshold, ignored — observer fires for >50ms but defensive
    const snap = c.snapshotLongTasks();
    // Two long tasks counted; 80ms blocking time.
    expect(snap.count).toBe(2);
    expect(snap.blockingMs).toBe(80);
  });

  it('snapshotLongTasks resets accumulators', () => {
    const c = new RumCollector();
    c.recordLongTask(100);
    c.snapshotLongTasks();
    const after = c.snapshotLongTasks();
    expect(after.count).toBe(0);
    expect(after.blockingMs).toBe(0);
  });

  it('recordError counts unhandled errors but never stores message or stack', () => {
    const c = new RumCollector();
    c.recordError();
    c.recordError();
    expect(c.snapshotErrors()).toBe(2);
    // No stack/message getter exists — that's the API contract.
    expect((c as unknown as { _lastErrorStack?: string })._lastErrorStack).toBeUndefined();
  });
});
