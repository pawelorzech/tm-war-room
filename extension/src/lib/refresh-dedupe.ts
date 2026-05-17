// Refresh-dedupe — pure helper for index.ts:refresh() re-entrancy guard.
//
// Why this exists:
//   refresh() is wired up from FOUR entry points — setInterval, the
//   MutationObserver inside watchUrlChanges(), installAuthListener, and
//   the 'tm-companion-refresh' event handler. The observer alone can fire
//   dozens of times per second on heavy Torn pages (faction roster,
//   market). Without a guard we kick off the same heavyweight refresh
//   (off-limits map, war id, overlay re-renders) in rapid succession,
//   doubling network requests and CPU work.
//
// What we guard against:
//   1. Re-entrant calls: a second refresh() landing while the first is
//      still mid-await. The in-flight flag drops these — we don't queue,
//      because the in-flight one will pick up the latest state anyway.
//   2. Burst calls on the same URL: mutation-observer bursts. We dedupe
//      by (href, timestamp) — within the window, same URL = same data.
//
// What we DELIBERATELY don't guard against:
//   - Different URLs inside the window — SPA navigation must always
//     re-render even if it lands 50ms after the previous refresh.
//   - The setInterval(30s) tick — its job is to surface teammate flag
//     changes; the dedupe window (250ms) is two orders of magnitude
//     below the polling cadence, so periodic refreshes pass through.

export function shouldSkipRefresh(
  now: number,
  currentHref: string,
  lastHref: string | null,
  lastAt: number,
  windowMs: number,
  inFlight: boolean,
): boolean {
  // In-flight is the strongest guard — serialize refresh() regardless of
  // URL or timing. A second call would race the first on shared caches
  // (warIdCache, offLimitsCache) and double the network work.
  if (inFlight) return true;

  // First-ever refresh: no prior state, always run.
  if (lastHref === null) return false;

  // Same URL inside the dedupe window: redundant. Strict-less-than means
  // exactly at the boundary we pass through (deterministic edge behavior).
  if (currentHref === lastHref && now - lastAt < windowMs) return true;

  return false;
}
