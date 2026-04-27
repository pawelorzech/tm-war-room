# Plan — Audyt bezpieczeństwa TM Hub (static analysis)

## Context

TM Hub to publicznie dostępna aplikacja webowa (`hub.tri.ovh`) używana przez członków faction "The Masters" w Torn.com. Backend FastAPI + SQLite (z Fernet-szyfrowanymi kluczami API graczy), frontend Next.js 15 static export, deployment Docker + Coolify. Aplikacja przechowuje **wrażliwe dane**: zaszyfrowane klucze API Torn (które dają pełny dostęp do konta gracza w grze, w tym możliwość transferu krypto), spy reports innych graczy, dane statystyczne członków. Wyciek pojedynczego klucza API gracza = realna kradzież in-game.

Audyt jest **preventive** — nie ma znanego incydentu; celem jest podniesienie dojrzałości security przed kolejnymi feature'ami i usunięcie zidentyfikowanych długów.

## Decyzje zakresu (potwierdzone z userem)

| Wymiar | Wybór |
| --- | --- |
| Format raportu | Standardowy per-finding (ID, severity CVSS v3.1, opis, lokalizacja kodu, atak, impact, fix, weryfikacja, defense-in-depth) |
| Zakres | Pełny: backend + frontend + infra + deps + secrets |
| PoC depth | Tylko opis + `file:line` (bez wykonywalnych exploitów) |
| Dynamic tests | Brak — czysty static analysis na repo |

**Nie w zakresie:** aktywne probing produkcji, mobile (brak), warstwa hostingu (Coolify VPS, sieć).

---

## Metodyka

- **OWASP Top 10 2021** + **OWASP API Top 10 2023** baseline
- **OWASP ASVS L2** kontrola weryfikacji
- **CWE Top 25 2024** klasyfikacja
- **STRIDE** threat model per komponent

---

## Faza 1 — Recon (zakończona)

3 równoległe agenty zmapowały powierzchnię. Pełne wyniki w transkryptach zadań; kluczowe pliki do głębszej analizy w fazie 2:

- `api/main.py` — middleware `enforce_api_auth` (linie 524-565), security headers, lifespan
- `api/auth.py` — JWT (HS256), rate limiter (in-memory sliding window), token types
- `api/admin.py` — `require_admin`/`require_superadmin`, separate token type ADMIN
- `api/db/repos/{keys,armoury,chat,targets,push,analytics,...}.py` — SQL surface
- `api/routers/stats.py`, `api/routers/spy.py`, `api/main.py:787` (`/api/enemy`) — IDOR-podejrzane endpointy
- `api/torn_client.py` — external HTTP, scope: brak SSRF (URL hardcoded), ale klucz w query string
- `api/scheduler/jobs/*.py` — background jobs z dostępem do KeyStore
- `frontend/src/lib/api-client.ts` — token w localStorage (linie 14, useAdminSession.ts:50)
- `frontend/src/components/layout/AuthGate.tsx` + `frontend/src/hooks/useAdminSession.ts`
- `frontend/src/app/company/director/page.tsx:719` — `dangerouslySetInnerHTML`
- `frontend/src/app/layout.tsx:38-42` — Umami script bez SRI
- `frontend/src/hooks/useChat.ts:185` — token w query stringu WebSocket
- `Dockerfile` — brak USER directive (root)
- `.github/workflows/deploy.yml` — actions pinned by tag, brak `permissions:` block

---

## Faza 2 — Static analysis: kandydaci na findings

Recon ujawnił następujących kandydatów. **W fazie wykonawczej** (po ExitPlanMode) każdy zostanie potwierdzony przez głęboki review kodu, sklasyfikowany CVSS, dostanie opis ataku i konkretny fix.

### CRITICAL (verify-and-fix natychmiast)

**C-01: IDOR — wyciek battle stats wszystkich członków przez `baseline_pid`**
- `api/main.py:787` (`/api/enemy`), parametr query `baseline_pid` przyjmowany bez weryfikacji że caller posiada ten klucz.
- Kod (z reconu): `key_store.get_key(baseline_pid)` bez ownership check — caller może wskazać dowolnego member-a.
- Impact: każdy zalogowany member czyta personal stats / spy estimates dowolnego innego membera (high-tier member intel).
- CWE-639 / OWASP API1:2023.

