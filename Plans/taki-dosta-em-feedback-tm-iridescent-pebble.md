# TM Hub — feedback batch (2026-04-27)

## Context

Paweł zebrał 9 punktów feedbacku z używania TM Huba. Część to drobne UI-bugi (mobile header bez linku, brakujący wrapper scrolla, zły badge "you"), część to braki funkcjonalne (chart 24h, lokacja itemów, favorites synchronizowane między urządzeniami), a dwa to **prawdziwe regresje produkcyjne**: tabele `stat_snapshots` są puste mimo że job ma działać co 15 min, a UI obiecuje schedule, którego nie ma w kodzie ("daily at 4:00 UTC" — taki cron nie istnieje, jest `IntervalTrigger(minutes=15)` w `api/scheduler/engine.py:50-52`).

Cel: jeden batch zmian który zamyka wszystkie 9 punktów, plus diagnoza dlaczego snapshoty się nie zbierają w prodzie.

---

## Punch list

### 1. "TM Hub" w headerze nie jest linkiem na mobile
- **Plik:** `frontend/src/components/layout/AppShell.tsx:144-149`
- **Stan:** desktop (`Sidebar.tsx:62-68`) już ma `<Link href="/dashboard">`. Mobile renderuje gołe `<span>`.
- **Fix:** zawinąć span w `<Link href="/dashboard">` (1 linijka).

### 2. Tabele w /travel nie scrollują się horyzontalnie na mobile
- **Plik:** `frontend/src/app/travel/page.tsx:296-297`
- **Stan:** rozwijana tabela country items (`<table className="w-full text-sm mt-2">`) nie ma wrappera `overflow-x-auto`. Inne strony (`stats/page.tsx:205`, `market/page.tsx`) używają już tego patternu.
- **Fix:** owinąć tabelę w `<div className="overflow-x-auto">` jak w stats/market.

### 3. "Recent attacks last 24h" — placeholder bez wykresu
- **Plik:** `frontend/src/app/chain/page.tsx:476-514` (`ActivityView`)
- **Stan:** dane (`api.chainTimeline(48)` — godzinne kubełki: hits, respect, wins, losses, active_members) są pobierane, ale renderowane jako ręczne flex-divy z policzoną wysokością. Chart.js setup już istnieje (`@/lib/chartjs-setup`, commit 89d517f), używany m.in. w `components/stats/StatGrowthChart.tsx`.
- **Fix:** zamienić ręczne paski na Chart.js `<Bar>` (lub Line stacked) — datasety hits/wins/losses, labele = godziny. Pattern: kopiuj `StatGrowthChart.tsx`. Zostawić obecny komponent (`ActivityView`) ale przepisać body.

### 4. Top 20 profitable items — oznaczyć "shop vs travel"
- **Plik:** `frontend/src/app/market/page.tsx:165-187` + `api/routers/market.py:40-71`
- **Stan:** backend kesz itemów ma tylko `name`, `type`, `market_value`, `buy_price`, `sell_price`, `circulation`. Nie ma flagi "shop-available" ani "kraju". Dane abroad są w `api/routers/travel.py` (YATA abroad stocks).
- **Decyzja:** w kesz-builderze `ensure_items_cache()` w `market.py` dodać dwa pola:
  - `is_shop` — `True` jeśli `buy_price > 0` (proxy: itemy kupowalne w sklepach mają w Tornie cenę bazową; abroad-only jej nie mają lub mają 0).
  - `country` — opcjonalne, wypełnione jeśli item występuje w kesz-u travel (cross-reference wykonać raz przy budowie kesz-u, nie per request).
- **Frontend:** rozszerzyć interface `MarketItem` w `market/page.tsx:10-20` o `is_shop` + `country`, w tabeli pokazać małą ikonkę 🛒 (shop) albo flagę kraju (np. 🇲🇽).
- **Uwaga:** to wymaga dla pewności sprawdzenia czy proxy `buy_price > 0` jest wystarczające (niektóre abroad-only itemy mogą mieć ustawione `buy_price`). Plan B: zbudować zbiór "abroad item ids" raz dziennie z `travel.py` i flagować przeciwnie. Decyzja w trakcie implementacji po sprawdzeniu próbki w `data/keys.db`.

