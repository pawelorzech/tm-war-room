# Admin Panel — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Project:** tm-war-room (rw.tri.ovh)

## Overview

Admin panel for the TM War Room dashboard — a developer/ops/leadership panel providing API key management, usage statistics, error monitoring, and system health information. Accessible only to hardcoded admin player IDs via a dedicated "Admin" tab with JWT session authentication.

## Goals

1. Give faction leadership visibility into who has registered API keys and the ability to remove them
2. Provide usage analytics: request volume, active users, error rates
3. Surface system health: uptime, cache status, integration health (Torn API, TornStats, YATA)
4. Secure admin operations with session tokens (JWT) verified on every request

## Non-Goals

- User management beyond API key removal (no banning, no roles)
- Real-time monitoring or alerting
- Viewing actual API key values (always encrypted, never exposed)

---

## Authentication & Sessions

### Admin Identification

Hardcoded set in `app/config.py`:

```python
ADMIN_PLAYER_IDS = {2206960}  # Bombla
```

Adding/removing admins requires code change and redeploy.

### Session Flow

1. Admin logs in via the normal API key flow (paste key, validated against faction membership)
2. `GET /api/me` returns `is_admin: true` if `player_id` is in `ADMIN_PLAYER_IDS`
3. First click on "Admin" tab triggers `POST /api/admin/session`
4. Backend:
   - Decrypts admin's stored API key
   - Calls Torn API to verify identity (confirms the key belongs to the claimed player_id)
   - Generates JWT (HS256, signed with `JWT_SECRET` env var, 24h expiry)
5. JWT stored in `localStorage`, sent as `Authorization: Bearer <token>` on all `/api/admin/*` requests
6. Admin middleware validates: signature + expiry + `sub` in `ADMIN_PLAYER_IDS`

### JWT Payload

```json
{
  "sub": 2206960,
  "name": "Bombla",
  "iat": 1711540800,
  "exp": 1711627200
}
```

### Environment Variables

- `JWT_SECRET` — **required**, app refuses to start if not set
- `APP_VERSION` — optional, git commit hash or tag for display

### Dependency

- `PyJWT` added to `pyproject.toml`

---

## Request Logging

### Database

New file: `data/analytics.db` (separate from `data/keys.db`)

```sql
CREATE TABLE request_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    player_id INTEGER,
    player_name TEXT,
    method TEXT,
    endpoint TEXT,
    status_code INTEGER,
    response_time_ms REAL,
    error_message TEXT
);

CREATE INDEX idx_request_log_timestamp ON request_log(timestamp);
CREATE INDEX idx_request_log_player_id ON request_log(player_id);
CREATE INDEX idx_request_log_endpoint ON request_log(endpoint);
```

### FastAPI Middleware

- Intercepts all `/api/*` requests
- Measures response time
- Extracts `player_id` from `X-Player-Id` header
- Writes to `request_log` via `BackgroundTasks` (fire-and-forget, non-blocking)
- Skips healthcheck and static file requests

### Integration Health Tracking

Separate table in `analytics.db` for outgoing API call health:

```sql
CREATE TABLE integration_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    service TEXT NOT NULL,     -- 'torn_api', 'tornstats', 'yata'
    endpoint TEXT,             -- specific URL/path called
    success INTEGER NOT NULL,  -- 1 = ok, 0 = error
    response_time_ms REAL,
    error_message TEXT
);

CREATE INDEX idx_integration_log_service ON integration_log(service);
CREATE INDEX idx_integration_log_timestamp ON integration_log(timestamp);
```

Logged from `torn_client.py` — each outgoing HTTP call records service name, success/failure, response time, and error message. Fire-and-forget write via the same async pattern as `request_log`.

### Retention

Entries older than 30 days deleted automatically from both `request_log` and `integration_log`. Cleanup runs on app startup.

### Privacy

- Never logs request body (could contain API keys during registration)
- Never logs raw headers
- Logs: endpoint, method, status code, response time, player_id, error message (from response only)

---

## Admin API Endpoints

All under `/api/admin/*`, protected by JWT middleware.

### Key Management

**`GET /api/admin/keys`**
Returns list of registered keys (without the key itself):
```json
{
  "keys": [
    {
      "player_id": 2206960,
      "player_name": "Bombla",
      "is_faction_key": true,
      "created_at": "2026-03-27T12:00:00"
    }
  ],
  "registered_count": 23,
  "total_faction_members": 70
}
```

**`DELETE /api/admin/keys/{player_id}`**
Removes a member's API key. Logs who deleted whose key. Admin cannot delete their own key through this endpoint (must use normal `/api/keys/{player_id}` flow to prevent self-lock-out).

### Usage Statistics

**`GET /api/admin/stats/requests?days=7`**
Aggregated request stats:
```json
{
  "per_day": [
    {"date": "2026-03-27", "count": 1523, "avg_response_ms": 45.2}
  ],
  "per_endpoint": [
    {"endpoint": "/api/overview", "count": 890, "avg_response_ms": 120.5}
  ],
  "total_requests": 1523
}
```

