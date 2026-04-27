# Fix: "Missing X-Player-Id header" in Admin → Spy Data

## Context

Wchodząc do panelu admina na zakładkę "Spy Data" pojawia się błąd:
**`Missing X-Player-Id header`**.

`SpyAdmin.tsx` na starcie woła równolegle trzy endpointy przez `adminFetch`:
- `/api/spy/known`               ← **regular endpoint, nie `/api/admin/*`**
- `/api/spy/admin/blocked`       ← admin
- `/api/spy/admin/hidden`        ← admin

Middleware backendu (`api/main.py:527`) wymaga `X-Player-Id` dla wszystkich
ścieżek `/api/*` które **nie** zaczynają się od `/api/admin/` i nie są w
`PUBLIC_API_PATHS`. `adminFetch` (z `useAdminSession.ts`) ustawia tylko
`Authorization: Bearer <adminToken>` — **nie wysyła `X-Player-Id`**. Dlatego
`/api/spy/known` zwraca 400 z komunikatem widzianym przez użytkownika.

Token admina ma `sub == player_id` admina, więc dorzucenie `X-Player-Id` z
localStorage (`myKeyPlayer`) spełnia warunek `int(player_id_raw) == payload["sub"]`
w middleware (main.py:542).

## Approach (surgical)

Dodać `X-Player-Id` do nagłówków w `adminFetch`. Zero rearchitekcji, zero
zmian w API ani w `SpyAdmin.tsx`. Jedna funkcja, jeden plik.

### File to change

**`frontend/src/hooks/useAdminSession.ts`** — funkcja `doFetch` w `adminFetch` (linie 85–92).

### Change

Przed:
```ts
const doFetch = async (t: string) =>
  fetch(path, {
    ...init,
    headers: {
      ...((init?.headers as Record<string, string>) || {}),
      Authorization: `Bearer ${t}`,
    },
  });
```

Po:
```ts
const doFetch = async (t: string) => {
  const pid = typeof window !== "undefined" ? localStorage.getItem("myKeyPlayer") : null;
  return fetch(path, {
    ...init,
    headers: {
      ...((init?.headers as Record<string, string>) || {}),
      Authorization: `Bearer ${t}`,
      ...(pid ? { "X-Player-Id": pid } : {}),
    },
  });
};
```

Klucz `myKeyPlayer` jest tym samym, którego używa `apiFetch` w
`frontend/src/lib/api-client.ts:9` — spójność z istniejącym wzorcem.

### Why this is safe

- Endpointy `/api/admin/*` ignorują `X-Player-Id` (middleware ich nie sprawdza
  — `main.py:527`). Dodanie nagłówka nic im nie psuje.
- Endpointy poza `/api/admin/*` (jak `/api/spy/known`) wymagają go — i go
  dostają.
- `payload["sub"]` w admin tokenie to player_id admina, identyczny z
  `myKeyPlayer` (admin token jest tworzony z session tokena tego samego
  użytkownika — `useAdminSession.ts:6`).

## Verification

1. **Build frontend**:
   ```bash
   cd frontend && npm run build
   ```
   Powinien przejść bez błędów typów.

2. **Lokalny test**:
   ```bash
   TORN_API_KEY=xxx uvicorn api.main:app --reload --port 8000
   cd frontend && npm run dev
   ```
   - Zaloguj się jako admin (Bombel 2362436).
   - Otwórz `/admin`, kliknij zakładkę "Spy Data".
   - Powinno załadować trzy listy (estimates, blocked, hidden) bez 400.
   - W DevTools → Network: `/api/spy/known` → 200, request headers zawierają
     `X-Player-Id: 2362436` i `Authorization: Bearer ...`.
   - Spróbuj zablokować/odblokować/ukryć/odkryć gracza (POST/DELETE na
     `/api/spy/admin/*`) — nadal działa.

3. **Backend tests** (sanity, nic nie powinno się popsuć):
   ```bash
   uv run pytest tests/test_spy.py -v
   ```

4. **Po deployu** (per CLAUDE.md): browser walkthrough hub.tri.ovh — sprawdź
   `/admin` → Spy Data, czy ładuje dane bez błędu.

## Out of scope

- Audyt innych miejsc gdzie `adminFetch` mógłby wołać regular endpointy
  (obecnie tylko `SpyAdmin.tsx` to robi — pozostałe komponenty admina wołają
  wyłącznie `/api/admin/*`). Fix jest defensywny — nawet jeśli pojawi się
  podobne wywołanie w przyszłości, header będzie dołączony.
- Refaktor `adminFetch` żeby używał `apiFetch` — większa zmiana, niepotrzebna
  do naprawy tego buga.
