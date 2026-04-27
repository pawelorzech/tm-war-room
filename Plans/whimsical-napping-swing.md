# Stats / compare / dashboard / awards — empty-state copy + leaderboard render mismatch

## Context

User: "oraz 'No stat snapshots yet. Data starts collecting after you register your API key. Snapshots are taken daily at 4:00 UTC.' powinno to działać nie tylko na moim kluczu, ale na innych ludzi też. jakieś dziwne rzeczy, że nie widzę tych danych"

Po doprecyzowaniu (AskUserQuestion):
- **Co widzi:** "Leaderboard jest pusty — tylko mój profil." (scenariusz B)
- **Zakres fixu:** walkthrough wszystkich empty-state messages w aplikacji.
- **Strony do sprawdzenia:** /stats, /compare, /dashboard, /awards.

To zmienia plan — nie wystarczy poprawić komunikat. Najpierw musimy zrozumieć, dlaczego user widzi pusty leaderboard, mimo że ad-hoc API probe (z jego cookies, w Playwrighcie) zwraca pełną listę z dzisiejszą datą.

## Investigation findings (Phase 1)

### Backend (sprawdzone read-only, prod)

- `GET /api/stats/snapshots/2362436` → 31 snapshots, najnowszy `2026-04-27` (dzisiaj).
- `GET /api/stats/leaderboard` → `{ members: [{ player_id: 889354, player_name: "Steven", total: 10_528_549_517, ... }, ...], count }` — pełny leaderboard z dzisiejszą datą.
- `GET /api/stats/growth-leaderboard?days=30` → analogicznie, growth dla każdego gracza.
- `api/scheduler/jobs/collect_stats.py:47` używa `key_repo.get_all_keys()` → iteruje wszystkich.
- `api/scheduler/engine.py:49-53` → `IntervalTrigger(minutes=15)` (NIE codziennie o 4:00 UTC).

### Frontend (`frontend/src/app/stats/page.tsx`)

- linia 92-97: `api.statLeaderboard().catch(...)` → `setLeaderboard(lbRes.members || [])` — schema się zgadza.
- linia 113: header mówi "Data refreshed every 15 minutes" — poprawne.
- linia 135: empty-state: `<p>No stat snapshots yet. Data starts collecting after you register your API key.</p>` — komunikat **stały**, nie kontekstowy.
- linia 171: `{(leaderboard.length > 0 || growthLb.length > 0) && (` — leaderboard renderuje się TYLKO gdy ≥1 z nich ma dane.
- **Mój probe pokazał że API zwraca dane**, więc dlaczego user widzi pusty? Moje hipotezy:
  - **(i)** User ma stary build w cache (service worker, localStorage flag). Reload bez cache rozwiąże.
  - **(ii)** Render race — `loadStats` ustawia stan synchronicznie po `Promise.all`, ale jakiś `useEffect` resetuje?
  - **(iii)** Jakiś filtr w UI: `growthLb` skoro `growthDays` jest `undefined` na starcie, `?days=undefined` może nie wracać poprawnie. Sprawdzić default value.
  - **(iv)** `selectedPlayer` ustawia się na ID który NIE ma danych → `loadStats` ładuje, ale leaderboard też przechodzi przez ten sam `loadStats` więc powinien się wczytać niezależnie. Trzeba zweryfikować Playwright-em w **świeżej sesji**.

### Mobile Lighthouse — context (osobno; out-of-scope dla tego planu, zapiszę do baseline po exit)

5 stron (dashboard / team / chain / training / stocks): wszystkie 96-97/100, LCP 2.4-2.5s, TBT 20-30ms. **Site jest super szybko.** Cloudflare/ISR — diminishing returns.

## Diagnostic phase (do zrobienia w implementation)

**Pierwsze 5 minut implementation = live Playwright diagnostic na świeżej sesji** (po zalogowaniu z czystym storage):

1. Otworzyć /stats jako Bombel (świeże logowanie, czysty cache).
2. Sprawdzić w DevTools `Network`: czy `/api/stats/leaderboard` faktycznie ładuje się i zwraca `members: [...]` (jeśli pusty zwrot → backend issue, ale mój probe zaprzeczył temu).
3. Sprawdzić `console.log(leaderboard)` po `loadStats()` — czy state się ustawia poprawnie.
4. Sprawdzić DOM: `document.querySelector('[class*=leaderboard]')` lub `text=Steven` — czy renderuje się.

Jeśli leaderboard renderuje się w Playwrighcie ale user mówi że nie → user ma stary build w cache → fix to **bumpować service-worker version** (`CACHE_NAME` w `public/sw.js`) + dodać note w changelogu "if blank, hard-refresh".

Jeśli leaderboard NIE renderuje się w Playwrighcie nawet na świeżej sesji → real frontend bug. Wtedy patrzymy na `useState` flow w stats/page.tsx i ewentualnie `growthDays` default.

## Audit findings — empty-state copy w 4 stronach (static grep)

Do uruchomienia w pierwszym kroku implementation:

```bash
grep -nE "register your API key|register your key|No (stat |snapshots|data)|4:00 UTC|4 AM UTC|daily at|yet\." \
  frontend/src/app/stats/page.tsx \
  frontend/src/app/compare/page.tsx \
  frontend/src/app/dashboard/page.tsx \
  frontend/src/app/awards/page.tsx \
  frontend/src/components/layout/PageExplainer.tsx \
  frontend/src/data/changelog.ts
```

Znane już z Phase 1:
- `frontend/src/app/stats/page.tsx:135` — "No stat snapshots yet. Data starts collecting after you register your API key."
- Twierdzenie usera o "Snapshots are taken daily at 4:00 UTC" — w `page.tsx:135` go nie widzę. Może w PageExplainer dla /stats. **Zweryfikować grepem.** Jeśli istnieje — usunąć/poprawić wszędzie.