**`GET /api/admin/stats/users?days=7`**
Active users:
```json
{
  "users": [
    {
      "player_id": 2206960,
      "player_name": "Bombla",
      "last_seen": "2026-03-27T15:30:00",
      "request_count": 234
    }
  ]
}
```

**`GET /api/admin/stats/errors?days=7`**
Error summary:
```json
{
  "errors": [
    {
      "endpoint": "/api/enemy",
      "status_code": 502,
      "count": 3,
      "last_occurred": "2026-03-27T14:00:00",
      "last_error_message": "TornStats API timeout"
    }
  ]
}
```

### System Health

**`GET /api/admin/system`**
Single call returning all system info:
```json
{
  "uptime_seconds": 86400,
  "version": "b4c9fb7",
  "cache": {
    "entries": 5,
    "last_refresh": "2026-03-27T15:29:00"
  },
  "integrations": {
    "torn_api": {"status": "ok", "last_success": "...", "last_error": null},
    "tornstats": {"status": "ok", "last_success": "...", "last_error": null},
    "yata": {"status": "error", "last_success": "...", "last_error": "timeout at ..."}
  }
}
```

Integration status derived from `integration_log` — last successful and last failed outgoing call per external service.

---

## Security

### JWT Security

- `JWT_SECRET` required env var — app refuses to start without it
- HS256, 24h expiry, no refresh tokens — admin re-authenticates after expiry
- Every request: validate signature + expiry + `sub` must be in `ADMIN_PLAYER_IDS`
- If admin removed from hardcoded list and redeployed, existing JWTs immediately invalid (list checked on every request)

### Rate Limiting

- `POST /api/admin/session`: max 5 attempts per IP per minute (prevents brute-force)
- `/api/admin/*`: max 60 requests per minute per token (prevents abuse)
- Rate limit state stored in-memory (dict of IP/token → timestamps). Resets on app restart, which is acceptable for rate limiting.

### Destructive Operations

- `DELETE /api/admin/keys/{player_id}` logs: admin player_id (from JWT) + target player_id to `request_log`
- Admin cannot delete own key via admin panel (prevents self-lock-out)

### Data Privacy

- Request body never logged (may contain API keys)
- Raw headers never logged
- Logged: endpoint, method, status, response time, player_id, error message
- `analytics.db` file permissions: 600 (rw owner only)
- Separate database from `keys.db` — compromised logs don't expose encrypted keys

### Input Validation

- All query params (`days`, `player_id`) validated via Pydantic
- `player_id` in DELETE must be integer — prevents injection

---

## Frontend

### Navigation

- New "Admin" tab in tab bar, aligned to the right (`margin-left: auto`)
- Visible only when `GET /api/me` returns `is_admin: true`
- Lock or gear icon next to "Admin" text — visually distinct from regular tabs

### JWT Flow (transparent)

- First click on "Admin" tab: check `localStorage` for valid JWT
- If missing or expired (401 from backend): call `POST /api/admin/session`, store JWT
- No separate login screen — automatic and transparent

### Layout — Three Cards

**Card 1: System (top)**
- Uptime, version
- Integration status as colored badges: green = OK, red = error with timestamp of last failure
- Cache info: entry count, last refresh time

**Card 2: API Keys (middle)**
- Table: Player Name, Player ID, Type (faction/personal), Registration Date
- Coverage progress bar: "23/70 members registered"
- "Remove" button per row with confirmation dialog ("Remove key for player X?")

**Card 3: Usage (bottom)**
- Requests per day: CSS bar chart (last 7 days, no chart library)
- Active users table: Player Name, Last Seen (relative time), Request Count
- Errors table: Endpoint, Status Code, Count, Last Occurred
- Date range selector: 7d / 14d / 30d

### Style

- Same dark/light theme as rest of dashboard
- Vanilla JS, no new frontend dependencies
- No auto-refresh — manual only (refresh button or tab re-click)

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `app/admin.py` | Admin APIRouter, admin endpoints |
| `app/analytics.py` | `analytics.db` init, logging middleware, integration tracking, query functions |
| `app/auth.py` | JWT creation/validation, session management, rate limiting |
| `tests/test_admin.py` | Admin endpoint tests |
| `tests/test_analytics.py` | Middleware logging and retention tests |

### Modified Files

| File | Changes |
|------|---------|
| `app/main.py` | Mount admin router, add analytics middleware, `GET /api/me`, store `app_start_time` |
| `app/config.py` | `ADMIN_PLAYER_IDS`, `JWT_SECRET`, `APP_VERSION` |
| `static/index.html` | New "Admin" tab in navigation |
| `static/app.js` | Admin tab logic: JWT flow, fetch + render three cards, delete confirmation |
| `static/style.css` | Admin panel styles: tab alignment, status badges, CSS bar chart, coverage bar |
| `pyproject.toml` | Add `PyJWT` dependency |
| `app/torn_client.py` | Add integration health logging after each outgoing HTTP call (minimal change) |

### Unchanged Files

- `app/db.py` — key storage untouched
- `app/threat.py` — threat scoring untouched
- `app/models.py` — existing models untouched (admin models live in `app/admin.py`)
