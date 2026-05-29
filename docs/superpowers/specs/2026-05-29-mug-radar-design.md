# Mug Radar — Design

**Date:** 2026-05-29
**Status:** Approved (scope) — pending spec review
**Surface:** Browser extension overlay (`extension/`) + backend mug-score
**TOS posture:** Info/assist only. Extension talks ONLY to `hub.tri.ovh` (never Torn API directly), pooled keys server-side under 100 req/min. No auto-actions. Mirrors the Phase-1 OFF-LIMITS posture.

---

## 1. Goal

Help the player find and hit profitable mug targets faster, by scoring candidates and surfacing a one-click "Mug" action where the player actually fights (torn.com pages). The player always clicks Mug themselves — the tool only ranks, highlights, and alerts.

**Non-goal:** automating the attack. No auto-click, no headless bot, no auto-refresh-and-attack. Those get accounts permabanned and are explicitly out of scope.

## 2. Reality constraints (designed around, not wished away)

- **Cash-on-hand is hidden.** Torn API does not expose another player's cash-on-hand, bank, poker state, or "just won at poker." Every money signal here is a **proxy**, surfaced as a confidence-tagged estimate — never asserted as fact.
- **Poker camping is low-yield.** Other players' poker state is only readable by DOM-scraping the poker page *while seated at the table*. Winners commonly self-hospitalize before standing → unmuggable. So the poker overlay is an **assist** (FF chip + quick-attack link + "left table" toast), explicitly not a money printer. UI copy states this.
- **Mugging reduction.** Re-mugging the same player too soon yields diminishing returns. The tool tracks the player's own mug history to enforce a cooldown (~15h) and avoid wasted energy.

## 3. Mug-score signals