**C-02: IDOR — wyciek pełnej historii statystyk dowolnego gracza**
- `api/routers/stats.py:52` (`GET /api/stats/snapshots/{player_id}`) i `:65` (`/api/stats/growth/{player_id}`) — brak weryfikacji, że caller == player_id lub ma uprawnienie.
- Impact: any member czyta growth history wszystkich graczy, w tym admin i superadmin.
- CWE-639.

**C-03: Możliwa SQL injection przez kwargs keys w `armoury.py:33`**
- `update_competition()` buduje SQL przez f-string z kluczy `kwargs`. Recon wskazał, że kwargs przychodzą z body endpointu (`admin_push.py` template update) — admin-only, ale **brak whitelisty kolumn**.
- Wymaga weryfikacji: czy każdy caller (w obecnym kodzie i przyszłym) waliduje klucze przeciwko allowliście?
- Impact (jeśli admin ID zostanie kiedykolwiek skompromitowany lub feature rozszerzy callerów): full DB write (`UPDATE armoury_competitions SET name=1; DROP TABLE admin_roles; --`).
- CWE-89.

### HIGH (fix w bieżącym sprintcie)

**H-01: JWT (sessionToken, adminToken) w `localStorage` — XSS = full account takeover**
- `frontend/src/lib/api-client.ts:14`, `frontend/src/hooks/useAdminSession.ts:50`.
- Każdy XSS (kandydaci poniżej) → kradzież tokenu → przejęcie sesji (member lub admin).
- CWE-922 / OWASP A02.

**H-02: `dangerouslySetInnerHTML` na news-feedzie z Torn API**
- `frontend/src/app/company/director/page.tsx:719` renderuje `n.news` z Torn.com bez sanityzacji.
- Wektor: jeśli ktokolwiek może wpłynąć na content news (np. inny gracz wykonuje akcję, której news Torn rejestruje z user-controlled tekstem) — stored/reflected XSS w Hubie.
- Wymaga weryfikacji: jakie pola w `n.news` może ustawić atakujący (nazwa company? nickname? subject?).
- CWE-79.

**H-03: Hardcoded SUPERADMIN_ID = 2362436**
- `api/config.py:26`. Brak rotacji, brak backup superadmin, brak multi-sig recovery.
- Single point of failure — kompromitacja konta Bombel = pełne admin nad wszystkimi kluczami API.
- CWE-798.

**H-04: Brak rate-limit / IDOR ownership check na `/api/admin/session`**
- `api/admin.py:62` — każdy posiadacz session token z `is_admin == True` w DB dostaje admin token bez re-auth (np. password / TOTP).
- Skompromitowany session token (H-01) → automatyczna eskalacja do admin token jeśli właściciel jest admin-em.

**H-05: CSP `unsafe-inline` (script + style)**
- `api/main.py:548-565` — CSP z `script-src 'self' 'unsafe-inline'`. Praktycznie wyłącza CSP jako mitygację XSS.
- Po fixie H-02 i refaktorze inline styles → można przejść na nonce-based CSP.
- CWE-1021.

### MEDIUM

**M-01: Token w query stringu WebSocket** — `frontend/src/hooks/useChat.ts:185`. Tokeny w URL trafiają do logów (nginx access log, history przeglądarki). Same-origin łagodzi, ale defense-in-depth sugeruje subprotocol header.

**M-02: Missing `rel="noopener noreferrer"`** — 5 `target="_blank"` w `revives/page.tsx:144,185,190` i `targets/page.tsx:227,243`. Reverse-tabnabbing ryzyko (CWE-1022).

**M-03: F-string SQL pattern w trzech repo** — `targets.py:40`, `chat.py:49` (wlistowane), `armoury.py:33`. Nawet jeśli obecnie safe, regression-prone. Refaktor na statyczne SQL + osobne metody per-pole.

**M-04: Container Docker działa jako root** — `Dockerfile` brak `USER`. Container escape ⇒ root na hoście (mitygowane przez user namespaces, ale defense-in-depth).

**M-05: Umami analytics bez SRI** — `frontend/src/app/layout.tsx:38-42` ładuje `analityka.tri.ovh/script.js` bez Subresource Integrity. Kompromitacja tego subdomain (czy własny? — REVIEW) → XSS na całym Hubie. SRI to fix-it-now.

**M-06: GitHub Actions przypięte tagiem (`@v4`), nie SHA** — `.github/workflows/deploy.yml`. Supply chain — typosquat / re-pointed tag risk. Fix: pin do SHA + `dependabot` na actions.

