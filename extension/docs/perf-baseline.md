# TM Hub Companion — Performance Baseline

Reproducible measurement recipe for the TM Hub Companion userscript. Re-run quarterly or whenever a perf gate fires to keep the numbers honest.

## Bundle size baseline (2026-05-17)

Measured against `master` at commit `e9006c5` (v0.27.2).

| Compression | Size | Notes |
|-------------|------|-------|
| Raw | 184 547 B (180.2 KB) | esbuild output, identifiers not minified |
| Gzip (default) | 44 233 B (43.2 KB) | `gzip -c` defaults |
| Brotli q=11 | 36 985 B (36.1 KB) | What nginx serves via `brotli_static` |

Production reference: `etag: "6a08f45a-9079"` from `https://hub.tri.ovh/companion.user.js` → `0x9079` = 36 985 B, matches the brotli q=11 build exactly. Nginx is serving pre-compressed.

Encoded as gates in [`extension/.size-limit.json`](../.size-limit.json) with small headroom (+0.4 KB) so trivial source edits don't false-fail CI; structural growth still trips the gate.

### How to reproduce

```bash
cd extension
npm install
npm run build
wc -c dist/tm-hub-companion.user.js                     # raw
gzip -c dist/tm-hub-companion.user.js | wc -c           # gzip default
brotli -q 11 -c dist/tm-hub-companion.user.js | wc -c   # brotli max
npm run size                                            # checks all three vs .size-limit.json
```

Verify what the production server actually delivers:

```bash
curl -sI -H 'Accept-Encoding: br' https://hub.tri.ovh/companion.user.js \
  | grep -iE 'content-encoding|content-length|etag'
```

Expect `content-encoding: br` and `content-length: 36985` (±a few bytes; banner version bumps move it).

## Runtime baseline (TBD — Sprint 1 RUM beacon will populate)

Until RUM data is flowing, runtime perf is collected manually with Chrome DevTools. Five "baseline pages" to walk through, one trace each:

| # | Page | URL |
|---|------|-----|
| 1 | Profile | `https://www.torn.com/profiles.php?XID=2362436` |
| 2 | Attack | `https://www.torn.com/page.php?sid=attack&user2ID=<enemy>` |
| 3 | Faction roster | `https://www.torn.com/factions.php?step=profile&ID=11559` |
| 4 | Market | `https://www.torn.com/imarket.php` |
| 5 | Bounties | `https://www.torn.com/bounties.php` |

### Chrome configuration (recorded for repeatability)

- Chrome stable, Incognito window (no extensions other than Tampermonkey).
- Tampermonkey installed, Companion enabled.
- DevTools → Performance tab.
- Network: **No throttling**.
- CPU: **No throttling** (record-only Sprint 0; Sprint 1 may add throttled passes).
- Viewport: 1440×900 (default DevTools-docked-bottom).
- Cache: **Disable cache** ticked under Network tab.

### Recipe per page

1. Open the page in a fresh tab.
2. Open DevTools → Performance.
3. Click "Record", reload the page, wait until visually idle ~5 s past first paint, click "Stop".
4. Capture from the trace:
   - **Script eval time** for `companion.user.js` — locate the `Evaluate Script` row.
   - **Time-to-first-overlay** — first paint event of any TM-Companion shadow-host. Useful tag: `data-tm-companion` attribute.
   - **TBT (total blocking time)** — sum of `(longtask.duration − 50 ms)` for all longtasks in the first 5 s after `document-idle`.
5. Record numbers in the table below, dated.

### Manual baseline (fill in once before Sprint 1)

| Date | Page | Script eval (ms) | First overlay (ms) | TBT 5s (ms) | Notes |
|------|------|------------------|---------------------|--------------|-------|
| 2026-05-17 | profile | TBD | TBD | TBD | initial baseline |
| 2026-05-17 | attack | TBD | TBD | TBD | |
| 2026-05-17 | faction | TBD | TBD | TBD | heavy DOM |
| 2026-05-17 | market | TBD | TBD | TBD | |
| 2026-05-17 | bounties | TBD | TBD | TBD | |

When Sprint 1 lands the RUM beacon, this table moves to "manual override / spot check" status and the canonical numbers come from real-user data.

## Polling baseline

Each `setInterval` / poller in the Companion plus its cadence. Re-audit when adding or removing pollers.

| Source (file:line) | Cadence | Visibility-aware (`lib/poll.ts`) | Notes |
|---|---|---|---|
| `src/index.ts:280` | 60 s | ❌ raw `setInterval` | feature flags |
| `src/index.ts:318` | 30 s | ❌ raw `setInterval` | off-limits refresh |
| `src/inject/status-chip.ts` | 5 s | TBD — confirm in Sprint 1 audit | corner chip update |
| `src/inject/chat-dock.ts` | 5 s + visibility hooks | TBD | message poll |
| `src/inject/notification-toasts.ts` | 5 s | TBD | toast tray |
| `src/inject/mention-alerts.ts` | poll-interval | TBD | mentions |
| `src/inject/heartbeat.ts` | 60 s | TBD | presence ping |
| `src/inject/flight-pill.ts:154` | 30 s | TBD | flight tick |
| `src/inject/claim-button.ts:137` | 1 s | n/a (UI countdown, not network) | claim countdown |
| `src/lib/api.ts:streamClaims` | 5 s → 60 s backoff | ❌ raw timers, custom backoff | claims live stream |

Goal for Sprint 1: every network poller routes through `lib/poll.ts` so a hidden tab stops issuing requests within one cadence period.

## Heap / memory baseline (long-running tabs)

Once Sprint 0 instrumentation lands, take three snapshots per page:

1. After 30 s on the page.
2. After 5 min idle on the page.
3. After 30 min idle on the page.

Snapshot 1 → 3 growth > 5 MB is a flag for leak investigation (listener accumulation, ShadowDOM root retention, unbounded fetch cache).

## Backend latency baseline

Companion-touched endpoints (extracted from Phase-1 exploration):

```
/api/extension/feature-flags
/api/extension/issue-token
/api/wars/current
/api/war-off-limits/{warId}
/api/spy/{playerId}
/api/ff/{playerId}
/api/flights/{playerId}
/api/activity/{playerId}
/api/claims/active
/api/notifications/unread
/api/chat/mentions/recent
/api/chat/channels[, /{id}/messages, /read]
/api/heartbeat
/api/stocks/portfolio, /api/stocks/roi
/api/loot
/api/travel
/api/market/prices
/api/bounties
/api/armoury/competitions[, /{id}/leaderboard]
/api/oc
/api/companion/rum   (Sprint 0 NEW)
```

For each: capture p50 / p95 / p99 latency over 1 h of production traffic (read from access log or, once RUM is up, from beacon timings). Set the Sprint 1 record-only baseline once data is collected; flip to enforced gates in Sprint 2.

## Update protocol

1. Re-run the bundle measurement recipe.
2. If numbers moved meaningfully (>2 % gzip drift) without intent, treat as a regression and bisect.
3. If numbers moved with intent, update `.size-limit.json` thresholds **in the same PR** and explain why in the PR description.
4. Update the dated tables in this doc once per quarter or after a major refactor — whichever comes first.
