# Torn flight durations (reference)

This table is the source-of-truth for one-way flight times in TM Hub. The
scheduler's flight-tracker job (`api/scheduler/jobs/flights.py`) uses it for
two things:

1. **Predict landing time** as soon as a departure is detected (`departed_at +
   duration`). Surfaced to the UI via `/api/flights/active`.
2. **Classify ticket class on landing.** Travel-agency UI only exposes the
   class on the player's own profile — for tracked enemies/teammates we infer
   it from the observed `landed_at - departed_at`, picking the closest match
   among `standard / business / wlt`. A duration meaningfully below the
   business value indicates a one-shot "Torn book" travel and is recorded as
   `"book"`.

## Source

Values were transcribed from the in-game **Travel Agency** UI on 2026-05.
They match the public Torn Wiki page _Foreign travel_ (revision 2024-12+),
which itself was crowd-sourced from the same UI. Torn has not changed these
numbers since the introduction of Wind Lines Tickets (WLT) in 2018.

If Torn ever changes a duration, the symptom will be `flights_tick` classifying
landings as the wrong ticket class. Re-measure the in-game value, update this
table, and update `FLIGHT_DURATIONS_SECONDS` in `api/flights.py` in the same
commit.

## Durations (one-way, seconds)

The `WLT` column is **Wind Lines Tickets** — a subscription tier that takes
60 % of the standard duration (slower than business at 50 % but cheaper to
sustain). Note that for every destination `business < WLT < standard`, so
business is in fact the fastest paid option. The `book` class is the
one-shot Torn book item; its duration matches business exactly today
(treated by the classifier as `business`).

| Destination       | Standard | Business | WLT   |
| ----------------- | -------: | -------: | ----: |
| Mexico            |    1 560 |      780 |   936 |
| Cayman Islands    |    2 100 |    1 050 | 1 260 |
| Canada            |    2 460 |    1 230 | 1 476 |
| Hawaii            |    8 100 |    4 050 | 4 860 |
| United Kingdom    |    9 540 |    4 770 | 5 724 |
| Argentina         |   10 500 |    5 250 | 6 300 |
| Switzerland       |   10 800 |    5 400 | 6 480 |
| Japan             |   13 500 |    6 750 | 8 100 |
| China             |   14 400 |    7 200 | 8 640 |
| UAE               |   16 200 |    8 100 | 9 720 |
| South Africa      |   17 820 |    8 910 |10 692 |

## Classifier note

`classify_ticket_class` picks the nearest of `standard / business / wlt` by
absolute delta against the observed duration. The `"book"` sentinel only
fires when the observed duration is **shorter than the fastest legitimate
option by more than 60 s** — today that can't happen organically (business
is the floor), so a `"book"` row in the DB is a signal that either Torn
introduced a faster mode or our tracker glitched. Either way: investigate.

The destination key used in code is the lowercased English country name with
underscores: `mexico`, `cayman_islands`, `canada`, `hawaii`,
`united_kingdom`, `argentina`, `switzerland`, `japan`, `china`, `uae`,
`south_africa`. Aliases (e.g. `uk` → `united_kingdom`, `cayman` →
`cayman_islands`) are resolved by `_normalize_destination()` in
`api/flights.py` so we tolerate whatever the Torn status string spells.