**M-07: Brak `permissions:` block w workflow** — domyślne `write` permissions dla GITHUB_TOKEN. Ograniczenie do `contents: read` minimalizuje blast radius przy compromitacji.

**M-08: APScheduler 4.0.0a5 (alpha)** — `pyproject.toml:12`. Pre-release w produkcji — kandydat na breakage + nieobsługiwane CVE windows.

**M-09: Brak session revocation** — JWT tylko z `exp`, brak deny-listy. Wyciek tokenu = aktywny do `iat + 24h`.

**M-10: Rate limiter unbounded memory** — `api/auth.py` in-memory dict bez TTL eviction. Long-running prod accumulates klucze (slow DoS / memory leak).

**M-11: Backup keys.db nieudokumentowany** — `data/keys.db` mounted as volume; brak rotacji, brak backupu offsite. Utrata woluminu = wszystkie zaszyfrowane klucze stracone.

### LOW / Info

**L-01: Encryption key & JWT secret bez rotacji** — wymaga procesu (manual rotation z re-encryption keys.db).

**L-02: Brak audit trail dla admin actions** — promote/demote admin, key revoke, announcement create — bez logu kto-kiedy-co. Forensics blind.

**L-03: Brak `/health` endpoint w FastAPI** — proxied via 404; minor log noise + brak liveness signal w czasie awarii routera.

**L-04: Node 20 EOL kwiecień 2026** — upgrade do Node 22 LTS w przyszłym kwartale.

**L-05: B2 path traversal w `b2_client.py:upload_bytes`** — internal-only obecnie. Jeśli kiedykolwiek przyjmie user input → CWE-22.

**L-06: Logger.exception() z full traceback** — `api/main.py:623`. Mitigated: tracebacki tylko w logach, response generic. Verify że logs nie są publicznie eksponowane.

**L-07: Brak Argon2id / dedicated password hash** — N/A (system bez haseł, tylko Torn API key + JWT). Info: nie wprowadzać password auth bez Argon2id.

---

## Faza wykonawcza (po ExitPlanMode)

1. **Deep static review** — dla każdego kandydata C-/H-/M-/L- otworzyć plik, potwierdzić exploit path, zapisać dokładny `file:line`, zaproponować fix (konkretna zmiana, nie ogólnik).
2. **Run automated scans** (READ-ONLY, lokalnie):
   - `uv run pip-audit` (Python deps CVE)
   - `cd frontend && npm audit --production` (Node deps CVE)
   - `gitleaks detect --source . --no-banner --redact` (secret history scan)
   - Opcjonalnie `semgrep --config=auto api/` (Python SAST) i `eslint-plugin-security` na frontendzie
3. **STRIDE per komponent** — diagram (auth, admin, scheduler, torn_client, frontend AuthGate, deployment).
4. **Re-classify** wszystkie findings według CVSS v3.1.
5. **Wygenerować raport** w `Plans/security-audit-findings.md`:
   - Executive summary (1 strona, top risks, posture)
   - Threat model
   - Findings F-01 .. F-NN (severity desc)
   - Remediation roadmap (Critical → Low z effort estimate)
   - Hardening recommendations
   - Re-audit checklist (jak zweryfikować po fixach)

## Verification

1. Wszystkie 12 obszarów z metodyki obowiązkowo pokryte (każdy ma sekcję w raporcie albo "no findings — methodology X applied").
2. Każde finding ma: severity + CVSS + lokalizacja + opis ataku + impact + konkretny fix (file:line + diff-pseudokod) + verification + defense-in-depth.
3. Raport ma roadmapę priorytetową (effort estimate Critical→Low).
4. Re-test plan: po implementacji fixów ponowny SAST diff potwierdzi brak Critical/High.
5. Defense-in-depth dla każdego finding (nawet po fix → druga warstwa).

## Out of scope dla tego audytu

- Active pentest na produkcji
- Mobile (brak)
- Hosting / sieć (Coolify VPS warstwa)
- Pełen exploit chain z weaponization (decyzja usera: tylko opis + file:line)

## Status faz

- [x] Phase 1 init: zakres ustalony z userem
- [x] Phase 1 recon: 3 agenty (backend, frontend, infra) — kandydaci na findings zmapowani
- [x] Phase 2 design: konsolidacja kandydatów (ten dokument)
- [ ] Phase 3 review: ExitPlanMode → akceptacja użytkownika
- [ ] Phase 4 wykonanie: deep static review + scans + raport `Plans/security-audit-findings.md`
