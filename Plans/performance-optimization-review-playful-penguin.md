# TM Hub — Performance Audit & Optimization Plan

**Date:** 2026-04-27 · **Scope:** Full stack (frontend / backend / infra) · **Production:** hub.tri.ovh

## Context

TM Hub jest faction toolkitem dla The Masters [TM] na Torn.com. Stack: Next.js 16 static export + FastAPI + SQLite, serwowane przez nginx + uvicorn w jednym kontenerze za Coolify. Aplikacja jest funkcjonalnie kompletna (35+ stron, 22 routery API) ale nigdy nie miała formalnego audytu wydajnościowego — brak baseline metryk, brak APM, brak Web Vitals, brak bundle analizy. Ten dokument:

1. Mapuje aktualny stan względem nowoczesnych standardów (Core Web Vitals, p95 latency, bundle budgets).
2. Wskazuje konkretne komendy do zebrania baseline (nic nie zmieniamy bez pomiaru).
3. Priorytetyzuje optymalizacje po `impact / effort` z naciskiem na **tani-szybki-pierwszy** (single worker, brak Brotli, brak Web Vitals).
4. Daje roadmapę: Sprint 1 quick wins (1 dzień), Sprint 2-3 średnie, strategiczne (>1 tydzień).

**Filozofia:** żaden fix bez metryki before/after. Każda rekomendacja ma źródło. Decyzje produktowe (np. czy warto migrować z static export na ISR) flagowane explicite.

### Plan execution mode

To jest **dokument-deliverable** (audyt + plan), nie sekwencja zadań do natychmiastowego wykonania. Po akceptacji rozbijamy na osobne ticket'y/PR-y per pozycja z tabeli w Fazie 5.

---

## Faza 1 — Discovery (zweryfikowane, nie zgadywane)

### Component / Version / Latest / Status

| Component | Version (lock) | Latest stable (2026-04) | Status |
|-----------|----------------|-------------------------|--------|
| Next.js | `^16.2.3` (`frontend/package.json:14`) | 16.2.x | ✅ current |
| React / ReactDOM | `19.2.4` (pinned, `package.json:15-17`) | 19.2.x | ✅ current |
| TypeScript | `^5` | 5.x | ✅ |
| Tailwind CSS | `^4` (PostCSS v4) | 4.x | ✅ |
| Chart.js | `^4.5.1` | 4.5.x | ✅ |
| react-chartjs-2 | `^5.3.1` | 5.3.x | ✅ |
| FastAPI | `>=0.115.0` (`pyproject.toml`) | 0.115+ | ✅ |
| Uvicorn | `>=0.32.0` | 0.32+ | ✅ |
| httpx | `>=0.28.0` | 0.28+ | ✅ |
| APScheduler | `>=4.0.0a5` (alpha) | 4.0 alpha | ⚠️ alpha used in prod |
| Pydantic | (transitive) | v2 | ✅ |
| Python | `3.12-slim` (Dockerfile:10) | 3.12 / 3.13 | ⚠️ 3.13 dostępny |
| Node (build) | `20-alpine` | 22 LTS | ⚠️ 22 LTS dostępny |
| nginx | apt default (`nginx`) | 1.27 | ⚠️ wersja Debian slim, nie najnowsza |
| SQLite | system default | 3.45+ | n/a |
| CLAUDE.md | mówi „Next 15 + React 19" | jest Next 16 | ⚠️ nieaktualne — fix jako quick win |

**Entry pointy:**
- Frontend SSG (static export): 35+ stron z `frontend/src/app/`, wszystkie pre-renderowane przy buildzie. Brak SSR/ISR/RSC streaming (output: "export").
- Backend: `api/main.py:84-315` lifespan, 22 routerów, scheduler z 10 jobami.
- Workery tła: APScheduler (refresh_data 30s, collect_stats 15min, refresh_spies 30min, armoury 5min, revive 10min, circulation 15min, avatars 12h, company 24h, discover 24h, trains 24h).
- Brak: cron joby zewnętrzne, brak Vercel/Lambda/CF Workers.

**Integracje zewnętrzne:**
- Torn API v1/v2, YATA, TornStats — wszystkie via `httpx.AsyncClient` (`api/torn_client.py`).
- Backblaze B2 — avatary (CSP allowlist).
- Umami analytics — `https://analityka.tri.ovh/script.js`, `lazyOnload`, Script ID `c2fb3dc3-…` (`frontend/src/app/layout.tsx`).
- pywebpush — push notifications.
- MCP server — `https://hub.tri.ovh/mcp` z bearer auth.
- **Brak fontów webowych**, **brak Sentry / OTEL / Prometheus**, **brak gtag/GTM**.

---

## Faza 2 — Baseline (jak zebrać, dokładne komendy)

**Reguła:** żaden fix nie jest mergowany bez metryki przed/po. Wszystkie pomiary zapisujemy do `Plans/perf-baseline-2026-04-27/` jako artefakty (gitignore folderu z PDF Lighthouse, ale checkujemy `summary.md`).

### Frontend — Core Web Vitals + bundle

