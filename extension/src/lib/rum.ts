// Tiny anonymous RUM beacon for the Companion. ~1 KB gzipped at build time.
//
// Sprint 0 of the perf optimization plan. Sends only the fields enumerated
// in extension/docs/rum-privacy-review.md. If you add a field here, update
// that document in the same commit; CI will block PRs that change one
// without the other.
//
// Zero PII. The backend (api/routers/companion_rum.py) enforces the same
// schema via Pydantic extra='forbid' as a second line of defence.

import type { PageKind } from './torn-pages';

const BACKEND_CEILING_MS = 60_000; // matches MAX_TIMING_MS in companion_rum.py
const BACKEND_CEILING_COUNT = 1_000; // matches MAX_COUNT
const LONG_TASK_THRESHOLD_MS = 50; // W3C longtask spec threshold

export interface BeaconSource {
  version: string;
  pageKind: PageKind;
  ttiMs: number;
  tbtMs: number;
  fcpMs: number | null;
  longtaskCount: number;
  pollsPerMinVisible: number;
  pollsPerMinHidden: number;
  errors: number;
  ts: string;
}

export interface BeaconPayload {
  v: string;
  page_kind: PageKind;
  tti_ms: number;
  tbt_ms: number;
  fcp_ms: number | null;
  longtask_count: number;
  polls_per_min_visible: number;
  polls_per_min_hidden: number;
  errors: number;
  ts: string;
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, Math.round(n)));

export function buildBeaconPayload(src: BeaconSource): BeaconPayload {
  return {
    v: src.version,
    page_kind: src.pageKind,
    tti_ms: clamp(src.ttiMs, 0, BACKEND_CEILING_MS),
    tbt_ms: clamp(src.tbtMs, 0, BACKEND_CEILING_MS),
    fcp_ms: src.fcpMs === null ? null : clamp(src.fcpMs, 0, BACKEND_CEILING_MS),
    longtask_count: clamp(src.longtaskCount, 0, BACKEND_CEILING_COUNT),
    polls_per_min_visible: clamp(src.pollsPerMinVisible, 0, BACKEND_CEILING_COUNT),
    polls_per_min_hidden: clamp(src.pollsPerMinHidden, 0, BACKEND_CEILING_COUNT),
    errors: clamp(src.errors, 0, BACKEND_CEILING_COUNT),
    ts: src.ts,
  };
}

export class RumCollector {
  private pollsVisible = 0;
  private pollsHidden = 0;
  private longtaskCount = 0;
  private blockingMs = 0;
  private errorCount = 0;

  recordPoll(): void {
    if (document.visibilityState === 'hidden') {
      this.pollsHidden += 1;
    } else {
      this.pollsVisible += 1;
    }
  }

  snapshotPolls(): { visible: number; hidden: number } {
    const snap = { visible: this.pollsVisible, hidden: this.pollsHidden };
    this.pollsVisible = 0;
    this.pollsHidden = 0;
    return snap;
  }

  recordLongTask(durationMs: number): void {
    if (durationMs <= LONG_TASK_THRESHOLD_MS) return;
    this.longtaskCount += 1;
    this.blockingMs += durationMs - LONG_TASK_THRESHOLD_MS;
  }

  snapshotLongTasks(): { count: number; blockingMs: number } {
    const snap = { count: this.longtaskCount, blockingMs: this.blockingMs };
    this.longtaskCount = 0;
    this.blockingMs = 0;
    return snap;
  }

  recordError(): void {
    this.errorCount += 1;
  }

  snapshotErrors(): number {
    const snap = this.errorCount;
    this.errorCount = 0;
    return snap;
  }
}
