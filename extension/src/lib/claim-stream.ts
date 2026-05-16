// Live stream of TM Hub faction claim events. Extracted from lib/api.ts in
// Sprint 1 of the Companion perf plan so the polling + visibility behaviour
// can be unit-tested independently from the fetch wrapper.
//
// Behaviour contract (locked by claim-stream.test.ts):
//
// 1. First successful poll → emits `claim.snapshot` with the full list.
// 2. Subsequent polls → diff against the previous snapshot:
//      - new target_id  → `claim.created`
//      - missing target → `claim.released`
//    (We can't distinguish released/expired from /active alone; consumers
//    treat both as a cleanup so the choice is fine.)
// 3. On error → exponential backoff doubles the next delay, capped at 60 s.
//    On the next success the delay resets to the 5 s base.
// 4. With no auth → keep polling at the base 5 s cadence; the bus consumers
//    self-skip on null auth so we don't burn unauth requests.
// 5. Page Visibility (Sprint 1 quick win): while ``document.hidden`` we
//    skip the fetch entirely. We still reschedule so when the tab returns
//    to visible we can resume on the same tick. A ``visibilitychange``
//    listener also pokes an immediate run so the user sees fresh state
//    the moment they refocus the tab.

import type { CompanionAuth, ClaimRow, ClaimActiveResponse } from '../types';

export interface ClaimStreamEvent {
  type: 'claim.snapshot' | 'claim.created' | 'claim.released' | 'claim.hit' | 'claim.expired';
  claim?: ClaimRow;
  claims?: ClaimRow[];
}

export const CLAIM_POLL_MS = 5_000;
export const CLAIM_BACKOFF_MAX_MS = 60_000;

export interface StreamClaimsDeps {
  fetcher: (auth: CompanionAuth) => Promise<ClaimActiveResponse>;
  isAuthError: (err: unknown) => boolean;
}

export interface StreamClaimsHandle {
  stop: () => void;
}

export function createClaimStream(
  getAuthFn: () => CompanionAuth | null,
  onEvent: (e: ClaimStreamEvent) => void,
  deps: StreamClaimsDeps,
): StreamClaimsHandle {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let backoff = CLAIM_POLL_MS;
  const last = new Map<number, ClaimRow>();
  let primed = false;

  const schedule = (delayMs: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, delayMs);
  };

  const tick = async () => {
    if (stopped) return;
    if (typeof document !== 'undefined' && document.hidden) {
      // Hidden tab — skip the fetch entirely, but keep the timer alive so
      // we resume on the same cadence as soon as the user returns.
      schedule(backoff);
      return;
    }
    const auth = getAuthFn();
    if (!auth) {
      schedule(CLAIM_POLL_MS);
      return;
    }
    try {
      const r = await deps.fetcher(auth);
      const current = new Map(r.claims.map((c) => [c.target_id, c]));
      if (!primed) {
        onEvent({ type: 'claim.snapshot', claims: r.claims });
        primed = true;
      } else {
        for (const c of r.claims) {
          if (!last.has(c.target_id)) onEvent({ type: 'claim.created', claim: c });
        }
        for (const [pid, prev] of last) {
          if (!current.has(pid)) onEvent({ type: 'claim.released', claim: prev });
        }
      }
      last.clear();
      current.forEach((v, k) => last.set(k, v));
      backoff = CLAIM_POLL_MS;
    } catch (err) {
      // Both auth + network errors back off identically — the bus
      // consumers skip on null auth so we don't need to clear it here.
      void deps.isAuthError(err);
      backoff = Math.min(backoff * 2, CLAIM_BACKOFF_MAX_MS);
    }
    schedule(backoff);
  };

  const onVisible = () => {
    if (!stopped && typeof document !== 'undefined' && !document.hidden) {
      schedule(0);
    }
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
  }

  timer = setTimeout(tick, 0);

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
    },
  };
}
