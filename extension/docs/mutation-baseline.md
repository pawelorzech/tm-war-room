# Stryker mutation testing — Sprint 0 baseline

This document records the **first measured mutation score** for the Companion
extension's pure-ish library modules. Sprint 0 of
`Plans/chc-zadba-bardoz-snazzy-wave.md` calls for a baseline measurement;
Sprint 2 may flip Stryker from record-only to enforced-minimum on `lib/*`.

- **Date**: 2026-05-17
- **Stryker version**: `@stryker-mutator/core` 9.6.1, `@stryker-mutator/vitest-runner` 9.6.1
- **Vitest version**: 2.1.9 (`happy-dom` 15.x environment)
- **Total mutants generated**: 487 across 7 files
- **Initial test run**: 108 unit tests, all passing (~47 ms net)
- **Wall-clock run time**: ~16 seconds
- **HTML report**: `extension/reports/mutation/mutation.html` (gitignored)
- **JSON report**: `extension/reports/mutation/mutation.json` (gitignored)

## Per-file mutation score

Mutation score = `(killed + timeout) / (killed + survived + timeout + noCoverage)`,
which is what Stryker reports as the headline score. The "covered" column
removes `noCoverage` mutants from the denominator (useful for understanding
how well the existing covered code is *checked*, separately from how much
is covered at all).

| Module | Source LOC | Mutants | Killed | Survived | Timeout | NoCov | Score | Score (covered) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `src/lib/rum.ts` | 106 | 32 | 31 | 1 | 0 | 0 | **96.88%** | 96.88% |
| `src/lib/refresh-dedupe.ts` | 48 | 19 | 18 | 1 | 0 | 0 | **94.74%** | 94.74% |
| `src/lib/torn-pages.ts` | 192 | 281 | 228 | 39 | 0 | 14 | **81.14%** | 85.39% |
| `src/lib/anchor-cache.ts` | 32 | 11 | 8 | 3 | 0 | 0 | **72.73%** | 72.73% |
| `src/lib/claim-stream.ts` | 120 | 78 | 54 | 23 | 1 | 0 | **70.51%** | 70.51% |
| `src/lib/poll.ts` | 99 | 53 | 33 | 18 | 2 | 0 | **66.04%** | 66.04% |
| `src/lib/preconnect.ts` | 20 | 13 | 7 | 6 | 0 | 0 | **53.85%** | 53.85% |
| **Total** | **617** | **487** | **379** | **91** | **3** | **14** | **78.44%** | **80.76%** |

## Threshold decision

`stryker.config.mjs` now sets:

```js
thresholds: {
  high: 80,
  low: 60,
  break: 73,   // baseline_avg (78.44) − 5%, rounded down to integer floor
}
```

`break: 73` is the line below which CI fails. It is intentionally a few
points below the overall baseline so that one or two surviving mutants
sneaking in via an unrelated change does not turn the gate red — the gate
exists to catch *regressions*, not natural drift.

`high`/`low` are soft warning bands (no CI effect): green ≥ 80, yellow
60–80, red < 60.

## Modules flagged for follow-up (score < 70%)

These three modules deserve another pass of unit tests in a future sprint.
Each line below is a hint at where the surviving mutants cluster — read
`reports/mutation/mutation.html` locally for the full per-mutant view.

- **`src/lib/preconnect.ts` — 53.85%** (6 / 13 survived). Tiny module
  (20 LOC), so each surviving mutant moves the percentage a lot. Likely
  missing assertions on the `<link rel="preconnect">` / `<link rel="dns-prefetch">`
  element attributes the module actually writes onto the document head.
  Three unit tests is light coverage for the number of code paths.
- **`src/lib/poll.ts` — 66.04%** (18 / 53 survived, 2 timeouts). The poll
  loop's timing arithmetic (`setTimeout` delays, jitter) and the
  visibility-change pause/resume branches are the obvious gap — Stryker
  tends to mutate `+`/`-` operators on delay math and string-equality on
  `document.visibilityState`. Worth a targeted round of tests that fake
  `document.hidden` transitions and verify the next scheduled delay.
- **`src/lib/claim-stream.ts` — 70.51%** (23 / 77 valid survived, 1
  timeout). Sits right on the 70% line, so it's borderline rather than
  alarming. The 9 existing tests cover the happy path well; survivors
  are likely around stream-close ordering and error-handler short-circuits.

## Modules flagged at borderline (70-80%)

- **`src/lib/anchor-cache.ts` — 72.73%** (3 / 11 survived). Small surface
  area (32 LOC, 5 tests), but only 3 survivors — adding tests for cache
  eviction / overwrite would likely push this into the 80s.
- **`src/lib/torn-pages.ts` — 81.14% headline, 85.39% covered**. The
  14 `NoCoverage` mutants drag the headline number down but represent code
  paths that the existing 42 tests don't even execute. Worth verifying
  whether those branches are reachable in production at all (dead-code
  candidates).

## Modules intentionally NOT mutated

- **`src/lib/api.ts`** — 786 LOC, mostly async HTTP transport with
  GM_xmlhttpRequest. Mutation testing produces too many equivalent
  mutants from `await`/`Promise` reshuffling to give useful signal.
  The SWR feature-flags cache logic that lives in this file is covered
  by `feature-flags-cache.test.ts` (7 tests) — those tests still run
  during Stryker's initial test phase, they just don't drive any mutants
  here.
- **`src/lib/rum-wire.ts`** — depends on `PerformanceObserver`, which
  `happy-dom` does not stub cleanly. Mutation testing this would mostly
  measure flake in the test harness, not the module under test.

Other `src/lib/*.ts` files (`auth.ts`, `format.ts`, `card-styles.ts`,
`modal.ts`, `notifications.ts`, `persistent-host.ts`, `profile-stack.ts`,
`row-decorator.ts`, `shadow.ts`, `settings.ts`, `claim-bus.ts`) currently
have no unit tests, so they would be 100% `NoCoverage` mutants. Add tests
first, then expand `mutate` in `stryker.config.mjs`.

## How to reproduce

```bash
cd extension
npm install              # picks up @stryker-mutator/core + vitest-runner
npx stryker run          # ~16s on an M-series Mac
open reports/mutation/mutation.html
```

The JSON-summary output that some CI systems prefer is not available in
Stryker 9.x as a named reporter; `reports/mutation/mutation.json` (from
the `json` reporter) is the structured-data equivalent.