```bash
# 1. Production Lighthouse (mobile, slow 4G) - LCP/INP/CLS/TTFB/FCP/TTI
npx -y @lhci/cli@latest collect \
  --url=https://hub.tri.ovh/dashboard \
  --url=https://hub.tri.ovh/team \
  --url=https://hub.tri.ovh/training \
  --url=https://hub.tri.ovh/stocks \
  --url=https://hub.tri.ovh/awards \
  --numberOfRuns=3 \
  --settings.preset=mobile \
  --settings.throttling.cpuSlowdownMultiplier=4

# 2. Bundle analyzer (one-off, bez stałej zależności w deps)
cd frontend && ANALYZE=true npx -y @next/bundle-analyzer@latest \
  -- next build
# (alternatywnie dorzucić withBundleAnalyzer do next.config.ts pod env flagą)

# 3. Source-map-explorer per route (deep dive po analyzerze)
cd frontend && npx -y source-map-explorer 'out/_next/static/chunks/*.js' --html bundle-report.html

# 4. Network waterfall — WebPageTest (publiczna instancja)
# https://www.webpagetest.org/ → URL → Mobile / 4G / Chrome → 3 runs

# 5. Real-user metrics (po wdrożeniu web-vitals listenera, patrz Faza 5 #3)
# Umami custom events: LCP, INP, CLS percentyle z prod traffic.
```

**Budżety (target po optymalizacji):**

