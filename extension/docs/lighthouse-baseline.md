# TM Hub `/install` — Lighthouse Baseline

First captured baseline of the static `/install` page (the public Companion install landing) measured via Lighthouse CI. Sprint 1.5 wires this into `.github/workflows/deploy.yml` as a record-only gate (`continue-on-error: true`, all `assert` thresholds at `warn`). Sprint 2 flips the warns to `error` once we have ~2 weeks of stable scores to gate against.

## Toolchain

- **`@lhci/cli`**: `0.14` (pinned in `.github/workflows/deploy.yml` via `npx --yes @lhci/cli@0.14 autorun`). Latest published is `0.15.1` — we deliberately pin to `0.14` because it's what shipped with the Sprint 1.5 wire-up; bump only when there's a concrete reason (CVE, broken assertion, Node 22 EOL).
- **Lighthouse runtime**: `12.1.0` (carried by `@lhci/cli@0.14`).
- **Chrome**: launched headless by `chrome-launcher` (macOS finds `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` automatically; the Ubuntu GHA runner uses its bundled `google-chrome-stable`).
- **Node**: 20 in CI (`actions/setup-node` v6.4.0); any 18/20/22+ works locally.

## Reproduce locally

```bash
# 1. Build the static export
cd frontend && npm ci && npm run build && cd ..

# 2. Run Lighthouse CI (3 runs, desktop preset, asserts as `warn`)
npx --yes @lhci/cli@0.14 autorun --config=./lighthouserc.json

# Artifacts land in ./.lighthouseci/ (HTML + JSON + manifest.json + assertion-results.json)
open .lighthouseci/localhost-_install_html-*.report.html   # macOS — eyeball the report
```

`lighthouserc.json` uses `staticDistDir: ./frontend/out`, so lhci spins up its own static server on a random port. The URL must point at the on-disk file Next.js' `output: "export"` actually emits — for `/install`, that's **`install.html`** at the root of `frontend/out/`, not `install/index.html` (Next 16's exporter does not emit per-route `index.html` directories). The original Sprint 1.5 config pointed at `install/index.html`, which 404'd every run with `ERRORED_DOCUMENT_REQUEST`; this baseline doc lands together with the URL fix.

## Scores (2026-05-17, commit at top of `worktree-agent-a74db04d4a77e452b`)

Median of 3 runs, desktop preset, simulated throttling, no network. Representative run = run 3.

| Category | Score | Threshold (warn) | Status |
|---|---|---|---|
| Performance | **1.00** | 0.85 | far above |
| Accessibility | **0.94** | 0.90 | above (2 real issues, see below) |
| Best Practices | **0.96** | 0.90 | above (1 console-noise issue, see below) |
| SEO | **1.00** | 0.90 | far above |

All 3 runs returned identical category scores — the page is deterministic under simulated throttling, as expected for a static export with no async hydration of remote data on the critical path.

### Key web-vitals metrics

| Metric | Value | Score |
|---|---|---|
| First Contentful Paint (FCP) | 0.2 s | 1.00 |
| Largest Contentful Paint (LCP) | 0.6 s | 1.00 |
| Cumulative Layout Shift (CLS) | 0 | 1.00 |
| Total Blocking Time (TBT) | 0 ms | 1.00 |
| Speed Index (SI) | 0.2 s | 1.00 |
| Time to Interactive (TTI) | 0.6 s | 1.00 |
| Server response time | 0 ms (static fs) | 1.00 |

These are best-case numbers — lhci serves from local fs with no compression negotiation, no TLS handshake, no real network. Production scores from Umami/RUM will be lower but should track the same ordering.

### What's keeping Accessibility off 1.0

- **`color-contrast` (score 0)** — `text-text-muted` (`#484f58` on `#161b22` / `#0d1117`) is used for small (10-12 px) caption text in 7+ places on `/install`. Contrast ratio 2.08-2.28, WCAG AA wants 4.5 for body / 3.0 for large. Either lighten the muted token or stop using it under 14 px.
- **`heading-order` (score 0)** — `/install` jumps from `<h1>` straight to `<h3>` in at least one section card (skipping `<h2>`). Cheap fix: demote to `<h3>` consistently or promote to `<h2>`.

Neither blocks Sprint 2's "flip to error at 0.90" — current 0.94 already clears that threshold. They're tracked as Companion-page polish for whoever next touches `/install`.

### What's keeping Best Practices off 1.0

- **`errors-in-console` (score 0)** — 4 expected 404s when the page is served by lhci's static server with no FastAPI behind it:
  - `GET /api/announcements` → 404
  - `GET /api/announcements/all` → 404
  - `GET /api/version/status?v=1.52.0` → 404
  - `GET /api/settings/public` → 404

  These are real network requests the page makes on mount; under lhci they 404 because there's no backend, in prod they're 200s. **Not a bug.** Worth re-evaluating before flipping the BP threshold to `error` — if it still scores 0.96 we're fine; if a future change adds more console errors we'll notice immediately because the score drops.

## Sprint 2 — which `warn` to flip to `error`

All four are currently `warn` in `lighthouserc.json`. Recommended Sprint 2 transition:

| Category | Current `warn` floor | Proposed `error` floor for Sprint 2 | Reasoning |
|---|---|---|---|
| Performance | 0.85 | **0.90** | Headroom is huge (1.00); 0.90 catches structural regressions (a big new dep, render-blocking font, etc.) without false-firing on rounding. |
| Accessibility | 0.90 | **0.90** (unchanged) | We're at 0.94 with two known small issues. Lifting to 0.95 would force-fix them; lifting to 0.90 ratchets in the current state. |
| Best Practices | 0.90 | **0.90** (unchanged) | Console-error audit is binary 0/1; if prod adds even one new console error this drops below 0.96 fast. Don't tighten until we've eliminated the static-export 404s (mock them, gate them on `window.fetch`, or serve a stub `/api/*`). |
| SEO | 0.90 | **0.95** | At 1.00 with no fragile inputs (meta description, viewport, valid lang). 0.95 leaves slack for one missing `<meta>` regression to warn before erroring. |

The mechanical edit when Sprint 2 ships:

```diff
- "categories:performance": ["warn", { "minScore": 0.85 }],
- "categories:accessibility": ["warn", { "minScore": 0.9 }],
- "categories:best-practices": ["warn", { "minScore": 0.9 }],
- "categories:seo": ["warn", { "minScore": 0.9 }]
+ "categories:performance": ["error", { "minScore": 0.9 }],
+ "categories:accessibility": ["error", { "minScore": 0.9 }],
+ "categories:best-practices": ["error", { "minScore": 0.9 }],
+ "categories:seo": ["error", { "minScore": 0.95 }]
```

And in `.github/workflows/deploy.yml`, drop `continue-on-error: true` from the `lighthouse` job.

## CI shape

```yaml
# .github/workflows/deploy.yml — lighthouse job
lighthouse:
  needs: test
  if: github.event_name == 'pull_request'      # PR-only, never on push to master
  runs-on: ubuntu-latest
  continue-on-error: true                       # Sprint 1.5: record-only
  steps:
    - checkout
    - setup-node 20
    - cd frontend && npm ci && npm run build
    - npx --yes @lhci/cli@0.14 autorun --config=./lighthouserc.json
    - upload-artifact: .lighthouseci (always)
```

Artifacts persist on the workflow run for 90 days (GitHub default) so any reviewer can grab the full HTML report off a PR even after the runner is gone.
