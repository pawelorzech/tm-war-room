# Companion RUM Beacon — Privacy Review

**Status:** Awaiting sign-off (Sprint 0)
**Author:** Claude (Algorithm session 2026-05-17). Drafted from conversation with Paweł Orzech on 2026-05-17 where the "zero PII + documentation in /install" option was selected over a consent banner or opt-out toggle.
**Approver:** Paweł Orzech (TM Hub maintainer). Sign-off pending — fill the line below before flipping `ENABLE_RUM=1` in production.

> **Sign-off line (fill in before production ramp):**
>
> Reviewed and approved by ____________________ on ____________ (date).
**Scope:** `extension/src/lib/rum.ts` and backend endpoint `POST /api/companion/rum`.

The Companion has historically sent zero analytics. This document is the precedent — what we ship from a player's browser to TM Hub, and what we will never ship, and how a player can stop it.

## What we collect

Anonymous performance signals only. Every payload field is enumerated here. If a field is not in this list, we do not collect it.

| Field | Type | Source | Why we want it |
|-------|------|--------|-----------------|
| `v` | string | `process.env.TM_COMPANION_VERSION` baked into the build | Tell apart sessions on different Companion versions during a rollout. |
| `page_kind` | enum `'profile'`, `'attack'`, `'faction'`, `'market'`, `'bounties'`, `'imarket'`, `'oc'`, `'hospital'`, `'jail'`, `'halloffame'`, `'travel'`, `'ambient'`, `'armoury'`, `'retals'`, `'stocks'`, `'unknown'` | `lib/torn-pages.ts` `matchPage(...)` — derived from `window.location.pathname` only | Performance regressions usually concentrate on one page kind (e.g. heavy DOM on faction roster). Without page kind we cannot tell. |
| `tti_ms` | number, integer ms | `performance.now()` delta between `tm-companion:boot:start` and `tm-companion:overlay:rendered` marks | Time-to-first-overlay after `document-idle`. The single most important user-facing metric. |
| `tbt_ms` | number, integer ms | sum of `(entry.duration − 50)` from `PerformanceObserver({ type: 'longtask' })` over the first 5 s after boot | Total Blocking Time — how janky the page felt during boot. |
| `fcp_ms` | number, integer ms or null | `PerformanceObserver({ type: 'paint' })` `first-contentful-paint` entry's `startTime`, or null if not exposed (Firefox before 84, some Safari versions) | First Contentful Paint of the host page — sanity baseline for `tti_ms`. |
| `longtask_count` | integer | count of `longtask` entries in the first 5 s window | Proxy for jank density. |
| `polls_per_min_visible` | integer | counted by `lib/rum.ts` while `document.visibilityState === 'visible'` over a 60 s rolling window | Polling load attributable to Companion when the user is looking. |
| `polls_per_min_hidden` | integer | counted while `document.visibilityState === 'hidden'` | Wasted polling — what Sprint 2's polling consolidation aims to drive to ~0. |
| `errors` | integer | count of unhandled rejections caught by Companion's own error handler (does NOT include error stack, message, file, or line) | Coarse error-rate trend. |
| `ts` | ISO 8601 string | wall-clock at beacon flush time | Bucketing, nothing more. |

### Aggregation

Beacon batches the above for a 60 s window or until `pagehide`, whichever comes first, then sends a single POST. Maximum one payload per minute per tab.

## What we do not collect (enforced in code, asserted in tests)

The following must never appear in any beacon payload. The schema validator in `lib/rum.ts` rejects them; the backend handler (`api/routers/companion_rum.py`) strips them as a second line of defence; integration tests in `tests/test_companion_rum.py` confirm both layers.

- **Torn player id.** Not the player viewing, not the player being viewed.
- **Full URLs.** Only the derived `page_kind`. The pathname is never sent.
- **Search parameters or URL fragments.**
- **IP address** (the backend logs receiving IPs at nginx for abuse control but the RUM table strips them on insert — see `api/db/migrations/` for the migration that creates `companion_rum`).
- **User-Agent.** Browser identification not needed for v0 metrics.
- **HTTP referrer / `document.referrer`.**
- **Cookies, localStorage, `GM_*` storage values.**
- **Message content** from chat / notifications / mentions.
- **Faction id.** Useful for shaping but private to the faction.
- **Stack traces, error messages, file paths, line numbers.** A future Sprint may add Sentry/structured errors with explicit opt-in — not in this beacon.

Backend reuses `api/observability.py`'s PII filter as a third defence: any field name matching its allowlist of secrets/PII patterns is dropped before persistence.

## How long we keep it

- Rolling **30 days** at row granularity, aggregated to hourly buckets after that.
- After 90 days, only the hourly aggregates remain.
- A deletion path is exposed via admin tooling (the `companion_rum` SQLite table can be truncated; the aggregate tables are independent and rebuildable from logs if ever needed).

## Who has access

- TM Hub admins (currently: Bombel [2362436]).
- No third party. No vendor analytics SDK. No data leaves `hub.tri.ovh`.

## Opt-out

- Sprint 0 beacon is **opt-out via a backend kill switch.** `GET /api/extension/feature-flags` returns `rum_enabled: bool` and the beacon no-ops when false. Flag defaults `false` until this document is signed off and the ramp begins (1 % → 10 % → 100 %).
- Sprint 1 adds a per-player opt-out toggle in the Companion status chip "Settings" sheet. When the user disables it, the beacon stops sending and the local `GM_setValue('tm-companion:rum-opt-out', true)` flag is checked before every beacon flush.
- A player can also block the beacon at the userscript manager level by denying the `@connect hub.tri.ovh` permission — the beacon fails closed (silent drop, no retry).

## Disclosure to players

The `/install` page gains a "Telemetry" section linking to this document. The Companion's first-run flow does not show a banner — disclosure is via documentation. If we ever expand the schema, the schema change ships with an updated `/install` page in the same release and a status-chip toast indicating "Telemetry schema updated — review on /install".

## Risk register

| Risk | Mitigation |
|------|------------|
| Schema creep — someone adds a field without updating this doc | Backend handler validates against a checked-in JSON schema; PR template asks "does this change the RUM schema? if yes, update [perf docs] and [privacy review]". CI grep gate fails the PR if `companion_rum_schema.json` changed without `rum-privacy-review.md` changing. |
| Aggregation that re-identifies a player | Hourly buckets only retain `page_kind × version` granularity; no per-player breakdown is possible from the persisted aggregates. |
| Beacon abuse (a malicious browser POSTs garbage) | Rate limit at 1 req / min / IP via the existing `rate_limiter` singleton in `api/auth.py`; schema validation rejects malformed payloads; nginx fronting absorbs flood. |
| Backend log retention longer than agreed | Migration `companion_rum` table has an `ON DELETE` trigger that prunes rows older than 30 days via a daily APScheduler job. |
| Players who don't read documentation | They are exposed to the same data ranges as documented opt-ins. Because we collect zero PII, the impact of "didn't read" is bounded — they share anonymous timings. If the opt-out toggle is in the status chip (Sprint 1), the affordance is one click away during normal use. |

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Author | Claude (this session) | 2026-05-17 | — |
| Approver | Paweł Orzech (TM Hub maintainer) | ____________ | ____________ |

After sign-off:

1. Backend flag `rum_enabled` flipped from `false` to gradual ramp via `/api/extension/feature-flags` admin.
2. Telemetry section published on `/install`.
3. Sprint 1 status-chip toggle added.
