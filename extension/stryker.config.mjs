// Mutation testing for the Companion. Sprint 0 = record-only — the report
// produces a baseline mutation score for the pure-ish modules below. Sprint
// 2 of the perf plan flips this from record-only to enforced minimum.
//
// Scope is deliberately narrow. We mutate only the deterministic library
// modules — DOM-side inject/* code drowns mutation testing in equivalent
// mutants from async UI. See Plans/chc-zadba-bardoz-snazzy-wave.md.
//
// Intentionally NOT mutated:
//   - src/lib/api.ts          (786 LOC, mostly async transport — too many
//                              equivalent mutants for the signal it gives)
//   - src/lib/rum-wire.ts     (depends on PerformanceObserver; hard to
//                              mutate-test cleanly without flake)

export default {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  mutate: [
    'src/lib/torn-pages.ts',
    'src/lib/rum.ts',
    'src/lib/preconnect.ts',
    'src/lib/claim-stream.ts',
    'src/lib/anchor-cache.ts',
    'src/lib/poll.ts',
    'src/lib/refresh-dedupe.ts',
  ],
  thresholds: {
    // Sprint 0 baseline thresholds. `break` is set to (baseline_avg - 5%)
    // so CI fails if mutation coverage regresses below today's measurement.
    // Baseline: 78.44% on 2026-05-17 across 7 lib/* modules; break = 73 is
    // the floor (78.44 - 5%, rounded down to integer). Per-file scores in
    // extension/docs/mutation-baseline.md. Sprint 2 may tighten this.
    high: 80,
    low: 60,
    break: 73,
  },
  reporters: ['progress', 'html', 'json'],
  coverageAnalysis: 'perTest',
};