| Metric | Current (do zmierzenia) | Target (mobile p75) | Źródło |
|--------|------------------------|---------------------|--------|
| LCP | ? | ≤ 2.5 s | [web.dev/vitals](https://web.dev/articles/vitals) |
| INP | ? | ≤ 200 ms | web.dev/vitals |
| CLS | ? | ≤ 0.1 | web.dev/vitals |
| TTFB | ? | ≤ 800 ms | web.dev/ttfb |
| First Load JS (per route) | ? | ≤ 170 kB gzip | Next.js docs default |

### Backend — latency + throughput

```bash
# 1. Smoke load test (k6) — ścieżki najczęściej używane
# Plik: ops/k6/dashboard-load.js (do napisania, ~30 linii)
k6 run --vus 20 --duration 60s ops/k6/dashboard-load.js
# Endpointy: /api/dashboard, /api/team, /api/stocks/portfolio, /api/loot, /api/awards

# 2. Per-endpoint p50/p95/p99 z istniejącego logging middleware
# api/main.py:615-632 już loguje elapsed_ms i SLOW (>1s).
# Wyciągnąć i zagregować z prod loga (ostatnie 7 dni):
docker logs hub-tri-ovh 2>&1 | grep -E '"elapsed_ms"' | \
  jq -s 'group_by(.path) | map({path: .[0].path, p50: (sort_by(.elapsed_ms)[length*0.5|floor].elapsed_ms), p95: (sort_by(.elapsed_ms)[length*0.95|floor].elapsed_ms), p99: (sort_by(.elapsed_ms)[length*0.99|floor].elapsed_ms), n: length})'
# (komenda hipotetyczna — jeśli logger jest plain text, dodać structured logger jako quick win #4)

# 3. SQLite query analysis — które query >50ms
# Tymczasowy hook w api/db/repos/base.py BaseRepository.execute()
# logujący SQL + elapsed_ms gdy >50ms (3 linie kodu, do usunięcia po audycie)
# Następnie:
sqlite3 data/keys.db "EXPLAIN QUERY PLAN <suspect query>"

# 4. Cache hit ratio (nginx proxy_cache + TornClient TTL)
# nginx loguje X-Cache-Status header — dodać do log_format w nginx.conf,
# potem agregacja z access loga.
docker exec hub-tri-ovh tail -100000 /dev/stdout | \
  grep -oE 'X-Cache-Status: [A-Z]+' | sort | uniq -c

# 5. Memory + CPU pod obciążeniem
docker stats hub-tri-ovh --format "table {{.CPUPerc}}\t{{.MemUsage}}"
# w trakcie k6 testu

# 6. Cold start scheduler / lifespan time
# Log linie z api/main.py:84 do api/main.py:315 — od pierwszej do ostatniej
# Cel: < 5s (obecnie nieznane, lifespan robi 22 routery + 46 repos + 10 jobs).
```

### Build

```bash
# Czas builda i rozmiar artefaktów
cd frontend && time npm run build
du -sh out/ .next/

# Tree-shaking efficiency: liczba duplikatów modułów
npx -y @next/bundle-analyzer
# Sprawdzić czy chart.js nie jest zduplikowany w 7 chunkach.

# Docker image size
docker images hub-tri-ovh --format "{{.Size}}"
docker history hub-tri-ovh
```

---

## Faza 3 — Analiza obszarów (znalezione, bez zgadywania)

Każda obserwacja ma file:line. Statusy: ✅ ok, ⚠️ uwaga, ❌ problem.

### Frontend

| # | Obserwacja | Status | Lokacja |
|---|-----------|--------|---------|
| F1 | Single uvicorn worker = 1 proces backendu — cały frontend statyczny przez nginx OK, ale każde `/api/*` request idzie do jednego eventloopa | ❌ | `start.sh:5` |
| F2 | `output: "export"` — brak RSC streaming, brak ISR; 35 stron pre-rendered jako pełne CSR-after-hydration | ⚠️ | `frontend/next.config.ts:4` |
| F3 | 8 stron top-level oznaczonych `"use client"` (dashboard, team, war, chat, inbox, admin, compare, enemies) — całe drzewo komponentów hydratuje | ⚠️ | `frontend/src/app/*/page.tsx` |
| F4 | 4 równoległe pollery na froncie: 3×60s (team, enemy, war) + 1×15s (PDA) — wszystkie niezsynchronizowane, każdy może wpaść w fan-out na backend | ⚠️ | `frontend/src/hooks/usePDAPolling.ts`, `useTeamData.ts`, `useEnemyData.ts`, `useWarData.ts` |
| F5 | Chart.js bundlowany 7 razy via `next/dynamic` bez `ssr: false` — Chart.js dispatcher per chart | ⚠️ | `frontend/src/components/{training,stocks,awards,company,stats}/charts/*` |
| F6 | Brak React Compiler (Next 16 wspiera, opt-in via `experimental.reactCompiler`) — manualne `useMemo`/`useCallback` wszędzie | ⚠️ | `frontend/next.config.ts` |
| F7 | Brak `web-vitals` listenera ani RUM — leci slepo | ❌ | brak pliku |
| F8 | `images.unoptimized: true` (wymuszone przez output:export) — żadnej optymalizacji obrazów Next.js | ⚠️ | `next.config.ts:6` |
| F9 | `api-client.ts` (465 linii) ma deduplication inflight requestów ale brak cache/SWR — każdy `useEffect` triggeruje nowy fetch | ⚠️ | `frontend/src/lib/api-client.ts:84-100` |
| F10 | useChat.ts (369 linii) ma multiple `setInterval` — chat żyje cały czas niezależnie od widoczności | ⚠️ | `frontend/src/hooks/useChat.ts` |
| F11 | Brak `Page Visibility API` integration w pollerach — pollują nawet w tle | ❌ | wszystkie polling hooki |
| F12 | Bundle analyzer nieobecny w devdeps — nigdy nie sprawdzony rozmiar | ❌ | `package.json:19-28` |
| F13 | Brak fontów webowych, brak FOUT/FOIT problemu | ✅ | n/a |
| F14 | Service worker `public/sw.js` istnieje (3.6 kB) — sprawdzić czy buildowany asset i czy ma sensowne cache strategies | ⚠️ | `frontend/public/sw.js` |
| F15 | `.next` build artifact 409 MB on disk (z source mapami) — image build copies tylko `out/` więc OK, ale CI cache może puchnąć | ✅ | `.next/` |

### Backend

| # | Obserwacja | Status | Lokacja |
|---|-----------|--------|---------|
| B1 | Uvicorn 1 worker, brak `--workers N` ani Gunicorn fronta — cała appka asynchroniczna ale jeden eventloop = jeden CPU core | ❌ | `start.sh:5` |
| B2 | Lifespan boot inicjalizuje 22 routery + 46 repos + 10 schedulerów sekwencyjnie — czas startu nieznany, brak metryki | ⚠️ | `api/main.py:84-315` |
| B3 | TornClient cache to in-memory dict, **bez eviction** — przy długo żyjącym procesie rośnie nieograniczenie (dla 70-osobowej frakcji niski risk, ale unbounded growth) | ⚠️ | `api/torn_client.py:31` |
| B4 | `company_director.py:135` — pętla `for kd in all_keys: training = await ...` — sekwencyjne await per klucz, brak `asyncio.gather` | ❌ | `api/routers/company_director.py:135` |
| B5 | Brak ETag / `If-None-Match` na żadnym endpoint'cie — cache HTTP tylko time-based (max-age + SWR) | ⚠️ | `api/main.py:572-609` |
| B6 | Nginx `proxy_cache_key` = `$request_method$request_uri$http_x_player_id` — cache per-user, czyli 70 użytkowników × 22 endpointy = niski hit ratio dla danych shared (np. stocks market) | ⚠️ | `nginx.conf:86` |
| B7 | `proxy_cache_valid 200 60s` (sztywne) ignoruje per-route Cache-Control z FastAPI (od `api/main.py:572` jest 10s-300s zależnie od ścieżki) — nginx nadpisuje | ❌ | `nginx.conf:87` |
| B8 | SQLite PRAGMA tuning solidne (WAL, mmap 64MB, cache 8MB, NORMAL synchronous) | ✅ | `api/db/repos/base.py:39-44` |
| B9 | Brak prepared statements / connection pool — każde repo otwiera własne połączenie thread-local | ⚠️ | `api/db/repos/base.py` |
| B10 | Endpointy `/api/spy/faction/{id}` i `/api/company/director/faction` zwracają wszystko bez paginacji — przy enemy faction 100+ memberów full payload | ⚠️ | `api/routers/spy.py:72-110`, `company_director.py:121-183` |
| B11 | Brak structured logging — log middleware emituje plain text, agregacja per-endpoint p95 wymaga regex | ⚠️ | `api/main.py:19-20, 615-632` |
| B12 | Brak APM/tracing (Sentry/OTEL) — błędy w prod znikają w stdout | ❌ | n/a |
| B13 | APScheduler 4.x **alpha** w prod — istniejące działa, ale upgrade path / stability concern | ⚠️ | `pyproject.toml` |
| B14 | `httpx.AsyncClient` używa default pool (100 conn / host) — OK dla Torn API | ✅ | `api/torn_client.py:30` |
| B15 | Brak request ID / correlation ID między frontem a backendem — debug rozproszony | ⚠️ | brak |

### Infrastruktura

| # | Obserwacja | Status | Lokacja |
|---|-----------|--------|---------|
| I1 | Brak Brotli — tylko gzip (`gzip_comp_level 5`, pre-compress build-time) | ⚠️ | `nginx.conf:18-26`, `Dockerfile:22` |
| I2 | Brak CDN — wszystko z hub.tri.ovh single origin (Coolify host); RTT zależy od lokalizacji usera | ⚠️ | `nginx.conf` (brak Cloudflare/Bunny) |
| I3 | nginx serwuje `/_next/static/` z immutable cache 1y | ✅ | `nginx.conf:46-51` |
| I4 | Pre-gzip wszystkich `.html/.js/.css/.json/.svg/.xml/.txt` na build-time + `gzip_static on` | ✅ | `Dockerfile:22`, `nginx.conf:26` |
| I5 | nginx proxy_cache 100m / 5min inactive — pojemność OK dla małej frakcji | ✅ | `nginx.conf:34` |
| I6 | Brak healthcheck endpoint w FastAPI (nginx proxuje `/health` ale to tylko fallback do `serve_frontend`) | ⚠️ | `nginx.conf:95-100` |
| I7 | SQLite single-file, volume Coolify, **brak explicit backup job** — relicz na snapshoty Coolify | ⚠️ | `docker-compose.yml:14` |
| I8 | Brak Redis / shared cache — przy dwóch workerach (gdyby B1 fix) cache TornClient nie shared | ⚠️ | brak |
| I9 | CSP allowlistuje analityka.tri.ovh, *.backblazeb2.com, www.torn.com — sensownie wąsko | ✅ | `api/main.py:551` |
| I10 | Docker image: `python:3.12-slim` + nginx + node_modules build stage — final clean | ✅ | `Dockerfile` |
| I11 | CI: jeden job test + build, deploy via Coolify webhook — brak parallelism (test 30+ pluginów pytest async) | ⚠️ | `.github/workflows/deploy.yml` |
| I12 | `.dockerignore` brak — może wlatywać `.git`, `.next`, etc. do build context | ❌ | brak |

---

## Faza 4 — Technologie wspierające (dostępne, niewykorzystane)

Dla wykrytego stacku (Next 16, React 19, FastAPI, SQLite, nginx) konkretne nieużyte funkcje:

| Tech | Co to daje | Dlaczego pasuje | Źródło |
|------|-----------|----------------|--------|
| **React Compiler** (stable in React 19.2 + Next 16) | Auto-memoizacja, eliminuje >80% manualnych `useMemo`/`useCallback` | Mamy React 19.2.4 + Next 16.2.3 — opt-in jednym flagiem `experimental.reactCompiler` | [react.dev/learn/react-compiler](https://react.dev/learn/react-compiler) |
| **`<link rel="modulepreload">` per route** | Skraca chain dla nawigacji wewnętrznej | Static export → hashowane chunki, idealny dla preload | [web.dev/articles/modulepreload](https://web.dev/articles/modulepreload) |
| **Speculation Rules API** (Chrome 121+) | Prerenderuje następną stronę zanim user kliknie | Sidebar nawigacja predictable, mały graf stron | [chrome.com/docs/web-platform/prerender-pages](https://developer.chrome.com/docs/web-platform/prerender-pages) |
| **View Transitions API** (Chrome 111+, Safari 18) | Smooth między-stronowe animacje bez framework | Prosta nawigacja w SPA, brak framer-motion = lekko | [developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API) |
| **Brotli** (`ngx_brotli`) | 15-25% mniejsze payloady JS/CSS niż gzip | Pre-compression na build-time analogiczne do gzip | [github.com/google/ngx_brotli](https://github.com/google/ngx_brotli) |
| **Page Visibility API** | Pauza polling gdy tab w tle | 4 pollery na froncie zatłoczone (F4) | [developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) |
| **`web-vitals` v4** | RUM metrics LCP/INP/CLS z prod | Brak (F7), mamy Umami który bierze custom events | [github.com/GoogleChrome/web-vitals](https://github.com/GoogleChrome/web-vitals) |
| **Uvicorn `--workers N`** lub Gunicorn `gunicorn -k uvicorn.workers.UvicornWorker -w N` | N×CPU procesów = N× przepustowości | Single worker = bottleneck (B1). UWAGA: wymaga shared cache (B3) → albo stickiness albo Redis | [www.uvicorn.org/deployment/#running-with-gunicorn](https://www.uvicorn.org/deployment/#running-with-gunicorn) |
| **SQLite WAL2 + `mmap_size` increase** | Read concurrency wyższy | WAL już jest (B8), próba `mmap_size=268435456` (256MB) gdy DB rośnie | [sqlite.org/wal2.html](https://sqlite.org/wal.html) |
| **`asyncio.gather()` zamiast pętli await** | Naturalna paralelizacja | B4 (`company_director.py:135`) | std lib |
| **httpx HTTP/2** (`httpx.AsyncClient(http2=True)`) | Multiplexing requestów do tego samego hosta (Torn API) | Zmniejsza handshake overhead przy fan-out | [www.python-httpx.org/http2/](https://www.python-httpx.org/http2/) |
| **ETag + `If-None-Match`** dla GET API | 304 zamiast 200 — payload 0 B | B5; tani fix przez middleware | [developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag) |
| **Cloudflare przed Coolify** (free tier OK) | CDN + edge cache + Brotli + DDoS + analytics | Single origin (I2), DNS już w naszych rękach | [developers.cloudflare.com/cache/](https://developers.cloudflare.com/cache/) |
| **Sentry SDK (FastAPI + browser)** lub **OpenTelemetry + Grafana Cloud free tier** | APM + error tracking + traces | Zero observability dziś (B12) | [docs.sentry.io/platforms/python/integrations/fastapi/](https://docs.sentry.io/platforms/python/integrations/fastapi/) |
| **`@next/bundle-analyzer`** | Szczerze pokazuje co zżera bytes | F12; jednorazowy run wystarczy | [www.npmjs.com/package/@next/bundle-analyzer](https://www.npmjs.com/package/@next/bundle-analyzer) |
| **Next.js `generateStaticParams` / `revalidate` (gdy zejdziemy z output:export)** | ISR per page bez full SSR | Strategiczne (Faza 6 — duża decyzja) | [nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration](https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration) |

---

## Decyzje produktowe (zatwierdzone 2026-04-27)

- **Cloudflare:** TAK, w Sprint 2 (zadanie #10).
- **APM:** Glitchtip samohostowany przez Coolify (zadanie #13).
- **Multi-worker + Redis:** RAZEM jako pakiet w Sprint 1-2 (zadania #1 + #19 zmergowane). Redis daje shared cache + leader-election dla schedulera + naturalny dom dla F-16 jti deny-list (TTL = JWT exp, dziś w SQLite).
- **Migracja z `output:export` → ISR:** TAK, planowana jako epic Q3 (zadanie #20 przeniesione ze "Strategicznych" na konkretną roadmapę).

## Update 2026-04-27 — po security audit (6 commitów)

Pentester zakończył Sprint 0-2 + F-18 backup. Zmiany istotne dla tego planu:

- **Auth przeszedł z `X-Player-Id` header na HttpOnly cookie `tm_session`** (commit 60c6e73). `Authorization` header jako legacy fallback.
  - **🚨 NOWY P0 (zadanie #24):** `nginx.conf:86` dalej kluczuje cache po `$http_x_player_id` — dla sesji cookie-only header może być pusty → **cache shared między userami / cache poisoning risk**. Dodać `$cookie_tm_session` do klucza ALBO przenieść decyzję do FastAPI (lepsze, tam mamy auth context).
- **F-16 jti deny-list w SQLite** (`api/db/repos/revoked_jwts.py`, migracja 041) — przy wprowadzeniu Redis (#1+#19) przenosimy deny-listę do Redis z TTL = JWT exp (zero-cost cleanup, brak query do SQLite na każdy request).
- **CSP no `unsafe-inline`** (zadanie #10 Cloudflare): musimy upewnić się że Cloudflare Auto Minify NIE wstrzyknie inline scripts. **Wyłączyć Auto Minify dla JS, zostawić CSS/HTML.**
- **SRI hash na Umami** (`frontend/src/app/layout.tsx`): jak Cloudflare cachuje HTML, SRI musi być w sync — przy upgrade Umami pamiętać o przeliczeniu.
- **F-18: daily encrypted backup keys.db do B2** — nowy scheduler job (24h, pierwsze odpalenie boot+60s). **Liczba jobów: 10 → 11.** Backup używa SQLite Online Backup API → konsystentny z WAL writers.
- **Test count: 427 → 498** — `pytest-xdist` (#22) jeszcze pilniejszy.
- **F-13: GH Actions SHA-pinned + dependabot.yml** — moje pierwotne uwagi do CI w I11 częściowo zaadresowane (security side); pytest-xdist parallelism nadal otwarty.
- **DOMPurify dodany jako frontend dep** (Sprint 0, F-04 — `frontend/package.json`). Nowa zależność ~22kB gzip. Sprawdzić w bundle analyzerze (#7) czy nie ląduje w main chunk dla stron które jej nie używają.
- **F-17: rate-limiter ma teraz eviction co 5 min** — bounded memory, wcześniej unbounded growth risk zniknął.
- **F-06: admin re-auth via Torn API** przy każdym `/api/admin/session` — to dodatkowy outbound call do `torn.com`; mieć na uwadze przy mierzeniu admin endpoint p95.

Komitowane wersje plików referencyjnych (do verify gdy zacznę implementować):
- `start.sh` — bez zmian, single worker wciąż (#1 nadal aktualne)
- `nginx.conf` — bez zmian (więc cache_key bug żyje)
- `api/main.py` — zmieniony (cookie auth, CSP, jti checker wpięty)
- `api/auth.py` — zmieniony (decode_jwt z revocation_check)
- `frontend/src/app/layout.tsx` — zmieniony (SRI na Umami)
- `pyproject.toml` — bez zmian na fronty perf (APScheduler 4.x alpha wciąż)
- `frontend/package.json` — DOMPurify dodany

## Faza 5 — Plan działania (priorytetyzowany)

Kolejność: **impact / effort** desc. Effort: S = <1h, M = pół dnia, L = >1 dzień.

| # | Obszar | Problem | Rozwiązanie | Impact | Effort | Ryzyko | Priorytet |
|---|--------|---------|-------------|--------|--------|--------|-----------|
| 1 | Backend / infra | Single uvicorn worker (B1) | **Pakiet z #19:** Redis container (Coolify 1-click) → `gunicorn -k uvicorn.workers.UvicornWorker -w 2` w `start.sh` + Redis-backed TornClient cache + Redis lock dla scheduler leader election (job leci tylko w workerze co trzyma lock) | 🔴🔴 throughput ~2× + clean cache | M | M (Redis to nowy kontener, leader-election logic, fallback gdy Redis down) | P0 |
| 2 | Frontend / RUM | Brak Web Vitals (F7) | Mały listener `web-vitals` → Umami custom events (LCP/INP/CLS); 30 linii kodu | 🔴 widoczność | S | brak | P0 |
| 3 | Backend / cache | nginx proxy_cache nadpisuje per-route TTL (B7) | `proxy_cache_valid` zdjąć, polegać na `Cache-Control` z FastAPI (`proxy_cache_valid` honoruje `Cache-Control` gdy `proxy_ignore_headers` go nie wyrzuca) | 🔴 hit ratio na endpointach long-cache | S | M (regression test cache headers) | P0 |
| 4 | Infra | Brak Brotli (I1) | nginx z `ngx_brotli` lub fallback: pre-Brotli na build (`brotli -k -q 11`) + `brotli_static on` | 🟡 -15-25% bytes | M | brak (gzip fallback istnieje) | P0 |
| 5 | Backend | `company_director.py:135` sekwencyjne await (B4) | `await asyncio.gather(*(fetch_training(kd) for kd in all_keys))` z `Semaphore(5)` | 🔴 endpoint ten = 5-10× szybszy | S | brak (już używa Semaphore w pobliżu, l.163) | P0 |
| 6 | Frontend / polling | 4 pollery zawsze on (F4, F11) | Page Visibility API: pauza wszystkich `setInterval` gdy `document.hidden`. Wspólny hook `useVisiblePolling`. | 🟡 mniej fan-outu na backend, mniej baterii | M | brak | P1 |
| 7 | Frontend / bundle | Brak bundle analyzera (F12) | `@next/bundle-analyzer` pod env flagą `ANALYZE=true`; raport jednorazowy → identyfikacja >50kB chunków | 🟡 wiedza | S | brak | P1 |
| 8 | Frontend / Chart.js | 7 stron z chart.js, każda dynamic import (F5) | Wspólny `lazy(() => import("@/lib/chartjs-setup"))` z jedną rejestracją plug-inów; chunk shared między stronami | 🟡 -30-50kB per chart route | M | brak | P1 |
| 9 | Backend / ETag | Brak ETag (B5) | Middleware FastAPI: hash MD5 z body responsu dla GET → ETag header + 304 gdy match. Albo per-route gdzie sensowne. | 🟡 0 B response dla cache hit | M | M (memory hash overhead — testować) | P1 |
| 10 | Infra | Cloudflare przed origin (I2) — **zatwierdzone Sprint 2** | Free tier; orange cloud na hub.tri.ovh; cache static + Brotli edge; DDoS bonus. **Page Rule: bypass cache dla `/mcp` i `/api/admin/*`**. Verify CSP nadal OK | 🔴 globalna latencja | M | M (CSP, hot static cache invalidation, MCP endpoint test) | P1 |
| 11 | Backend / structured log | Plain text logi (B11) | `logging` z JSON formatter (`python-json-logger`) — request/elapsed_ms/path/status w JSON | 🟡 łatwiejsze p95/p99 | S | brak | P1 |
| 12 | Frontend / React Compiler | Brak (F6) | `experimental: { reactCompiler: true }` w `next.config.ts` + `babel-plugin-react-compiler`; pomiar bundle delta | 🟡 mniej re-renderów, kod prostszy | M | M (compatibility — testować na dev branch) | P2 |
| 13 | Backend / APM | Brak (B12) — **Glitchtip self-hosted (zatwierdzone)** | Glitchtip przez Coolify 1-click → FastAPI + browser SDK (Sentry-compatible). PII: Player IDs OK, Torn API keys MUSZĄ być filtrowane przez `before_send` hook | 🟡 visibility prod, dane na własnym serwerze | M | S (PII filter test, +1 kontener do utrzymania) | P2 |
| 14 | Backend / health | Brak healthcheck endpoint (I6) | `@app.get("/health")` zwraca `{"status":"ok","db":<sec>,"scheduler":<jobs>}`; Coolify health probe | 🟡 deploy reliability | S | brak | P2 |
| 15 | Backend / paginacja | Spy/director endpointy unbounded (B10) | `?limit=N&cursor=…` opcjonalnie (back-compat: brak param = behavior dziś) | 🟡 worst-case payload cap | M | M (frontend musi obsłużyć cursor) | P2 |
| 16 | Frontend / preload | Brak `modulepreload` per route | Next 16 robi to automatycznie z `Link` — zweryfikować że używamy `next/link` wszędzie (grep pokazuje że tak) | 🟢 prawdopodobnie już OK | S | brak (just verify) | P2 |
| 17 | Frontend / Speculation Rules | Brak (Chrome only) | `<script type="speculationrules">` w `layout.tsx`: prefetch sidebar destinations | 🟢 instant nav Chrome users | S | S (memory bump dla user) | P3 |
| 18 | Frontend / View Transitions | Brak smooth nav | `document.startViewTransition()` wrapper around router.push | 🟢 polish, nie perf | S | brak | P3 |
| 19 | Backend / cache shared | **ZMERGOWANE z #1** — Redis dla shared cache + scheduler leader-election | (patrz #1) | — | — | — | (z #1) |
| 20 | Strategiczne | output:export ogranicza RSC/ISR (F2) — **Q3 epic (zatwierdzone)** | Migracja na Next standalone + selektywny ISR. Plan: rozbicie na 3 fazy — (1) Docker z Node, (2) konwersja `dashboard` + `stocks` na server components z `revalidate`, (3) reszta stopniowo. Decyzje implementacji w osobnym docu na początku Q3. | 🔴 architektura, długoterminowy zysk | L | L (deploy zmiana, container size, RAM ↑) | Q3 |
| 21 | Infra | Docker image bez .dockerignore (I12) | Dodać `.dockerignore` (`.git`, `.next`, `frontend/node_modules`, `data/`, tests, screenshots) | 🟢 szybszy build context | S | brak | P3 |
| 22 | CI | Test job sekwencyjny (I11) | pytest-xdist `-n auto`; npm build w równoległym jobie | 🟢 -30-50% CI time | S | brak | P3 |
| 23 | Backend | APScheduler 4.x **alpha** w prod (B13) | Monitorować release; rozważyć fallback do 3.x stable jeśli problem | 🟡 risk | M | M | P3 |
| 24 | Backend / cache (NEW post-audit) | nginx `proxy_cache_key` używa `$http_x_player_id` ale auth przeszedł na cookie `tm_session` (commit 60c6e73) — cache shared między userami dla cookie-only sesji | Zmienić klucz na `$cookie_tm_session` (gdy istnieje, fallback do header) ALBO zdjąć player-id z klucza i zostawić auth-aware cache na poziomie FastAPI z proper `Vary: Cookie` headerem (czystsze) | 🔴🔴 correctness + perf | S | M (regression test: dwóch userów dostaje różne dane) | **P0** |
| 25 | Backend / Redis (NEW post-audit) | F-16 jti deny-list w SQLite, każdy request robi extra query | Po wprowadzeniu Redis (#1+#19) przenieść `RevokedJwtRepository` na Redis z TTL = JWT exp; zero-cost cleanup, brak DB roundtrip per-request | 🟡 −1 SQLite query per authenticated request | S | S (tylko gdy Redis już jest) | P1 (po #1+#19) |
| 26 | CSP (NEW post-audit) | Cloudflare Auto Minify może wstrzyknąć inline JS — łamie CSP no-unsafe-inline | W konfigu CF: Speed → Optimization → wyłączyć Auto Minify dla JS, CSS/HTML można zostawić. Test po włączeniu CF | 🟢 prevent regression | S | brak | P0 (przy zadaniu #10) |
| 27 | Frontend bundle (NEW post-audit) | DOMPurify (~22kB gzip) dodany w Sprint 0 — sprawdzić gdzie ląduje | W bundle analyzerze (#7) zweryfikować że DOMPurify jest w chunku tylko stron co go używają (`company/director/news`), nie w main bundle | 🟢 wiedza | S | brak | P2 (w ramach #7) |

### Top 10 Quick Wins (S/M effort, P0/P1)

1. **`#5` Async parallelize `company_director.py:135`** (S, P0) — czysty `gather`, mierzalne natychmiast.
2. **`#3` Naprawić nginx proxy_cache TTL leak** (S, P0) — usunąć `proxy_cache_valid` aby honorował `Cache-Control`.
3. **`#1` Multi-worker uvicorn** (S, P0) — najgorszy bottleneck zniknie, ale uwaga: scheduler musi działać tylko w jednym workerze (warunek lifespan: `os.getpid()` first w shared file lock, lub `--preload`).
4. **`#2` Web Vitals → Umami** (S, P0) — bez tego dalsze optymalizacje są ślepe.
5. **`#11` JSON structured logging** (S, P1) — odblokowuje p95 analizę w jednym jq query.
6. **`#14` `/health` endpoint z prawdziwym statusem** (S, P2) — stabilność deploy.
7. **`#7` Bundle analyzer one-off** (S, P1) — jednorazowy raport, decyzje na bazie danych.
8. **`#21` `.dockerignore`** (S, P3) — szybszy build context.
9. **`#22` `pytest-xdist`** (S, P3) — szybsze CI, mniej kawy.
10. **`#16` Verify `next/link` wszędzie** (S, P2) — automatic preload działa tylko dla nich.

---

## Faza 6 — Roadmap

### Sprint 1 — Quick wins + baseline (1-2 dni)

Cel: **zmierzyć baseline + naprawić oczywiste rzeczy bez Redis/Cloudflare**. Każdy element ma kryterium akceptacji oparte na metryce.

| Task | Acceptance criterion |
|------|---------------------|
| Zebrać Lighthouse baseline 5 stron (Faza 2 cmd #1) | Plik `Plans/perf-baseline-2026-04-27/lighthouse.json` w repo + summary |
| Zebrać k6 baseline 5 endpointów | Plik `Plans/perf-baseline-2026-04-27/k6-summary.json` |
| **#24 nginx cache_key fix (NEW P0)** | Test: dwóch userów z różnymi `tm_session` cookies dostaje różne dane z `/api/dashboard`; nigdy nie cross-cache |
| #5 Parallelize director | `/api/company/director/faction` p95 < 50% obecnego |
| #3 Fix proxy_cache TTL | `X-Cache-Status: HIT` ratio na `/api/stocks/market` ≥ 80% w 5-min oknie ruchu |
| #2 Web Vitals → Umami | LCP/INP/CLS widoczne w Umami dashboard po 24h prod traffic |
| #11 Structured JSON logs | jq one-liner zwraca p50/p95/p99 per endpoint |
| #14 `/health` endpoint | Coolify health probe na `/health` zielony, pinguje DB |
| #21 .dockerignore | `docker build` context size −30% |
| Update CLAUDE.md (Next 15 → 16; test count 427 → 498; scheduler jobs 10 → 11) | Tekst zaktualizowany |

### Sprint 2 — Średnie (1-2 tygodnie) — Redis + Cloudflare + APM

| Task | Acceptance criterion |
|------|---------------------|
| #1+#19 Redis container w Coolify + multi-worker | Redis działa w Coolify, k6 baseline RPS ≥ 1.7× single-worker, scheduler job leci dokładnie raz (verified by Redis lock log) |
| **#25 jti deny-list → Redis (post Redis)** | `RevokedJwtRepository` używa Redis z TTL = JWT exp; SQLite `revoked_jwts` table może zostać jako fallback ale primary path = Redis |
| #4 Brotli w nginx | `Content-Encoding: br` na `.js/.css`; rozmiar Network tab −15-25% vs gzip |
| #6 Page Visibility w pollerach | Backend RPS w godzinach nocnych 0 (plus Umami session bounce → polling stop) |
| #7 Bundle analyzer + akcje (+ verify #27 DOMPurify chunk placement) | First Load JS dla `/dashboard` < 170 kB gzip; DOMPurify NIE w main bundle |
| #8 Wspólny chartjs chunk | `_next/static/chunks/chartjs-*.js` w jednym chunk, używany przez wszystkie 7 stron |
| #9 ETag middleware | 304 ratio na `/api/dashboard` > 50% przy retry |
| **#10 + #26 Cloudflare przed Coolify** | Lighthouse TTFB regionów USA/Asia < 800ms; CSP zgodny (Auto Minify JS = OFF, CSS/HTML OK); `/mcp` i `/api/admin/*` bypass cache; SRI Umami nadal valid |
| #13 Glitchtip self-hosted (Coolify 1-click) | Glitchtip działa, FastAPI + browser SDK wysyłają eventy, Torn API keys NIE pojawiają się w żadnym evencie (test: spróbuj wywołać błąd z key w payloadzie, sprawdź filtr) |
| #15 Pagination opcjonalna na spy/director | Default behavior unchanged; `?limit` zwraca cap |

### Sprint 3 — Polish & finishing (1 tydzień)

| Task | Acceptance criterion |
|------|---------------------|
| #12 React Compiler | Bundle delta zmierzony, brak regressów; manualne `useMemo` przejrzane (nie usuwać hurtowo) |
| #17 Speculation Rules | Time-to-Next-Page Chrome ≤ 100 ms (mierzone navigation timing) |
| #18 View Transitions | Smooth nav przejścia w Chrome/Safari, fallback dla starszych |
| #22 pytest-xdist | CI test job czas −30% vs baseline |
| Audit dependencies (`npm audit`, `uv pip-audit`) | 0 high/critical |

### Q3 Epic — Migracja na ISR (zatwierdzone, oddzielny dokument planowania)

| Faza | Cel |
|------|-----|
| Q3.1 — Docker | Final image z Node + Python (multi-stage zostaje, ale Node nie kasujemy). Pomiar: image size delta, container RAM delta. |
| Q3.2 — Pilot 2 strony | `/dashboard` + `/stocks` jako server components z `revalidate: 60`. Reszta aplikacji bez zmian. Pomiar: LCP delta tych stron vs reszta. |
| Q3.3 — Reszta stopniowo | Migrujemy strony tam gdzie ISR realnie pomaga (te z dużym fetch). Strony "use client"-only (chat, admin) zostają jak są. |

Acceptance criterion epic: LCP `/dashboard` p75 mobile spadnie ≥ 30% vs Sprint 3 baseline.

### Inne strategiczne (nie zatwierdzone — do rozmowy w przyszłości)

| Task | Tradeoff |
|------|---------|
| Migracja SQLite → Postgres | **Koszt:** migracja schemy (46 plików), backup proc, koszt $/m. **Zysk:** prawdziwy connection pool, listen/notify, lepsza concurrency. **Kryterium decyzji:** gdy DB > 50 MB lub > 100 RPS write. |
| Edge functions (CF Workers) dla stale data | **Koszt:** duplikacja logiki / wrapping. **Zysk:** sub-50ms response globalnie. **Kryterium:** gdy będzie >5 niezależnych frakcji. |

---

## Constraints respected

- ✅ Każda rekomendacja w Fazie 4-5 ma źródło (link do docs).
- ✅ Każdy fix w Roadmapie ma kryterium akceptacji oparte na metryce.
- ✅ Żadne API contract change bez explicit flag (#15 ma `?limit` opcjonalne, default = behavior dziś).
- ✅ Zależności minimalne: `python-json-logger` (~10kB), `gunicorn` (replace start), `web-vitals` (~5kB front), `@next/bundle-analyzer` (devOnly), opcjonalnie `sentry-sdk` (decyzja produktowa).
- ✅ Decyzje produktowe (Cloudflare, Sentry, output:export migration) flaguje "Strategiczne".

## Critical files (do modyfikacji w Sprint 1)

- `start.sh` — multi-worker (#1)
- `nginx.conf` — proxy_cache TTL (#3), Brotli later (#4)
- `api/main.py` — JSON logger (#11), `/health` (#14)
- `api/routers/company_director.py:135` — gather (#5)
- `frontend/src/app/layout.tsx` — web-vitals listener (#2)
- `frontend/next.config.ts` — bundle-analyzer flag (#7), React Compiler later (#12)
- `Dockerfile` — `.dockerignore` (#21), Brotli pre-compress (#4)
- `frontend/src/hooks/usePDAPolling.ts`, `useTeamData.ts`, `useEnemyData.ts`, `useWarData.ts` — Page Visibility (#6)
- nowe: `frontend/src/lib/web-vitals.ts`, `frontend/src/lib/chartjs-setup.ts` (#8), `Plans/perf-baseline-2026-04-27/`, `ops/k6/dashboard-load.js`

## Verification (end-to-end)

Po każdym Sprint:
1. **Re-run baseline komend z Fazy 2** (Lighthouse, k6, bundle analyzer, log p95).
2. **Diff vs baseline** — committed do `Plans/perf-baseline-2026-04-27/sprint{N}/`.
3. **Post-deploy sanity check** wg `CLAUDE.md` (Playwright walkthrough hub.tri.ovh — 8 stron, console clean).
4. **Umami real users** — czekać 24h, sprawdzić LCP/INP percentyle czy poprawione.
5. **Regression**: full pytest (`uv run pytest tests/ -v`) + `cd frontend && npm run build` — zielone przed merge.

---

## Decyzje (zamknięte)

- ✅ Cloudflare → Sprint 2.
- ✅ ISR migracja → Q3 epic (osobny doc planowania).
- ✅ Multi-worker + Redis → razem w Sprint 2 (#1+#19 zmergowane).
- ✅ APM → Glitchtip self-hosted via Coolify (#13).
- `gunicorn` jako zależność — założenie YES (potrzebne do multi-worker preload + scheduler leader logic).
