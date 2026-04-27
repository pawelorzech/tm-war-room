# Sprint 2 — Lighthouse desktop baseline (post #1+#19, #4, #7+#27, #8 + polish)

**Date:** 2026-04-27 evening (post-deploy 89d517f, all Sprint 2 frontend work shipped)
**URL:** https://hub.tri.ovh/dashboard
**Tool:** `npx @lhci/cli@latest collect --numberOfRuns=1` (default desktop preset)

## Headline metrics

| Metric | Value | Target (web.dev/vitals) | Pass? |
|--------|-------|-------------------------|-------|
| **Performance score** | **96/100** | ≥ 90 | ✅ |
| LCP | 2.3 s | ≤ 2.5 s | ✅ |
| FCP | 1.1 s | ≤ 1.8 s | ✅ |
| CLS | 0 | ≤ 0.1 | ✅ |
| TBT | 0 ms | ≤ 200 ms | ✅ (zero blocking time) |
| TTI | 2.3 s | ≤ 3.8 s | ✅ |
| Speed Index | 4.3 s | ≤ 4.3 s | ✅ (right at the edge) |
| Server response | 50 ms | ≤ 800 ms | ✅ |

## Total JS payload (production)

| Encoding | Size | Note |
|----------|------|------|
| raw | 1 649 KB | all chunks |
| gzip | 447 KB | served when client doesn't support br |
| **brotli** | **342 KB** | served to all modern browsers |

Per-chunk on prod (sample of 5):

| Chunk | raw | gzip | br | br vs gz |
|-------|-----|------|----|----------|
| 03~yq9q893hmn.js | 113 KB | 39 KB | 35 KB | -10% |
| 0fr8ol-yepx1h.js | 128 KB | (Next runtime) | (Next runtime) | — |
| 11at-uaaqyylp.js | 256 KB | (chart.js shared, Sprint 2 #8) | — | — |
| 04ygt.qvf0-hg.js | 53 KB | 14 KB | 13 KB | -12% |
| 07uz2g0_38qia.js | 43 KB | 9 KB | 8 KB | -13% |

## Verdict

**Site is fast enough.** All Core Web Vitals are within Google's "Good" thresholds; performance score is 96/100. The remaining Lighthouse findings are diminishing returns:

- 21 KB unused JavaScript in one chunk on /dashboard (out of 59 KB raw). Typical for an SPA — represents code paths the dashboard route doesn't exercise on first load. Not worth chasing without a clear regression.
- No render-blocking resources (Umami is `lazyOnload`, no fonts).

## What got us here (Sprint 1 + Sprint 2 to date)

| Optimization | Impact |
|--------------|--------|
| Sprint 1 — `/api/company/director/faction` parallelized | director endpoint p95 5-10× faster |
| Sprint 1 — nginx Cache-Control honoured | proxy cache hit ratio 0% → expected baseline |
| Sprint 1 — JSON request logs + /health + Web Vitals → Umami | observable instead of guessing |
| Sprint 2 #1+#19 — gunicorn 2 workers + Redis + leader-election | API throughput ~2×, chat cross-worker |
| Sprint 2 #4 — Brotli pre-compression | -23% bytes vs gzip on aggregate JS |
| Sprint 2 #8 — shared chart.js setup | one consolidated chart chunk |
| Polish — Umami preconnect, internal `<Link>` audit | -100-300 ms first analytics ping |
| Sprint 2 #22 — pytest-xdist on CI | test suite 8.2 s → 5.0 s wall (-39%) |

## Remaining Sprint 2 items (now strictly returns-diminishing or coordination-heavy)

| # | Task | Why we're parking it |
|---|------|---------------------|
| #9 | ETag middleware | MD5 overhead per GET vs 0-byte 304 — needs measurement; benefit unclear at 96/100 |
| #10+#26 | Cloudflare in front of Coolify | Largest possible TTFB win for distant users, but DNS coordination + CSP/Auto-Minify guard makes it a separate-session change |
| #13 | Glitchtip self-hosted | High value (observability), but needs Coolify provisioning of web + postgres + redis + celery — >1h focused work |
| #15 | Pagination on spy/director | Edge case (faction 100+ members); current targets are 30-70 |
| #25 | jti deny-list to Redis | SQLite point lookup is sub-ms; refactor cost > benefit |

## Open ideas (post-Sprint 2)

- **Q3 epic** — migrate `output:export` → Next standalone + selective ISR for `/dashboard` and `/stocks` (LCP -30% target).
- **Lighthouse mobile + slow-4G run** — desktop is not the worst-case. Worth re-running on mobile preset; we'll likely see LCP ~3-4 s with default desktop reaching 2.3 s. The mobile delta tells us where to focus next.