`mug_score(player)` combines six signals into a 0–100 score with a transparent breakdown (each page shows *why* a target scored high — per the project's "explain, don't just display" philosophy):

| # | Signal | Source | Notes |
|---|--------|--------|-------|
| 1 | Winnability (FF/threat) | `api/ff.py`, `api/threat.py`, `stat_estimator.py` | Filters out bait / stat-whores. Low FF or threat≫you → score floored. |
| 2 | Estimated $ (proxy) | net worth tier, property type (Island/Castle/Palace), travel (Cayman/SA), casino activity (personalstats) | Confidence-tagged. Higher money signals → higher score. |
| 3 | Availability now | hospital status, last-action (online/idle), travel/abroad | Hittable-right-now floats to top; hospitalized/abroad sinks. |
| 4 | Anti-reduction timing | new `mug_log` repo | Hides a player for ~15h after the player mugs them. |
| 5 | Fresh-cash from trade | new `recent_trades` repo | When the player buys from someone's bazaar/item market, that seller gets a time-decaying boost ("just received your cash"). 100% reliable — derived from the player's own action. |
| 6 | Poker-leave | `poker-overlay.ts` (DOM) | Big-stack flag at the table + "stood up" event. Assist-grade, caveated. |

Scoring lives in a **pure function** `api/mug_score.py` (mirrors `threat.py`) so it is unit-testable with canned inputs and has no I/O.

## 4. Target sourcing — auto-discovery

A scheduler job (modeled on the existing spy-refresh / circulation jobs) maintains a candidate pool from sources TM Hub already ingests:

- Travel feed → players heading to/from Cayman & South Africa
- Item-market / bazaar → inactive sellers of high-value items
- Bounties router → bounty targets
- The player's own recent attack history

Candidates are scored and cached; `GET /api/mug/candidates` returns the ranked list. Auto-discovery is additive to (not a replacement for) the existing manual `/targets` list — manual targets are also scored.

## 5. Architecture

### 5.1 Backend (`api/`)

Follows existing patterns: module-level router state injection (wired in BOTH `main.py` lifespan AND test fixtures), `BaseRepository` (fresh `sqlite3.connect()` per call, WAL), numbered SQL migration, APScheduler job.

- **`api/mug_score.py`** — pure scoring function + signal weights. No I/O. Fully unit-tested.
- **`api/routers/mug.py`** — new router, prefix `/api/mug`:
  - `GET /api/mug/candidates` — ranked auto-discovered list (+ scored manual targets).
  - `GET /api/mug/score/{player_id}` — single-player score + breakdown, for per-profile overlay lookups.
  - `POST /api/mug/interaction` — register a fresh-cash event `{player_id, kind: "trade", source}`.
  - `POST /api/mug/logged` — register that the player mugged `{player_id}` (drives anti-reduction cooldown).
  - All gated by existing middleware auth (`X-Player-Id` + JWT). Member-only via `key_store.has_key`.
- **`api/db/migrations/054_mug_radar.sql`** — two tables:
  - `mug_log(id, owner_player_id, target_player_id, mugged_at)` — anti-reduction.
  - `recent_trades(id, owner_player_id, seller_player_id, kind, source, created_at)` — fresh-cash, time-decayed in scoring.
- **`api/db/repos/mug.py`** — `MugRepository` (BaseRepository): `log_mug`, `recent_mug_at`, `add_trade`, `recent_trades_for`. Plus reuse `TargetRepository`, `StakeoutRepository`.
- **`api/scheduler/`** — new `mug_candidates` job refreshing the candidate pool (interval ~5–15min; leader-elected via existing Redis pattern). Reuses travel/imarket/bounties data already pulled.

### 5.2 Extension (`extension/src/inject/`)

New inject modules, same shape as existing overlays (`ff-chip.ts`, `hospital-overlay.ts`, `profile-badges.ts`), fetching from `hub.tri.ovh` via the existing GM-stored extension JWT — never Torn API directly.

- **`mug-overlay.ts`** — on profile / attack / faction-roster / item-market pages: render a mug-score chip (color-coded) + a score-breakdown tooltip + a one-click **Mug** deep-link (opens Torn's own attack page; player clicks Mug). Looks up `/api/mug/score/{id}`.
- **`poker-overlay.ts`** — on the poker page while seated: FF chip + quick-attack link beside each opponent, big-stack flag, and a toast "**X stood up — mug?**" with a one-click attack link when a seat empties (DOM diff, no extra polling beyond the page's own live updates). Copy includes the med-out caveat. No auto-attack.
- **Hosp-out alert** — extend `stakeout` + `hospital-overlay`: toast when a stakeout/target leaves hospital, with quick-attack link.

### 5.3 Data flow

```
torn.com page  --(GM fetch, JWT)-->  hub.tri.ovh /api/mug/*  -->  mug_score.py
     ^                                      |                         ^
     |  chip / toast / quick-link           |  candidates cache       |  ff/threat/spy/travel/imarket/bounties
     +--------------------------------------+  (scheduler job) --------+
player clicks Mug on Torn's native attack page (tool never attacks)
```

## 6. Error handling & states

- Backend unreachable / token expired → overlay degrades silently to no chip (never blocks the Torn page); re-auth banner reused from Phase 1.
- Missing spy/stat data → score returns with lowered confidence + "estimated" tag, never a fabricated number.
- Rate limits → reuse the shared `rate_limiter` singleton (`api/auth.py`), no per-module limiter.
- Poker DOM shape changes → overlay no-ops gracefully (wrapped, logged), never throws into the page.

## 7. Testing

- **`api/mug_score.py`** — unit tests with canned signal inputs (high-$ easy target, bait/stat-whore, hospitalized, on-cooldown, fresh-trade boost decay). Pattern: `tests/test_threat.py`.
- **`api/routers/mug.py`** — route tests with mocked `TornClient._http` + injected repos in fixtures. Pattern: `tests/test_routes.py`.
- **Migration** — applied by `runner.py` on a temp DB in test setup.
- **Extension** — vitest unit tests for `mug-overlay` / `poker-overlay` DOM parsing + render (pattern: existing `*-overlay.test.ts` like `hospital-overlay.test.ts`). `npm run typecheck` + `npm run build`.
- **Manual** — mandatory post-deploy Playwright walkthrough per CLAUDE.md, plus a live torn.com check of the overlays (build is mocked; v2 shape mismatches only show live).

## 8. Out of scope (explicit)

- Auto-mug / auto-click / auto-refresh-and-attack — banned, not built.
- Calling Torn API directly from the extension.
- Any claim of exact cash-on-hand. Proxies only, always labeled.

## 9. Versioning

Minor bump in `frontend/src/data/changelog.ts` (`feat`), e.g. `Mug Radar — ranked mug targets with one-click attack on torn.com`, with a short player-facing `detail`.
