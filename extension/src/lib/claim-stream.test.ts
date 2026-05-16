// Characterization tests for claim-stream (extracted from api.ts in Sprint 1).
//
// These lock the current snapshot/created/released/backoff/no-auth behaviour
// AND validate the new Page Visibility gating quick win.
// If you change behaviour, expect a test to fail — that's the point.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createClaimStream,
  CLAIM_POLL_MS,
  CLAIM_BACKOFF_MAX_MS,
  type ClaimStreamEvent,
} from './claim-stream';
import type { CompanionAuth, ClaimActiveResponse, ClaimRow } from '../types';

const AUTH: CompanionAuth = { token: 't', player_id: 1, player_name: 'X' };

const row = (id: number, extra: Partial<ClaimRow> = {}): ClaimRow =>
  ({
    target_id: id,
    target_name: `t${id}`,
    claimed_by: 1,
    claimed_by_name: 'me',
    expires_at: 1000,
    ...extra,
  }) as ClaimRow;

const setHidden = (hidden: boolean): void => {
  Object.defineProperty(document, 'visibilityState', {
    value: hidden ? 'hidden' : 'visible',
    configurable: true,
  });
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
};

const makeFetcher = (responses: Array<ClaimActiveResponse | Error>) => {
  const fn = vi.fn();
  responses.forEach((r) => {
    if (r instanceof Error) fn.mockRejectedValueOnce(r);
    else fn.mockResolvedValueOnce(r);
  });
  return fn;
};

describe('createClaimStream — locked behaviour', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('emits a snapshot on the first successful poll', async () => {
    const events: ClaimStreamEvent[] = [];
    const fetcher = makeFetcher([{ claims: [row(10), row(20)], cached_at: 0 }]);
    const stream = createClaimStream(() => AUTH, (e) => events.push(e), {
      fetcher,
      isAuthError: () => false,
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(events).toEqual([{ type: 'claim.snapshot', claims: [row(10), row(20)] }]);
    stream.stop();
  });

  it('emits created for new targets on subsequent polls', async () => {
    const events: ClaimStreamEvent[] = [];
    const fetcher = makeFetcher([
      { claims: [row(10)], cached_at: 0 },
      { claims: [row(10), row(20)], cached_at: 0 },
    ]);
    const stream = createClaimStream(() => AUTH, (e) => events.push(e), {
      fetcher,
      isAuthError: () => false,
    });
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(CLAIM_POLL_MS);
    expect(events).toEqual([
      { type: 'claim.snapshot', claims: [row(10)] },
      { type: 'claim.created', claim: row(20) },
    ]);
    stream.stop();
  });

  it('emits released for targets that disappeared', async () => {
    const events: ClaimStreamEvent[] = [];
    const fetcher = makeFetcher([
      { claims: [row(10), row(20)], cached_at: 0 },
      { claims: [row(20)], cached_at: 0 },
    ]);
    const stream = createClaimStream(() => AUTH, (e) => events.push(e), {
      fetcher,
      isAuthError: () => false,
    });
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(CLAIM_POLL_MS);
    const released = events.filter((e) => e.type === 'claim.released');
    expect(released).toHaveLength(1);
    expect(released[0].claim).toEqual(row(10));
    stream.stop();
  });

  it('doubles backoff on error up to CLAIM_BACKOFF_MAX_MS', async () => {
    const events: ClaimStreamEvent[] = [];
    const errs = Array.from({ length: 8 }, () => new Error('boom'));
    const fetcher = makeFetcher(errs);
    const stream = createClaimStream(() => AUTH, (e) => events.push(e), {
      fetcher,
      isAuthError: () => false,
    });
    // Walk a long virtual minute and verify the fetch was called but the
    // backoff capped — checking exact call count is the cleanest assertion.
    await vi.advanceTimersByTimeAsync(1); // tick 1
    await vi.advanceTimersByTimeAsync(CLAIM_POLL_MS); // 5s → tick 2
    await vi.advanceTimersByTimeAsync(2 * CLAIM_POLL_MS); // 10s → tick 3
    await vi.advanceTimersByTimeAsync(4 * CLAIM_POLL_MS); // 20s → tick 4
    await vi.advanceTimersByTimeAsync(8 * CLAIM_POLL_MS); // 40s → tick 5
    await vi.advanceTimersByTimeAsync(CLAIM_BACKOFF_MAX_MS); // 60s → tick 6
    await vi.advanceTimersByTimeAsync(CLAIM_BACKOFF_MAX_MS); // 60s → tick 7
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(6);
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(8);
    stream.stop();
  });

  it('keeps polling at base cadence when getAuthFn returns null', async () => {
    const fetcher = vi.fn();
    const stream = createClaimStream(() => null, () => {}, {
      fetcher,
      isAuthError: () => false,
    });
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(CLAIM_POLL_MS);
    await vi.advanceTimersByTimeAsync(CLAIM_POLL_MS);
    expect(fetcher).not.toHaveBeenCalled();
    stream.stop();
  });

  it('stop() cancels pending timer', async () => {
    const fetcher = makeFetcher([{ claims: [row(1)], cached_at: 0 }]);
    const stream = createClaimStream(() => AUTH, () => {}, {
      fetcher,
      isAuthError: () => false,
    });
    stream.stop();
    await vi.advanceTimersByTimeAsync(CLAIM_POLL_MS * 5);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('createClaimStream — Page Visibility gate (Sprint 1 quick win)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does NOT fetch while document is hidden', async () => {
    const fetcher = vi.fn().mockResolvedValue({ claims: [] });
    const stream = createClaimStream(() => AUTH, () => {}, {
      fetcher,
      isAuthError: () => false,
    });
    setHidden(true);
    await vi.advanceTimersByTimeAsync(CLAIM_POLL_MS * 3);
    expect(fetcher).not.toHaveBeenCalled();
    stream.stop();
  });

  it('resumes immediately on visibilitychange to visible', async () => {
    const fetcher = vi.fn().mockResolvedValue({ claims: [] });
    const stream = createClaimStream(() => AUTH, () => {}, {
      fetcher,
      isAuthError: () => false,
    });
    setHidden(true);
    await vi.advanceTimersByTimeAsync(CLAIM_POLL_MS * 2);
    expect(fetcher).not.toHaveBeenCalled();

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledOnce();
    stream.stop();
  });

  it('stop() removes the visibilitychange listener', async () => {
    const fetcher = vi.fn().mockResolvedValue({ claims: [] });
    const stream = createClaimStream(() => AUTH, () => {}, {
      fetcher,
      isAuthError: () => false,
    });
    stream.stop();
    // After stop, dispatching visibilitychange must not schedule anything.
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(CLAIM_POLL_MS);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