### 5. Search favorites w DB (sync między urządzeniami)
- **Stan obecny:**
  - `frontend/src/hooks/usePinnedNav.ts:13` — localStorage key `tmhub-pinned-hrefs`, lista hrefów (`["/chain", "/market", ...]`)
  - UI: `BrowseSheet.tsx:158-171` (pin/unpin)
  - Brak czegokolwiek w backendzie — żadnego repo/endpointu favorites
  - Pattern do skopiowania: `api/db/repos/pinned_weeks.py` (już używa `player_id` jako klucza)
- **Założenie:** "favorites" w feedbacku = ten sam mechanizm co pin w nav (potwierdzić z Pawłem podczas review).
- **Plan:**
  1. Migracja `042_user_pinned_navs.sql`: `player_id INTEGER, href TEXT, position INTEGER, created_at`, PK `(player_id, href)`.
  2. `api/db/repos/pinned_navs_repository.py`: `list_for(player_id)`, `set_for(player_id, list[href])` (idempotent replace).
  3. `api/routers/preferences.py` (nowy router) — `GET /api/preferences/pinned-navs`, `PUT` (body: `{hrefs: [...]}`). Auth via X-Player-Id (już w middleware).
  4. Frontend: `usePinnedNav.ts` — przy pierwszym mount fetch z API, merge z localStorage (one-time migration), po update PUT do API. localStorage pozostaje jako cache offline.
  5. Wired w `main.py` lifespan (router state injection wzorem innych routerów).

### 6 + 9. Stat snapshots / energy tracking — puste w prodzie mimo że job ma chodzić
- **Pliki:**
  - `api/scheduler/engine.py:50-52` — `IntervalTrigger(minutes=15)` na `collect_stat_snapshots`
  - `api/scheduler/jobs/collect_stats.py:43-78` — implementacja
  - `api/scheduler/leader.py` — leader election (Redis + file-lock)
  - `frontend/src/app/stats/page.tsx:135` — UI obiecuje "daily at 4:00 UTC" (kłamie — schedule jest 15 min)
- **Hipotezy (do diagnozy w pierwszym kroku, NIE fix-bez-diagnozy):**
  1. **Leader election blokuje** — proces nie jest leaderem, scheduler nie startuje (engine.py:122-131). Trzeba sprawdzić logi prod: czy widać "scheduler started" / "leader acquired"?
  2. **`torn_client` is None w stanie schedulera** — kolejność init w `main.py` lifespan vs scheduler bootstrap. Można sprawdzić poprzez log w pierwszym tick-u.
  3. **`get_all_keys()` zwraca pustą listę w schedulerze** — jeśli scheduler ma własny `KeyStore` z innym połączeniem do DB albo działa zanim klucze są wczytane.
  4. **Cichy exception** — `asyncio.gather(..., return_exceptions=True)` (linia 56) zwraca exceptions jako wartości; trzeba sprawdzić czy są logowane.
- **Plan:**
  1. **Diagnoza (najpierw, czytane z produkcji):** podejść do logów Coolify dla `tm-war-room`, wyfiltrować "collect_stat_snapshots" / "scheduler" / "leader" — ustalić co realnie się dzieje. Wystarczy 5-10 min logów prod.
  2. **Naprawa root-cause** — zależnie od diagnozy. Najczęstsza przyczyna typu "puste mimo że ma chodzić" to leader election (gdy `WEB_CONCURRENCY=2`, drugi worker myśli że jest follower, ale leader nigdy nie startuje schedulera bo crash/init order).
  3. **Logging:** dodać `logger.info(f"collect_stat_snapshots: keys={len(keys)} torn_client={bool(torn_client)}")` na początku jobu — żeby przy następnym pustym backlog-u było natychmiastowo jasne dlaczego.
  4. **UI fix:** zaktualizować tekst w `stats/page.tsx:135` żeby pasował do rzeczywistego schedule (`every 15 min`) ALBO przesunąć schedule na faktycznie raz dziennie 4:00 UTC (do decyzji — Paweł chciałby częściej dla energy tracking, więc 15 min ma sens; tylko UI kłamie).
  5. **Backup snapshotów:** już istnieje encrypted DB backup co 24h (`BACKUP_ENCRYPTION_KEY` w env, opisany w CLAUDE.md). `stat_snapshots` to część `data/keys.db`, więc jest backupowane razem. Nie potrzeba dodatkowego mechanizmu.

### 7. Easter — schowaj po świętach, zachowaj dane jako "2026 event"
- **Pliki:**
  - `frontend/src/data/seasonal-events.ts:36-50` — definicja Easter z zakresem dat (4/1–4/10)
  - `frontend/src/app/stats/page.tsx:60-62, 194, 329-372` — leaderboard "Easter Eggs"
  - `api/db/migrations/008` + `018` — kolumna `easter_eggs` w `stat_snapshots`
  - `frontend/src/components/layout/AppShell.tsx:209` — `SeasonalBanner`
