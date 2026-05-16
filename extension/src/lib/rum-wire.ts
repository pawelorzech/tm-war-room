// Sprint 1.5 quick win #5 — wire the RumCollector + buildBeaconPayload
// into the bootstrap lifecycle. Diet edition: no per-poller instrumentation,
// no 60-second auto-flush, just one beacon on pagehide carrying
// boot-time TTI + TBT + FCP + longtask count + error count + page kind.
//
// Bundle budget for this whole file: ~400 B gzip. We use navigator.sendBeacon
// for fire-and-forget delivery (no Promise machinery, no fetch wrapper, no
// retry — the backend endpoint is idempotent and best-effort by design).
//
// Backend is dark by default (ENABLE_RUM=False) so beacons fly but go
// nowhere until Paweł flips the flag. See extension/docs/rum-privacy-review.md.

import { RumCollector, buildBeaconPayload } from './rum';
import { matchPage } from './torn-pages';
import { HUB_ORIGIN, COMPANION_VERSION } from '../env';

export interface RumWireDeps {
  /** Override the timer source. Tests use a vi.fn-friendly stub. */
  now?: () => number;
  /** Override the beacon transport. Tests inject a spy to assert payload. */
  sendBeacon?: (url: string, body: BodyInit) => boolean;
}

export function startRumWire(deps: RumWireDeps = {}): { flush: () => void; collector: RumCollector } {
  const now = deps.now ?? (() => performance.now());
  const send =
    deps.sendBeacon ??
    ((url: string, body: BodyInit) => {
      try {
        return navigator.sendBeacon(url, body);
      } catch {
        return false;
      }
    });

  const collector = new RumCollector();
  const bootStartedAt = now();

  // Long-task observer (W3C longtask spec). Wrap in try/catch — Firefox
  // before ~85 and some Safari versions reject the entryType.
  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) collector.recordLongTask(e.duration);
    });
    obs.observe({ type: 'longtask', buffered: true });
  } catch {
    /* unsupported — degrade silently, longtask_count stays 0 */
  }

  // Coarse error counter — no message, no stack, no file/line.
  window.addEventListener('error', () => collector.recordError());
  window.addEventListener('unhandledrejection', () => collector.recordError());

  const flush = (): void => {
    const tti = Math.max(0, Math.round(now() - bootStartedAt));
    const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0] as
      | PerformanceEntry
      | undefined;
    const longTasks = collector.snapshotLongTasks();
    const polls = collector.snapshotPolls();
    const errors = collector.snapshotErrors();
    const payload = buildBeaconPayload({
      version: COMPANION_VERSION,
      pageKind: matchPage().kind,
      ttiMs: tti,
      tbtMs: longTasks.blockingMs,
      fcpMs: fcpEntry ? Math.round(fcpEntry.startTime) : null,
      longtaskCount: longTasks.count,
      pollsPerMinVisible: polls.visible,
      pollsPerMinHidden: polls.hidden,
      errors,
      ts: new Date().toISOString(),
    });
    send(`${HUB_ORIGIN}/api/companion/rum`, new Blob([JSON.stringify(payload)], {
      type: 'application/json',
    }));
  };

  window.addEventListener('pagehide', flush);

  return { flush, collector };
}
