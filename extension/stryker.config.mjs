// Mutation testing for the Companion. Sprint 0 = record-only — the report
// produces a baseline mutation score for the pure-ish modules below. Sprint
// 2 of the perf plan flips this from record-only to enforced minimum.
//
// Scope is deliberately narrow. We mutate only the deterministic library
// modules — DOM-side inject/* code drowns mutation testing in equivalent
// mutants from async UI. See Plans/chc-zadba-bardoz-snazzy-wave.md.

export default {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  mutate: [
    'src/lib/torn-pages.ts',
    'src/lib/rum.ts',
    // Future Sprint 0+1 additions once tests exist:
    // 'src/lib/format.ts',
    // 'src/lib/auth.ts',
    // 'src/lib/poll.ts',
  ],
  thresholds: {
    // Record-only thresholds for Sprint 0. Sprint 2 flips `break` upward.
    high: 80,
    low: 60,
    break: 0,
  },
  reporters: ['progress', 'html', 'json-summary'],
  coverageAnalysis: 'perTest',
};