- **Stan danych:** `easter_eggs` jest w każdym snapshocie razem ze statami. Dane są więc już automatycznie "zarchiwizowane" w `stat_snapshots` per dzień, włącznie z backupem encrypted DB. Nic nie trzeba migrować.
- **Plan:**
  1. **Hide po dacie:** `seasonal-events.ts` już ma logikę dat — sprawdzić czy `SeasonalBanner` ją respektuje. Jeśli tak, banner sam zniknie po 4/10. Jeśli nie — dodać warunek `today > endDate`.
  2. **Leaderboard Easter Eggs:** zakładkę "Easter Eggs" w `stats/page.tsx:329-372` schować poza zakresem dat eventu (warunek: pokazuj tylko jeśli `today` mieści się w jakimkolwiek `seasonal-events` z `tracksStat: "easter_eggs"`). Albo prościej: pokazuj tylko jeśli ostatni snapshot ma niezerowy delta na `easter_eggs` w ostatnich 30 dniach.
  3. **Zachowanie danych:** nic do zrobienia — `stat_snapshots` zawiera kolumnę i wartości per dzień. Za rok można odpalić ten sam mechanizm dla nowego eventu, dane 2026 zostaną widoczne w "viewing past snapshot" (lub dedykowanym widoku historycznym jeśli powstanie).
  4. **Generic seasonal slots:** rozważyć (poza scope tego batcha) generyczny `event_season` ale to nadmiar — `easter_eggs` jest w Tornie kolumną w personalstats, więc model 1:1 z grą jest OK.

### 8. Stat growth — "(you)" badge na nie-mnie
- **Plik:** `frontend/src/app/stats/page.tsx:103` (`const currentPid = selectedPlayer || playerId`) i wszystkie checki na linijkach 267, 309, 352 (`m.player_id === currentPid` → renderuje "(you)").
- **Bug:** `currentPid` jest aktualnie zdefiniowane jako "kogo oglądam" (selectedPlayer prioritetowo), ale używane jako "kim jestem". Stąd przy klikaniu innego usera, jego rekord dostaje badge "(you)".
- **Fix:**
  - Zmienić w 267, 309, 352: porównanie z `playerId` (zalogowany), nie z `currentPid`.
  - Dodać oddzielny badge "viewing" / "podgląd" dla `selectedPlayer` ≠ `playerId` w nagłówku karty zawsze (żeby Paweł wiedział że ogląda kogoś innego). 1-2 linie JSX.

---

## Krytyczne pliki do modyfikacji

```
frontend/src/components/layout/AppShell.tsx          # #1 mobile header link
frontend/src/app/travel/page.tsx                     # #2 overflow-x-auto wrapper
frontend/src/app/chain/page.tsx                      # #3 ActivityView → Chart.js
frontend/src/app/market/page.tsx                     # #4 shop/country indicator (UI)
frontend/src/hooks/usePinnedNav.ts                   # #5 favorites sync
frontend/src/components/nav/BrowseSheet.tsx          # #5 (jeśli trzeba zmienić call-site)
frontend/src/app/stats/page.tsx                      # #6 UI text + #8 you-badge + #7 easter tab hide
frontend/src/data/seasonal-events.ts                 # #7 easter date guard

api/routers/market.py                                # #4 add is_shop/country to cache
api/routers/preferences.py    [NEW]                  # #5 favorites endpoint
api/db/repos/pinned_navs_repository.py [NEW]         # #5 repo
api/db/migrations/042_user_pinned_navs.sql [NEW]     # #5 migration
api/scheduler/jobs/collect_stats.py                  # #6 add diagnostic logging
api/main.py                                          # #5 wire new router state
```

---

## Reuse — nie wymyślać na nowo