Reszta (compare/dashboard/awards) — będzie wynikiem grepa w pierwszym kroku.

## Proposed changes

**Pliki do modyfikacji** (po dokładnym audycie grepa):

1. **`frontend/src/app/stats/page.tsx`**
   - Linia 135: kontekstowy komunikat empty-state. Self vs other:
     - `currentPid === playerId` → "You don't have any stat snapshots yet. Stats refresh every 15 minutes for members who registered their API key. If you registered today, the first snapshot lands within 15 minutes."
     - `currentPid !== playerId` → wybierz `player_name` z leaderboard fallback `String(currentPid)`. "{player_name} doesn't have stat snapshots yet — only members who registered their API key in TM Hub appear here. Once they register, snapshots refresh every 15 minutes."
   - Wszelkie wzmianki "4:00 UTC" / "daily at" → wymienić na "every 15 minutes" lub usunąć.
   - **Bonus discoverability:** w nagłówku leaderboardu dodać meta `"{N} of {M} members tracked"` — wymaga `/api/team` count + `members.length` lokalnie. (Jeśli user chce — ja proponuję włączyć, bo "scenariusz B" usera może być właśnie z powodu, że nie wie że istnieje pełny leaderboard i widzi tylko jeden tab.)

2. **`frontend/src/app/compare/page.tsx`** — empty state (jeśli istnieje), jakie komunikaty pokazują się gdy spy estimate brak. Np. "No spy data" → "No spy data for {player}. We pull from TornStats and YATA when available — if neither has it, you can still see basic profile info."

3. **`frontend/src/app/dashboard/page.tsx`** — analogicznie, każdy "no data" / "yet" / "register" message audyt + uściślenie.

4. **`frontend/src/app/awards/page.tsx`** — analogicznie. `awards/page.tsx` ma CirculationChart która też ma pusty stan.

5. **`frontend/src/components/layout/PageExplainer.tsx`** — szukam "4:00 UTC", inne falsehoods, twardo zakodowane stringi które warto uściślić.

6. **`frontend/src/data/changelog.ts`** — bump 1.15.2 → 1.15.3, entry coverage:
   - "Empty-state messages on /stats, /compare, /dashboard and /awards no longer mislead — they tell you exactly which player and which data are missing."
   - "Removed incorrect '4:00 UTC' schedule note — stat snapshots actually refresh every 15 minutes."

7. **`frontend/public/sw.js`** — jeśli diagnostic pokaże że to cache issue, bumpować `CACHE_NAME` z `tm-hub-shell-v1` na `tm-hub-shell-v2`. Aktywuje cleanup starego cache na każdym świeżym SW.

**Out of scope dla tego planu** (oddzielne taski):
- Zbieranie statystyk graczy bez własnego klucza — Torn API `personalstats` wymaga klucza danego gracza. Nie da się fundamentalnie.
- Pagination/filtry leaderboardu (Sprint 2 #15).
- Cloudflare/Glitchtip — bonus tasks.

## Verification

1. **Static check (audit complete):** `grep -nE "register your API key|4:00 UTC|daily at" frontend/src/` → 0 wystąpień po fixach.
2. **Build:** `cd frontend && npm run build` → green.
3. **Local visual:** `npm run dev`, login jako Bombel, otworzyć /stats:
   - Hard reload (Cmd+Shift+R) → SW cache czysty.
   - Czy widać leaderboard z Stevenem itd.? (To powtarza scenariusz B.)
   - Klikać kolejnych graczy z leaderboardu → komunikat empty-state ma kontekstowy ich `player_name`.
4. **Post-deploy:** Playwright na prod /stats → przeklikać 3 graczy → screenshot każdego empty-state. Brak "4:00 UTC" w żadnym pop-upie/explainerze.
5. **Pełny test suite:** `uv run pytest tests/` → 516 passed (zmiany frontend-only).
6. **Sanity sweep CLAUDE.md mandatory:** /dashboard, /team, /chain, /awards, /market, /loot, /stocks, /bounties — load + console no errors.

## Risk

- **Niski:** wszystkie zmiany frontend-only, łatwy rollback (revert commit).
- **Diagnostyka cache:** jeśli okaże się, że problem usera to stary build w SW, fix to bump `CACHE_NAME`. Przy następnym wejściu user dostanie świeży build (network-first dla HTML, cache-first dla static — i tak działa, ale SW może serwować stary `index.html` przed siecią). Bump cache version wymusza re-cache.

## Critical files (read first w implementation)

- `frontend/src/app/stats/page.tsx` (cały, ale szczególnie linie 60-150)
- `frontend/src/app/compare/page.tsx`
- `frontend/src/app/dashboard/page.tsx`
- `frontend/src/app/awards/page.tsx`
- `frontend/src/components/layout/PageExplainer.tsx`
- `frontend/public/sw.js`
- `frontend/src/lib/api-client.ts` (linie 296-299 — stat API contract)
- `frontend/src/data/changelog.ts`

## Order of work

1. **Diagnostic** (5 min) — Playwright fresh session na /stats.
2. **Audit** (5 min) — grep 4 stron + PageExplainer za known antipatterns.
3. **Fix /stats empty-state copy** + ewentualny SW bump (15 min).
4. **Fix /compare, /dashboard, /awards** — per-page empty-state copy (15 min).
5. **Bonus: tracked X/Y members badge** w /stats (10 min, opcjonalne).
6. **Build + tests + commit + push** (5 min).
7. **Post-deploy verify** (10 min).
8. **Update changelog 1.15.3** + memory entry "stats UX fix".

Total ETA ~70 min. Wszystko w jednym commicie żeby user miał spójny experience od razu po deploy.
