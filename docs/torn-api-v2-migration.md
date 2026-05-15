# Torn API v1 → v2 migration — current state and backlog

**Last updated:** 2026-05-15 (after 1.31.0–1.31.2 ship + two hotfixes)

If you are an agent picking this up, read this whole file before touching `api/torn_client.py` or any other place that calls Torn's REST API. The shape mismatches documented below are not in the public Torn docs — we found them with empirical probes against the live v2 API. Skipping that step cost us two production hotfixes; please don't repeat it.

---

## TL;DR

- Torn API **v1 is frozen** (no new features) but **not sunset**. Everything on v1 still works as of the date above.
- v2 is the active surface — it gets new fields and new endpoints — but Torn rebuilt several selections with **incompatible shapes** vs v1.
- Our codebase is currently a deliberate mix: v2 where the shape is compatible (or where the selection is v2-only), v1 everywhere a v2 shape change would break a consumer. Each fallback has an inline `# NB: v1 because ...` comment naming the exact mismatch.
- New v2-only capabilities we *do* use today: `key/info`, `faction/news` (full categories), `torn/itemstats`, plus all the `faction/*` selections that were v2 from day one (`members`, `attacks`, `chain`, `revives`, `crimes`, `news`, `wars`, `info`).

The `V1_BASE` comment at the top of `api/torn_client.py` carries the same list. Keep both in sync if you migrate something.

---

## What currently uses v2 (and why it works)

These selections either match v1's shape exactly or never had a v1 equivalent:

| Selection                            | Caller                                     | Shape notes                                                                 |
| ------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------- |
| `/v2/faction/members`                | `fetch_members`                            | Was v2 from day one. Returns a list.                                        |
| `/v2/faction/?selections=wars`       | `fetch_war`, `fetch_war_history`           | v2 from day one.                                                            |
| `/v2/faction/?selections=chain`      | `fetch_chain`                              | v2 from day one.                                                            |
| `/v2/faction/?selections=revives`    | `fetch_faction_revives`                    | v2 from day one.                                                            |
| `/v2/faction/{id}?selections=members`| `fetch_enemy_members`                      | v2 from day one.                                                            |
| `/v2/faction/{id}`                   | `fetch_faction_info`                       | v2 from day one — reads `basic.*`.                                          |
| `/v2/faction/crimes?cat=…`           | `fetch_faction_crimes`                     | v2 OC endpoint.                                                             |
| `/v2/faction/news?cat=…`             | `fetch_armoury_deposits`, `fetch_faction_news` | v2 only. 9 categories; we expose all of them via `/api/faction/news`.   |
| `/v2/torn?selections=bounties`       | `fetch_bounties`                           | v2 from day one. Returns either list or dict — handled both.                |
| `/v2/torn/?selections=companies`     | `fetch_company_catalog`                    | v2 returns dict keyed by id, **same shape as v1** — verified 2026-05-15.    |
| `/v2/torn/itemstats?id=…`            | `fetch_item_stats`                         | v2 only. Wrap is `{itemstats: {...}}`.                                      |
| `/v2/key/info`                       | `fetch_key_info`                           | v2 only. Wrap is `{info: {access, selections, user}}` — the outer `info` key tripped us up on 1.31.0. |

---

## What stays on v1 (and the exact shape mismatch)

If you migrate one of these, you must update the consumer's parsing logic at the same time, or you'll see the same 500s we did.

