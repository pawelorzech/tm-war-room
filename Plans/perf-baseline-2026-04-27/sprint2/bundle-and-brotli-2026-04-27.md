# Sprint 2 — Bundle analysis + Brotli baseline

**Date:** 2026-04-27 (post Sprint 2 #1+#19 deploy, pre #4+#7+#27)
**Build command:** `cd frontend && ANALYZE=true npm run build`
**Tools:** `du`, `gzip -9`, `brotli -q 11`

## Total JavaScript shipped (entire `out/_next/static/chunks/`)

| Encoding | Bytes | Size  | Δ vs gzip |
|----------|-------|-------|-----------|
| raw      | 1 688 590 | 1 649 KB | — |
| gzip -9  |   458 369 |   447 KB | baseline |
| brotli -q 11 | 350 626 |   342 KB | **−23.5%** |

Confirms the Faza 4 estimate ("Brotli 15–25% mniejsze payloady JS/CSS niż gzip"). Brotli at q=11 is build-time only (one-shot), runtime cost is zero — nginx serves the pre-compressed `.br` file via `brotli_static on` whenever the client sends `Accept-Encoding: br` (every modern browser).

## Top 10 chunks by raw size

| KB raw | Chunk |
|--------|-------|
| 256 | 11at-uaaqyylp.js |
| 256 | 0m61lntveglb2.js |
| 192 | 05h8aesf4iv~f.js |
| 128 | 0h4.d_11n256f.js  ← DOMPurify lives here |
| 128 | 0fr8ol-yepx1h.js  |
| 128 | 03~yq9q893hmn.js  |
|  56 | 13e9j5j.4s0ry.js  |
|  56 | 12-fe.6jzr134.js  |
|  56 | 0g3av5lt5it~7.js  |
|  44 | 0~gck662sdp_r.js  |

Two ~256KB chunks dominate — likely the Next 16 runtime + React 19 framework chunk plus a shared "main app" chunk. Worth a closer look if we want to chase further reduction (e.g. dynamic-import the heavy widgets), but at current ~80 KB gzip + ~63 KB brotli per chunk we're inside the Next.js 170 KB First Load JS budget.

## DOMPurify placement (post-audit task #27)

Chunk: `out/_next/static/chunks/0h4.d_11n256f.js` (128 KB raw)

**Referenced from:** `out/company/director.html` (and the static-export auxiliary files for that route only — `__next._full.txt`, `__next.company.director.__PAGE__.txt`).

**NOT referenced from any other page** — checked all 38 routes: dashboard, team, chain, awards, market, loot, stocks, bounties, chat, war, training, etc. all skip this chunk.

**Verdict:** DOMPurify (≈22 KB gzip) is correctly code-split — it ships only with `/company/director` where the Torn news HTML is sanitized. No pollution of main bundle. **#27 verification PASS.**

## Top-line totals

|   | Today | After Brotli (build-time) | Delta |
|---|-------|---------------------------|-------|
| All-page JS payload | 447 KB gzip | 342 KB brotli | **−105 KB / −23%** |

For a typical user opening the dashboard, only a fraction of those chunks load (route-split + framework + main); the per-page delta will be in the same ratio (gzip→brotli ≈ −23%), so e.g. a route currently shipping ~120 KB gzip drops to ~92 KB brotli.

## Notes / followups

- Next 16's analyzer didn't emit the legacy `client.html`/`server.html` interactive treemaps under Turbopack — the `ANALYZE=true` flag is wired and the build passes cleanly, but there is no static treemap to ship. The numbers above (raw / gzip / brotli per chunk) are sufficient for the decision points the plan called out.
- Two open optimisation ideas surfaced by the chunk size table (parking for Sprint 3):
  1. The two 256 KB chunks bear inspecting — if either contains route-specific code, dynamic-import it.
  2. Chart.js may live inside `0fr8ol-yepx1h.js` or `03~yq9q893hmn.js` (both 128 KB) — task #8 (shared chartjs chunk) should reduce this further once tackled.