- **Chart.js**: `frontend/src/components/stats/StatGrowthChart.tsx` (Line + react-chartjs-2 + `@/lib/chartjs-setup`) → wzorzec dla #3.
- **Repo player-scoped**: `api/db/repos/pinned_weeks.py` (`list_for(player_id)`, `.create(... player_id ...)`) → wzorzec dla #5.
- **`overflow-x-auto`**: `frontend/src/app/stats/page.tsx:205` i `frontend/src/app/market/page.tsx` → wzorzec dla #2.
- **Items cache builder**: `api/routers/market.py:ensure_items_cache()` (lines 40-71) → tam dodajemy `is_shop` i `country` zamiast nowego endpointu.
- **Encrypted DB backup**: `BACKUP_ENCRYPTION_KEY` + Backblaze B2 (CLAUDE.md) → już backupuje `stat_snapshots`, nic nie trzeba dodawać dla #6/#9 ani #7.
- **`X-Player-Id` middleware**: `api/main.py:enforce_api_auth` — już zwalnia z auth tylko `PUBLIC_API_PATHS`; nowy `/api/preferences/*` automatycznie wpada pod auth, nic nie trzeba ustawiać.

---

## Kolejność (zalecana — od najtańszego do najdroższego)

1. **#1 + #2 + #8** — proste UI fixy (jeden commit, ~30 linii zmian łącznie).
2. **#7 (easter hide)** — guard po dacie w seasonal-events i hide leaderboard.
3. **#6/#9 diagnoza** — zerknąć w logi prod **zanim** cokolwiek zmieniamy. Bez tego nie wiemy co naprawiać.
4. **#6/#9 fix** — naprawić root cause + dodać logging + sync UI text.
5. **#3 chart** — niezależny, średnia złożoność.
6. **#4 shop vs travel** — wymaga sprawdzenia próbki danych co jest dobrym proxy (`buy_price > 0` vs cross-reference travel).
7. **#5 favorites DB** — największy: migracja + repo + router + frontend hook + one-time localStorage→API migration.

---

## Weryfikacja end-to-end

```bash
# Backend tests
uv run pytest tests/ -v

# Frontend build (static export — to jest "test")
cd frontend && npm run build

# Lokalna walidacja konkretnych fixów
cd frontend && npm run dev
# 1. otworzyć /dashboard na mobile (devtools mobile mode) → klik "TM Hub" → /dashboard ✓
# 2. /travel → rozwinąć kraj → tabela items powinna scrollować się horyzontalnie ✓
# 3. /chain → "Recent activity" → bar chart Chart.js zamiast manualnych divów ✓
# 4. /market → top 20 → kolumna z 🛒 lub 🇲🇽 ✓
# 5. /search (Cmd+K) → favorites na górze; pinnij coś → wyloguj → zaloguj na innym browserze → favorites zachowane ✓
# 6. Admin → Collect Stats → po 2x odpaleniu /stats pokazuje energy delta. W logach: "collect_stat_snapshots: keys=N" ✓
# 7. /stats → tab "Easter Eggs" niewidoczny (poza zakresem dat) ✓
# 8. /stats → klik na innego usera → brak "(you)" przy nim, "viewing" badge widoczny ✓

# Po deploy: MANDATORY browser walkthrough hub.tri.ovh (z CLAUDE.md):
# /dashboard, /team, /chain, /awards, /market, /loot, /stocks, /bounties + console errors
```

---

## Decyzje (zatwierdzone przed implementacją)

1. **#5 favorites = pin nav.** Migracja `042_user_pinned_navs.sql` przechowuje tylko `(player_id, href, position, created_at)`. Bez polimorfizmu, bez `type/ref_id`. Jeśli kiedyś będą favorites itemów/graczy — osobna migracja, osobna tabela.
2. **#6 schedule = co 15 min, poprawiamy UI.** Zostawiamy `IntervalTrigger(minutes=15)` w `engine.py:50-52`. Aktualizujemy komunikat w `frontend/src/app/stats/page.tsx:135` z "daily at 4:00 UTC" na "every 15 minutes" (lub równoważne). Energy tracking dostaje świeże delty co 15 min, schedule pasuje do potrzeby.
3. **#4 indykator = ikonka.** Dla każdego itemu w market/profitable: 🛒 jeśli `is_shop=true`, flaga kraju (np. 🇲🇽 / 🇨🇭 / 🇨🇳 / 🇿🇦 / 🇦🇪 / 🇦🇷 / 🇨🇦 / 🇯🇵 / 🇬🇧 / 🇭🇰) jeśli abroad-only. Backend: `is_shop = buy_price > 0`, ale **przed wdrożeniem** sprawdzamy próbkę 10-20 itemów w `data/keys.db` (lokalnie i na prodzie), czy proxy się sprawdza dla abroad-only. Jeśli nie — fallback: cross-reference z `travel.py` (zbiór abroad-item-ids zbudowany raz przy budowie kesz-u itemów).