| Selection                                | Caller(s)                                                                         | v1 shape (what consumers expect)                                              | v2 shape (what would break things)                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `user/?selections=bars,cooldowns`        | `fetch_member_bars`                                                               | top-level `energy/nerve/happy/life/chain/cooldowns/server_time`               | nested under `bars: {...}`                                                            |
| `user/?selections=profile`               | `main.py` (registration, /api/me-like), `admin.py`, `refresh_data`, `refresh_avatars`, `spy.py` | top-level `name/player_id/faction/status/last_action/profile_image/level/age` | nested under `profile: {...}` — top-level keys are gone                              |
| `user/?selections=personalstats`         | `fetch_personalstats`, `fetch_user_profile_stats`, `fetch_training_data`, `fetch_user_honors`, `collect_stats._fetch_extended_personalstats`, `routers/spy.py` | flat dict keyed by short names (`xantaken`, `attackswon`, …) | **categorized** — `personalstats.attacking.attacks_won`, etc. Different field names too. |
| `user/?selections=stocks`                | `fetch_user_stocks`, `main.py` key registration test                              | dict keyed by stock_id with `total_shares`, `dividend`, `transactions{}`      | **list** with `{id, shares, transactions[], bonus}` — transactions also become a list |
| `torn/?selections=stocks`                | `fetch_stock_market`                                                              | dict keyed by stock id                                                        | **list** of stock objects with `market.{price, cap, shares}` nested                  |
| `torn/?selections=honors,medals`         | `fetch_honor_catalog`                                                             | two dicts keyed by id, each entry has flat `circulation`/`name`/`description` | **lists** of honors/medals objects — `collect_circulation` iterates `.items()`        |
| `torn/?selections=items`                 | `routers/market.py`, `routers/stocks.py`, `routers/travel.py`, `scheduler/refresh_data.py` | dict keyed by item id with **flat** `market_value`, `buy_price`, `sell_price` | **list** of items with `value: {buy_price, sell_price, market_price}` nested. `market_value` renamed to `value.market_price`. |
| `torn/?selections=rankedwars`            | `fetch_ranked_wars`                                                               | dict of rankedwar objects                                                     | **returns `{error: ...}`** in v2 — endpoint not exposed there                        |
| `/company/{id}?selections=detailed/employees/applications/stock/news` | `_fetch_company_selection` (director endpoints) | flat fields                                                              | v2 has a different routing model (`/company/lookup`, `/company/employees` etc.) — needs its own refactor |

---

## How to migrate one of these safely

The two hotfixes (1.31.1, 1.31.2) showed exactly what fails when you don't probe first. The recipe that worked the third time:

1. **Probe v1 vs v2 shape with a real key.** Bombel's key is in the agent memory note `torn-account.md` — never commit it. A throwaway browser console snippet works:
   ```js
   const v1 = await fetch('https://api.torn.com/torn/?selections=stocks&key=YOUR_KEY').then(r => r.json());
   const v2 = await fetch('https://api.torn.com/v2/torn/?selections=stocks&key=YOUR_KEY').then(r => r.json());
   console.log({ v1_keys: Object.keys(v1), v1_stocks_type: Array.isArray(v1.stocks) ? 'array' : 'dict',
                 v2_keys: Object.keys(v2), v2_stocks_type: Array.isArray(v2.stocks) ? 'array' : 'dict' });
   ```
2. **Diff the shapes.** Look for: array-vs-dict, nesting (`top.field` → `top.parent.field`), renamed fields (`market_value` → `value.market_price`), missing fields, wrapped responses (`{info: {access: …}}` — the bug that gave us 502 on key/info).
3. **Update consumers FIRST.** Change every reader to use the v2 shape with a fallback to v1, or write a normalizer at the boundary. Tests are mocked and won't catch shape mismatches — **deploy and walk through the UI**.
4. **Flip the URL.** Then change `V1_BASE` → `V2_BASE` (and the log integration string).
5. **Walk through the UI under playwright.** Hit the affected page, check the network panel and console for 500s. **In addition to manual probing, now also run `scripts/probe_torn_shapes.py diff`** (see "Validating mocks against the live API" below) — that script catches shape drift automatically against captured fixtures.

If the shape diff is large enough that a normalizer would dwarf the URL change, just leave it on v1 and document why in the inline comment.

---

## Validating mocks against the live API

We have a helper at `scripts/probe_torn_shapes.py` (added after the 1.31.x hotfix cycle) that captures live Torn responses as sanitized JSON fixtures, then lets us detect drift before it bites prod. Use it whenever you're about to flip a URL v1↔v2, or when a Torn API release note suggests they changed something.

```bash
# One-time setup or re-capture: hit live API for ~12 selections,
# sanitize (mask player IDs, names, monetary values), write to
# tests/fixtures/torn/*.json. Safe to commit — values are placeholders.
TORN_API_KEY=$(grep "API Key:" ~/.claude/projects/-Users-pawelorzech-Documents-Obsidian-Vault/memory/torn-account.md | awk '{print $NF}') \
  uv run python scripts/probe_torn_shapes.py capture

# Before flipping a URL: compare current fixtures vs fresh live responses.
# Exit 1 = shape drift detected (field added / removed / type changed / dict↔list).
TORN_API_KEY=... uv run python scripts/probe_torn_shapes.py diff

# After a migration: check whether hand-written FAKE_* mocks in
# tests/test_torn_client.py still match the live shape. No network call.
uv run python scripts/probe_torn_shapes.py audit-fakes
```

When `diff` reports drift:
- **drift on a v1 fixture** → Torn changed v1 (rare, since v1 is frozen). Update the fixture, re-run the test suite. If a test broke, that's a real consumer that needs a fix.
- **drift on a v2 fixture** → Torn evolved v2 (common — new fields, new endpoints). Update the fixture; this is informational.
- **dict↔list change on v2** → Torn rebuilt the selection. Do NOT migrate until you've written a normalizer.

The 3 v1-fallback selections with named regression tests are: `fetch_stock_market` (`torn/stocks`), `fetch_user_stocks` (`user/stocks`), `fetch_honor_catalog` (`torn/honors,medals`). Each asserts on V1_BASE URL + v1 shape — if someone tries to flip them to v2, the test fails with an explanatory message rather than silently passing.

---

## What's worth tackling next (priority backlog)

Roughly in order of effort × value:

1. **`user/personalstats` v2 (categorized parser).** This blocks five callers and is needed for any future Spy/Threat-related v2 work. Add a `_normalize_personalstats(raw)` function that detects flat vs categorized and returns a flat dict, then flip URLs.
2. **`torn/items` v2.** ~1480 items; v2 has richer data (`value.vendor.country/name`, `details.base_stats`, `is_tradable`, `is_found_in_city`). Worth migrating once we want the new fields — touches 4 call sites.
3. **`torn/stocks` v2.** v2 returns richer `market: {price, cap, shares, investors}` and `bonus` info — could improve `/stocks` UI. Migration is straightforward (list iteration + field rename).
4. **`user/stocks` v2.** Needed if we want richer per-transaction history (v2 transactions have explicit `id` + timestamp). Touches `fetch_user_stocks` + portfolio router.
5. **New v2 features we don't use yet** (each is a separate feature, not a migration):
   - Raids (`faction/raids`, `faction/raidreport`, `torn/raids`)
   - Racing (`/v2/racing/*`, `user/races`)
   - `faction/contributors` — per-chain/war breakdown for `/awards`
   - `torn/rackets` — racket ownership map
   - `torn/factiontree`, `torn/territory` — educational pages
   - `user/weaponexp`, `user/workstats`, `user/hof` — combat optimizer / HoF widget
6. **`torn/rankedwars` v2.** Currently 404s in v2 — wait for Torn to ship it before doing anything.

---

## What is and stays impossible

Torn API is **read-only across both v1 and v2.** No POST/PUT/DELETE. You cannot from REST: launch an attack, accept a revive, place or claim a bounty, send a message, buy/sell on the market, queue training. All "write" actions happen through the companion userscript (session cookies on torn.com). Don't waste time looking for a "send message" endpoint — it isn't on the public roadmap.

---

## Recent history (so context isn't lost)

- **1.30.5 (2026-05-15)** — fixed the user complaint that triggered this whole sweep: `loader.php?sid=attack` → `page.php?sid=attack`. Frontend helper `frontend/src/lib/torn-urls.ts` centralizes attack/profile/stats URLs.
- **1.31.0 (2026-05-15)** — initial v2 sweep, plus four new features (Key Info widget, is_interrupted chain marker, `/news` audit page, `/v2/torn/itemstats` plumbing). Schema migration `044_attack_is_interrupted.sql`.
- **1.31.1 (2026-05-15)** — hotfix 1. Roll back `torn/stocks`, `torn/honors`, `torn/items`, `torn/rankedwars` after empirical probes showed array-vs-dict and renamed-field mismatches. Also fix `/key/info` parser to unwrap the outer `info` key.
- **1.31.2 (2026-05-15)** — hotfix 2. Playwright walkthrough found `/api/stocks/portfolio` 500ing. Probed v2 user/* — all three of `bars`, `profile`, `stocks` had nested-vs-flat or list-vs-dict mismatches. Rolled back all `user/*` callsites to v1.

Commits to grep for if you want the diffs:
- `8950a59 feat: Torn API v2 sweep …`
- `2ddb753 fix: roll back 4 v2 selections …`
- `1160f60 fix: roll back ALL user/* v2 selections …`
