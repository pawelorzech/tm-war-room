# TM Hub Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge tm-war-room and tm-training-guide into a unified platform (TM Hub) with sidebar navigation, role-based access, and an admin announcement system.

**Architecture:** Monorepo with Next.js 15 frontend (static export) served by existing FastAPI backend. Backend renamed from `app/` to `api/`, frontend lives in `frontend/`. Multi-stage Docker build produces one container.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.9, Tailwind CSS v4, Chart.js 4, FastAPI, SQLite, Python 3.12

**Source repos:**
- War Room: `/Users/pawelorzech/Programowanie/tm-war-room` (this repo)
- Training Guide: `/Users/pawelorzech/Programowanie/tm-training-guide` (source for components)

**Design quality:** Use the `frontend-design` skill for all UI component implementation. Mobile is first-class.

---

## Task 1: Rename `app/` to `api/` and fix all references

**Files:**
- Rename: `app/` → `api/`
- Modify: `pyproject.toml`
- Modify: `Dockerfile`
- Modify: `tests/` (all test files that import from `app.`)
- Modify: `.github/workflows/deploy.yml`

This is a preparatory refactor. All internal imports change from `app.X` to `api.X`.

- [ ] **Step 1: Rename the directory**

```bash
git mv app api
```

- [ ] **Step 2: Update all Python imports**

In every `.py` file under `api/` and `tests/`, replace `from app.` with `from api.` and `import app.` with `import api.`. Key files:

`api/main.py` — update these lines:
```python
from api.analytics import AnalyticsStore
from api.config import TORN_API_KEY, FACTION_ID, CACHE_TTL, ENCRYPTION_KEY, TORNSTATS_API_KEY, ADMIN_PLAYER_IDS
import api.config as config_mod
from api.torn_client import TornClient
from api.db import KeyStore
from api.threat import compute_threat
from api.admin import router as admin_router
import api.admin as admin_mod
```

`api/admin.py` — update:
```python
from api.config import ADMIN_PLAYER_IDS, JWT_SECRET, APP_VERSION
from api.auth import create_jwt, decode_jwt, rate_limiter
```

All `tests/test_*.py` files — update imports similarly (e.g., `from api.models import ...`).

- [ ] **Step 3: Update pyproject.toml**

Change the project name and version:
```toml
[project]
name = "tm-hub"
version = "1.0.0"
description = "Torn.com faction toolkit for The Masters"
```

- [ ] **Step 4: Update Dockerfile**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .
COPY api/ api/
COPY static/ static/
RUN mkdir -p data
EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 5: Run tests**

```bash
uv run pytest tests/ -v
```

Expected: All 68 tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: rename app/ to api/ for monorepo clarity"
```

---

## Task 2: Scaffold Next.js frontend

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/next.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/postcss.config.mjs`
- Create: `frontend/src/app/globals.css`
- Create: `frontend/src/app/layout.tsx`
- Create: `frontend/src/app/page.tsx`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /Users/pawelorzech/Programowanie/tm-war-room
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --no-import-alias --no-turbopack
```

Answer prompts: Yes to TypeScript, Yes to ESLint, Yes to Tailwind, Yes to src/ directory, No to import alias, App Router.

- [ ] **Step 2: Configure static export**

`frontend/next.config.ts`:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
```

- [ ] **Step 3: Install additional dependencies**

```bash
cd frontend
npm install chart.js react-chartjs-2
```

- [ ] **Step 4: Set up Tailwind theme with Torn colors**

`frontend/src/app/globals.css`:
```css
@import "tailwindcss";

@theme {
  --color-torn-green: #3fb950;
  --color-torn-green-dim: #238636;
  --color-torn-red: #f85149;
  --color-torn-yellow: #d29922;
  --color-torn-blue: #58a6ff;

  --color-bg-primary: #0d1117;
  --color-bg-surface: #161b22;
  --color-bg-elevated: #1c2128;
  --color-border: #30363d;
  --color-border-light: #21262d;

  --color-text-primary: #e6edf3;
  --color-text-secondary: #8b949e;
  --color-text-muted: #484f58;
}
```

- [ ] **Step 5: Create root layout**

`frontend/src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TM Hub",
  description: "Torn.com faction toolkit for The Masters",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark">
      <body className="min-h-full bg-bg-primary text-text-primary">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Create placeholder page**

`frontend/src/app/page.tsx`:
```tsx
export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <h1 className="text-2xl font-bold text-torn-green">TM Hub</h1>
    </div>
  );
}
```

- [ ] **Step 7: Verify build**

```bash
cd frontend && npm run build
```

Expected: Build succeeds, `out/` directory created with static files.

- [ ] **Step 8: Add frontend to .gitignore**

Add to root `.gitignore`:
```
frontend/node_modules/
frontend/out/
frontend/.next/
```

- [ ] **Step 9: Commit**

```bash
git add frontend/ .gitignore
git commit -m "feat: scaffold Next.js frontend with Tailwind"
```

---

## Task 3: Backend — Role system and `/api/me` upgrade

**Files:**
- Modify: `api/config.py`
- Modify: `api/db.py`
- Modify: `api/main.py` (the `/api/me` endpoint)
- Modify: `api/admin.py` (the `require_admin` dependency)
- Create: `tests/test_roles.py`

- [ ] **Step 1: Update config.py**

Replace `ADMIN_PLAYER_IDS` with `SUPERADMIN_ID`:

```python
SUPERADMIN_ID: int = 2362436  # Bombel
```

Remove: `ADMIN_PLAYER_IDS: set[int] = {2362436}`

- [ ] **Step 2: Add admin_roles table to db.py**

Add to `KeyStore.__init__` (after `_init_db`), or better — add a new class. Add these methods to `KeyStore`:

```python
def _init_db(self) -> None:
    conn = sqlite3.connect(self._db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS member_keys (
            player_id INTEGER PRIMARY KEY,
            player_name TEXT NOT NULL,
            api_key_encrypted BLOB NOT NULL,
            is_faction_key INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    try:
        conn.execute("ALTER TABLE member_keys ADD COLUMN is_faction_key INTEGER NOT NULL DEFAULT 0")
    except Exception:
        pass
    conn.execute("""
        CREATE TABLE IF NOT EXISTS admin_roles (
            player_id INTEGER PRIMARY KEY,
            granted_by INTEGER NOT NULL,
            granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

def get_admins(self) -> list[dict]:
    conn = sqlite3.connect(self._db_path)
    rows = conn.execute(
        "SELECT a.player_id, a.granted_by, a.granted_at, k.player_name "
        "FROM admin_roles a LEFT JOIN member_keys k ON a.player_id = k.player_id"
    ).fetchall()
    conn.close()
    return [{"player_id": r[0], "granted_by": r[1], "granted_at": r[2], "player_name": r[3] or "Unknown"} for r in rows]

def is_admin(self, player_id: int) -> bool:
    conn = sqlite3.connect(self._db_path)
    row = conn.execute("SELECT 1 FROM admin_roles WHERE player_id = ?", (player_id,)).fetchone()
    conn.close()
    return row is not None

def promote_admin(self, player_id: int, granted_by: int) -> None:
    conn = sqlite3.connect(self._db_path)
    conn.execute(
        "INSERT OR IGNORE INTO admin_roles (player_id, granted_by) VALUES (?, ?)",
        (player_id, granted_by),
    )
    conn.commit()
    conn.close()

def demote_admin(self, player_id: int) -> None:
    conn = sqlite3.connect(self._db_path)
    conn.execute("DELETE FROM admin_roles WHERE player_id = ?", (player_id,))
    conn.commit()
    conn.close()
```

- [ ] **Step 3: Add role resolution helper to main.py**

```python
from api.config import TORN_API_KEY, FACTION_ID, CACHE_TTL, ENCRYPTION_KEY, TORNSTATS_API_KEY, SUPERADMIN_ID

def get_role(player_id: int) -> str:
    """Return 'superadmin', 'admin', or 'member'."""
    if player_id == SUPERADMIN_ID:
        return "superadmin"
    if key_store.is_admin(player_id):
        return "admin"
    return "member"
```

- [ ] **Step 4: Update `/api/me` endpoint**

```python
@app.get("/api/me")
async def me(x_player_id: int = Header()):
    all_keys = key_store.get_all_keys()
    if not any(k["player_id"] == x_player_id for k in all_keys):
        raise HTTPException(status_code=401, detail="Register your API key first")
    role = get_role(x_player_id)
    return {
        "player_id": x_player_id,
        "role": role,
        "is_admin": role in ("admin", "superadmin"),
        "is_superadmin": role == "superadmin",
    }
```

- [ ] **Step 5: Update admin.py to use role system**

Replace `ADMIN_PLAYER_IDS` references:

```python
from api.config import SUPERADMIN_ID, JWT_SECRET, APP_VERSION

async def require_admin(request: Request) -> dict:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization")
    token = auth_header[7:]
    payload = decode_jwt(token, JWT_SECRET)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    pid = payload["sub"]
    if pid != SUPERADMIN_ID and not _key_store.is_admin(pid):
        raise HTTPException(status_code=403, detail="Not an admin")
    if not rate_limiter.check(f"admin:{pid}", max_requests=60):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    payload["role"] = "superadmin" if pid == SUPERADMIN_ID else "admin"
    return payload

async def require_superadmin(request: Request) -> dict:
    payload = await require_admin(request)
    if payload["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin only")
    return payload
```

Update `create_session` to allow admins (not just superadmin):

```python
@router.post("/session")
async def create_session(request: Request, x_player_id: int = Header()):
    client_ip = request.client.host if request.client else "unknown"
    if not rate_limiter.check(f"session:{client_ip}", max_requests=5):
        raise HTTPException(status_code=429, detail="Too many attempts, try again later")
    if x_player_id != SUPERADMIN_ID and not _key_store.is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Not an admin")
    all_keys = _key_store.get_all_keys()
    user_key = next((k for k in all_keys if k["player_id"] == x_player_id), None)
    if not user_key:
        raise HTTPException(status_code=401, detail="No API key registered")
    resp = await _torn_client._http.get(
        "https://api.torn.com/user/",
        params={"selections": "profile", "key": user_key["api_key"]},
    )
    resp.raise_for_status()
    raw = resp.json()
    if inspect.isawaitable(raw):
        raw = await raw
    if "error" in raw or raw.get("player_id") != x_player_id:
        raise HTTPException(status_code=401, detail="API key verification failed")
    token = create_jwt(x_player_id, user_key["player_name"], JWT_SECRET)
    return {"token": token}
```

- [ ] **Step 6: Add admin management endpoints to admin.py**

```python
@router.get("/admins")
async def list_admins(admin: dict = Depends(require_admin)):
    admins = _key_store.get_admins()
    return {"admins": admins, "superadmin_id": SUPERADMIN_ID}

@router.post("/admins/{player_id}")
async def promote_admin(player_id: int, admin: dict = Depends(require_superadmin)):
    all_keys = _key_store.get_all_keys()
    if not any(k["player_id"] == player_id for k in all_keys):
        raise HTTPException(status_code=404, detail="Player not registered")
    if player_id == SUPERADMIN_ID:
        raise HTTPException(status_code=400, detail="Superadmin cannot be promoted")
    _key_store.promote_admin(player_id, admin["sub"])
    return {"status": "ok", "promoted": player_id}

@router.delete("/admins/{player_id}")
async def demote_admin(player_id: int, admin: dict = Depends(require_superadmin)):
    _key_store.demote_admin(player_id)
    return {"status": "ok", "demoted": player_id}
```

- [ ] **Step 7: Write tests**

`tests/test_roles.py`:
```python
import sqlite3
import os
import pytest
from api.db import KeyStore

@pytest.fixture
def key_store(tmp_path):
    from cryptography.fernet import Fernet
    key = Fernet.generate_key().decode()
    ks = KeyStore(db_path=str(tmp_path / "test.db"), encryption_key=key)
    return ks

def test_no_admins_initially(key_store):
    assert key_store.get_admins() == []

def test_is_admin_false_by_default(key_store):
    assert key_store.is_admin(12345) is False

def test_promote_and_check(key_store):
    key_store.promote_admin(12345, granted_by=2362436)
    assert key_store.is_admin(12345) is True
    admins = key_store.get_admins()
    assert len(admins) == 1
    assert admins[0]["player_id"] == 12345
    assert admins[0]["granted_by"] == 2362436

def test_demote(key_store):
    key_store.promote_admin(12345, granted_by=2362436)
    key_store.demote_admin(12345)
    assert key_store.is_admin(12345) is False
    assert key_store.get_admins() == []

def test_promote_idempotent(key_store):
    key_store.promote_admin(12345, granted_by=2362436)
    key_store.promote_admin(12345, granted_by=2362436)
    assert len(key_store.get_admins()) == 1
```

- [ ] **Step 8: Run tests**

```bash
uv run pytest tests/ -v
```

Expected: All tests pass (old + new).

- [ ] **Step 9: Commit**

```bash
git add api/ tests/
git commit -m "feat: add role system with superadmin/admin/member levels"
```

---

## Task 4: Backend — Announcement system

**Files:**
- Modify: `api/db.py` (add AnnouncementStore)
- Modify: `api/models.py` (add Pydantic models)
- Modify: `api/main.py` (add announcement endpoints)
- Create: `tests/test_announcements.py`

- [ ] **Step 1: Add Announcement Pydantic models**

Add to `api/models.py`:
```python
class Announcement(BaseModel):
    id: int
    type: str  # alert, warning, info, success
    message: str
    created_by: int
    created_at: str
    expires_at: str | None = None
    revoked_at: str | None = None
    revoked_by: int | None = None
    revoke_reason: str | None = None

class AnnouncementCreate(BaseModel):
    type: str
    message: str
    expires_at: str | None = None
```

- [ ] **Step 2: Add announcements table and methods to db.py**

Add to `KeyStore._init_db` (after `admin_roles` table):
```python
conn.execute("""
    CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('alert', 'warning', 'info', 'success')),
        message TEXT NOT NULL,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        revoked_at TIMESTAMP,
        revoked_by INTEGER,
        revoke_reason TEXT
    )
""")
```

Add methods to `KeyStore`:
```python
def create_announcement(self, type: str, message: str, created_by: int, expires_at: str | None = None) -> int:
    conn = sqlite3.connect(self._db_path)
    cur = conn.execute(
        "INSERT INTO announcements (type, message, created_by, expires_at) VALUES (?, ?, ?, ?)",
        (type, message, created_by, expires_at),
    )
    ann_id = cur.lastrowid
    conn.commit()
    conn.close()
    return ann_id

def get_active_announcements(self) -> list[dict]:
    conn = sqlite3.connect(self._db_path)
    rows = conn.execute(
        "SELECT id, type, message, created_by, created_at, expires_at "
        "FROM announcements "
        "WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now')) "
        "ORDER BY CASE type WHEN 'alert' THEN 0 ELSE 1 END, created_at DESC"
    ).fetchall()
    conn.close()
    return [{"id": r[0], "type": r[1], "message": r[2], "created_by": r[3], "created_at": r[4], "expires_at": r[5]} for r in rows]

def get_all_announcements(self) -> list[dict]:
    conn = sqlite3.connect(self._db_path)
    rows = conn.execute(
        "SELECT id, type, message, created_by, created_at, expires_at, revoked_at, revoked_by, revoke_reason "
        "FROM announcements ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [
        {"id": r[0], "type": r[1], "message": r[2], "created_by": r[3], "created_at": r[4],
         "expires_at": r[5], "revoked_at": r[6], "revoked_by": r[7], "revoke_reason": r[8]}
        for r in rows
    ]

def revoke_announcement(self, ann_id: int, revoked_by: int, reason: str | None = None) -> bool:
    conn = sqlite3.connect(self._db_path)
    cur = conn.execute(
        "UPDATE announcements SET revoked_at = datetime('now'), revoked_by = ?, revoke_reason = ? "
        "WHERE id = ? AND revoked_at IS NULL",
        (revoked_by, reason, ann_id),
    )
    conn.commit()
    changed = cur.rowcount > 0
    conn.close()
    return changed
```

- [ ] **Step 3: Add announcement API endpoints to main.py**

```python
from api.models import AnnouncementCreate

@app.get("/api/announcements")
async def get_announcements(_=Depends(verify_member)):
    return {"announcements": key_store.get_active_announcements()}

@app.get("/api/announcements/all")
async def get_all_announcements(_=Depends(verify_member)):
    return {"announcements": key_store.get_all_announcements()}
```

Add to `admin.py`:
```python
from pydantic import BaseModel as PydanticBaseModel

class AnnouncementCreateBody(PydanticBaseModel):
    type: str
    message: str
    expires_at: str | None = None

class RevokeBody(PydanticBaseModel):
    reason: str | None = None

@router.post("/announcements")
async def create_announcement(body: AnnouncementCreateBody, admin: dict = Depends(require_admin)):
    if body.type not in ("alert", "warning", "info", "success"):
        raise HTTPException(status_code=400, detail="Invalid announcement type")
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    ann_id = _key_store.create_announcement(
        type=body.type, message=body.message.strip(),
        created_by=admin["sub"], expires_at=body.expires_at,
    )
    return {"status": "ok", "id": ann_id}

@router.patch("/announcements/{ann_id}/revoke")
async def revoke_announcement(ann_id: int, body: RevokeBody, admin: dict = Depends(require_admin)):
    changed = _key_store.revoke_announcement(ann_id, revoked_by=admin["sub"], reason=body.reason)
    if not changed:
        raise HTTPException(status_code=404, detail="Announcement not found or already revoked")
    return {"status": "ok"}
```

- [ ] **Step 4: Write tests**

`tests/test_announcements.py`:
```python
import pytest
from api.db import KeyStore

@pytest.fixture
def key_store(tmp_path):
    from cryptography.fernet import Fernet
    key = Fernet.generate_key().decode()
    return KeyStore(db_path=str(tmp_path / "test.db"), encryption_key=key)

def test_create_and_get_active(key_store):
    ann_id = key_store.create_announcement("info", "Test message", created_by=1)
    active = key_store.get_active_announcements()
    assert len(active) == 1
    assert active[0]["id"] == ann_id
    assert active[0]["type"] == "info"
    assert active[0]["message"] == "Test message"

def test_revoke_removes_from_active(key_store):
    ann_id = key_store.create_announcement("warning", "Revokable", created_by=1)
    key_store.revoke_announcement(ann_id, revoked_by=1, reason="done")
    assert key_store.get_active_announcements() == []

def test_revoked_still_in_all(key_store):
    ann_id = key_store.create_announcement("info", "Old news", created_by=1)
    key_store.revoke_announcement(ann_id, revoked_by=1, reason="outdated")
    all_anns = key_store.get_all_announcements()
    assert len(all_anns) == 1
    assert all_anns[0]["revoked_at"] is not None
    assert all_anns[0]["revoke_reason"] == "outdated"

def test_alerts_sorted_first(key_store):
    key_store.create_announcement("info", "Info msg", created_by=1)
    key_store.create_announcement("alert", "URGENT", created_by=1)
    active = key_store.get_active_announcements()
    assert active[0]["type"] == "alert"

def test_revoke_nonexistent_returns_false(key_store):
    assert key_store.revoke_announcement(999, revoked_by=1) is False

def test_expired_not_in_active(key_store):
    key_store.create_announcement("info", "Expired", created_by=1, expires_at="2020-01-01 00:00:00")
    assert key_store.get_active_announcements() == []
```

- [ ] **Step 5: Run tests**

```bash
uv run pytest tests/ -v
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/ tests/
git commit -m "feat: add announcement system with create, revoke, expiry"
```

---

## Task 5: Frontend — Auth, API client, types

**Files:**
- Create: `frontend/src/lib/api-client.ts`
- Create: `frontend/src/hooks/useAuth.ts`
- Create: `frontend/src/hooks/useApi.ts`
- Create: `frontend/src/types/war.ts`
- Create: `frontend/src/types/admin.ts`
- Create: `frontend/src/components/layout/AuthGate.tsx`

- [ ] **Step 1: Create shared types**

`frontend/src/types/war.ts`:
```typescript
export interface LastAction {
  status: string;
  timestamp: number;
  relative: string;
}

export interface MemberStatus {
  description: string;
  details: string | null;
  state: string;
  color: string;
  until: number | null;
}

export interface FactionMember {
  id: number;
  name: string;
  level: number;
  days_in_faction: number;
  last_action: LastAction;
  status: MemberStatus;
  position: string;
  is_on_wall: boolean;
  is_revivable: boolean;
  is_in_oc: boolean;
  revive_setting: string;
}

export interface WarFaction {
  id: number;
  name: string;
  score: number;
  chain: number;
}

export interface WarStatus {
  war_id: number | null;
  start: number | null;
  end: number | null;
  target: number | null;
  winner: number | null;
  factions: WarFaction[];
}

export interface WarProgress {
  war_id: number;
  start: number;
  end: number | null;
  target: number;
  our_score: number;
  their_score: number;
  our_name: string;
  their_name: string;
  our_id: number;
  their_id: number;
  our_pct: number;
  their_pct: number;
}

export interface PersonalStats {
  xanax_taken: number;
  refills: number;
  stat_enhancers_used: number;
  attacks_won: number;
  attacks_lost: number;
  defends_won: number;
  defends_lost: number;
  networth: number;
  highest_beaten: number;
  best_damage: number;
  best_kill_streak: number;
  damage_done: number;
}

export interface EnemyMember extends FactionMember {
  personal_stats: PersonalStats | null;
  threat_score: number;
  threat_label: string;
  attack_url: string;
  profile_url: string;
  stats_url: string;
}

export interface FactionInfo {
  id: number;
  name: string;
  tag: string;
  respect: number;
  members_count: number;
  rank_name: string;
  rank_level: number;
  best_chain: number;
  wins: number;
}

export interface OverviewResponse {
  members: FactionMember[];
  war: WarStatus | null;
  war_progress: WarProgress | null;
  chain: { current: number; max: number; modifier: number } | null;
  cached_at: number;
}

export interface DetailResponse {
  yata_down: boolean;
  members: Record<string, {
    energy: number;
    max_energy: number | null;
    drug_cd: number;
    refill: boolean;
    source: string;
  }>;
  cached_at: number;
}

export interface EnemyResponse {
  faction: FactionInfo | null;
  members: EnemyMember[];
  threat_mode: string;
  threat_baseline: string | null;
  cached_at: number;
}
```

`frontend/src/types/admin.ts`:
```typescript
export type Role = "superadmin" | "admin" | "member";

export interface MeResponse {
  player_id: number;
  role: Role;
  is_admin: boolean;
  is_superadmin: boolean;
}

export interface Announcement {
  id: number;
  type: "alert" | "warning" | "info" | "success";
  message: string;
  created_by: number;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: number | null;
  revoke_reason: string | null;
}
```

- [ ] **Step 2: Create API client**

`frontend/src/lib/api-client.ts`:
```typescript
function getPlayerId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("myKeyPlayer");
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const pid = getPlayerId();
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string>) || {}),
  };
  if (pid) headers["X-Player-Id"] = pid;

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    localStorage.removeItem("myKeyPlayer");
    localStorage.removeItem("myKeyName");
    window.location.reload();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  overview: () => apiFetch<import("@/types/war").OverviewResponse>("/api/overview"),
  detail: () => apiFetch<import("@/types/war").DetailResponse>("/api/members/detail"),
  enemy: (factionId?: number) => {
    const pid = getPlayerId();
    let url = factionId ? `/api/enemy?faction_id=${factionId}` : "/api/enemy";
    if (pid) url += `${url.includes("?") ? "&" : "?"}baseline_pid=${pid}`;
    return apiFetch<import("@/types/war").EnemyResponse>(url);
  },
  me: () => apiFetch<import("@/types/admin").MeResponse>("/api/me"),
  announcements: () => apiFetch<{ announcements: import("@/types/admin").Announcement[] }>("/api/announcements"),
  announcementsAll: () => apiFetch<{ announcements: import("@/types/admin").Announcement[] }>("/api/announcements/all"),
  registerKey: (apiKey: string) =>
    fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    }).then(async (r) => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.detail || "Failed");
      return body as { player_id: number; name: string };
    }),
};
```

- [ ] **Step 3: Create useAuth hook**

`frontend/src/hooks/useAuth.ts`:
```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import type { Role } from "@/types/admin";

interface AuthState {
  playerId: number | null;
  playerName: string | null;
  role: Role | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    playerId: null,
    playerName: null,
    role: null,
    loading: true,
  });

  useEffect(() => {
    const pid = localStorage.getItem("myKeyPlayer");
    const name = localStorage.getItem("myKeyName");
    if (!pid) {
      setState({ playerId: null, playerName: null, role: null, loading: false });
      return;
    }
    api.me().then((me) => {
      setState({
        playerId: me.player_id,
        playerName: name,
        role: me.role,
        loading: false,
      });
    }).catch(() => {
      setState({ playerId: null, playerName: null, role: null, loading: false });
    });
  }, []);

  const login = useCallback(async (apiKey: string) => {
    const result = await api.registerKey(apiKey);
    localStorage.setItem("myKeyPlayer", String(result.player_id));
    localStorage.setItem("myKeyName", result.name);
    const me = await api.me();
    setState({
      playerId: result.player_id,
      playerName: result.name,
      role: me.role,
      loading: false,
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("myKeyPlayer");
    localStorage.removeItem("myKeyName");
    localStorage.removeItem("adminToken");
    setState({ playerId: null, playerName: null, role: null, loading: false });
  }, []);

  return { ...state, login, logout, isLoggedIn: state.playerId !== null };
}
```

- [ ] **Step 4: Create AuthGate component**

`frontend/src/components/layout/AuthGate.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, loading, login } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <div className="text-text-secondary">Loading...</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <div className="w-full max-w-sm p-6 bg-bg-surface border border-border rounded-lg">
          <h1 className="text-xl font-bold text-torn-green mb-1">TM Hub</h1>
          <p className="text-text-secondary text-sm mb-4">Enter your Torn API key to continue</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setSubmitting(true);
              try {
                await login(apiKey);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to register key");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="API Key"
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm mb-3 focus:border-torn-green focus:outline-none"
              autoFocus
            />
            <button
              type="submit"
              disabled={submitting || !apiKey}
              className="w-full py-2 bg-torn-green-dim text-white rounded text-sm font-medium hover:bg-torn-green disabled:opacity-50 transition-colors"
            >
              {submitting ? "Validating..." : "Login"}
            </button>
            {error && <p className="mt-2 text-torn-red text-xs">{error}</p>}
          </form>
          <p className="mt-3 text-text-muted text-xs text-center">
            You must be a member of The Masters to use this tool
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 5: Verify build**

```bash
cd frontend && npm run build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/
git commit -m "feat: add auth system, API client, and types for frontend"
```

---

## Task 6: Frontend — Sidebar shell and theme

**Files:**
- Create: `frontend/src/components/layout/Sidebar.tsx`
- Create: `frontend/src/components/layout/MobileDrawer.tsx`
- Create: `frontend/src/components/layout/AppShell.tsx`
- Create: `frontend/src/hooks/useTheme.ts`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/app/page.tsx`
- Create: `frontend/src/app/war/page.tsx`
- Create: `frontend/src/app/training/page.tsx`
- Create: `frontend/src/app/inbox/page.tsx`
- Create: `frontend/src/app/admin/page.tsx`

**Note:** Use the `frontend-design` skill when implementing these components for delightful, mobile-first UI. The code below is the functional skeleton — the design agent should enhance styling, animations, and polish.

- [ ] **Step 1: Create theme hook**

`frontend/src/hooks/useTheme.ts`:
```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

type Theme = "dark" | "light";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    const initial = saved || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    setThemeState(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
    document.documentElement.classList.toggle("light", initial === "light");
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem("theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
    document.documentElement.classList.toggle("light", t === "light");
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggle };
}
```

- [ ] **Step 2: Create Sidebar component**

`frontend/src/components/layout/Sidebar.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  disabled?: boolean;
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "War",
    items: [{ label: "War Room", href: "/war", icon: "⚔" }],
  },
  {
    title: "Training",
    items: [{ label: "Training Guide", href: "/training", icon: "💪" }],
  },
  {
    title: "Tools",
    items: [
      { label: "Spy Central", href: "/spy", icon: "🔍", disabled: true },
      { label: "Chain Tracker", href: "/chain", icon: "🔗", disabled: true },
    ],
  },
];

export function Sidebar({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();
  const { playerName, playerId, role, logout } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <aside className="w-[200px] h-screen bg-bg-surface border-r border-border flex flex-col fixed left-0 top-0 z-30">
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <div className="text-torn-green font-bold text-lg">TM Hub</div>
        <div className="text-text-muted text-xs">The Masters [TM]</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-2">
            <div className="px-4 py-1 text-text-muted text-[10px] uppercase tracking-wider">
              {section.title}
            </div>
            {section.items.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.disabled ? "#" : item.href}
                  className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                    item.disabled
                      ? "text-text-muted opacity-40 cursor-not-allowed"
                      : active
                      ? "text-text-primary bg-torn-green/10 border-l-2 border-torn-green"
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
                  }`}
                  onClick={item.disabled ? (e) => e.preventDefault() : undefined}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                  {item.disabled && <span className="text-[9px] ml-auto">soon</span>}
                </Link>
              );
            })}
          </div>
        ))}

        {/* Inbox */}
        <div className="mt-2 border-t border-border pt-2">
          <Link
            href="/inbox"
            className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
              pathname === "/inbox"
                ? "text-text-primary bg-torn-green/10 border-l-2 border-torn-green"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
            }`}
          >
            <span>📨</span>
            <span>Inbox</span>
            {unreadCount > 0 && (
              <span className="ml-auto bg-torn-green text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </Link>
        </div>

        {/* Admin (conditional) */}
        {role && role !== "member" && (
          <div>
            <Link
              href="/admin"
              className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                pathname.startsWith("/admin")
                  ? "text-text-primary bg-torn-green/10 border-l-2 border-torn-green"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
              }`}
            >
              <span>⚙</span>
              <span>Admin</span>
            </Link>
          </div>
        )}
      </nav>

      {/* User panel */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-torn-green-dim flex items-center justify-center text-white text-xs font-bold">
            {playerName?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-text-primary text-xs truncate">{playerName}</div>
            <div className="text-text-muted text-[10px]">[{playerId}]</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggle}
            className="flex-1 text-[10px] text-text-secondary border border-border rounded px-2 py-1 hover:bg-bg-elevated transition-colors"
          >
            {theme === "dark" ? "☀ Light" : "🌙 Dark"}
          </button>
          <button
            onClick={logout}
            className="flex-1 text-[10px] text-torn-red border border-torn-red/30 rounded px-2 py-1 hover:bg-torn-red/10 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Create MobileDrawer component**

`frontend/src/components/layout/MobileDrawer.tsx`:
```tsx
"use client";

import { useEffect } from "react";
import { Sidebar } from "./Sidebar";

interface Props {
  open: boolean;
  onClose: () => void;
  unreadCount: number;
}

export function MobileDrawer({ open, onClose, unreadCount }: Props) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-[260px] h-full">
        <Sidebar unreadCount={unreadCount} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create AppShell component**

`frontend/src/components/layout/AppShell.tsx`:
```tsx
"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { MobileDrawer } from "./MobileDrawer";
import { AuthGate } from "./AuthGate";
import { api } from "@/lib/api-client";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    api.announcements().then((res) => {
      const dismissed = JSON.parse(localStorage.getItem("dismissedAnnouncements") || "[]");
      const unread = res.announcements.filter((a) => !dismissed.includes(a.id));
      setUnreadCount(unread.length);
    }).catch(() => {});
  }, []);

  return (
    <AuthGate>
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar unreadCount={unreadCount} />
      </div>

      {/* Mobile header */}
      <div className="lg:hidden flex items-center px-3 py-2 bg-bg-surface border-b border-border sticky top-0 z-40">
        <button onClick={() => setDrawerOpen(true)} className="text-text-primary text-lg mr-3">
          ☰
        </button>
        <span className="text-torn-green font-bold">TM Hub</span>
      </div>

      {/* Mobile drawer */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} unreadCount={unreadCount} />

      {/* Content area */}
      <main className="lg:ml-[200px] min-h-screen">
        {children}
      </main>
    </AuthGate>
  );
}
```

- [ ] **Step 5: Update root layout**

`frontend/src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "TM Hub",
  description: "Torn.com faction toolkit for The Masters",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark">
      <body className="min-h-full bg-bg-primary text-text-primary">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Create route pages (placeholders)**

`frontend/src/app/page.tsx`:
```tsx
import { redirect } from "next/navigation";
export default function Home() {
  redirect("/war");
}
```

`frontend/src/app/war/page.tsx`:
```tsx
export default function WarPage() {
  return <div className="p-4"><h1 className="text-lg font-bold">War Room</h1><p className="text-text-secondary mt-2">Coming in Task 7...</p></div>;
}
```

`frontend/src/app/training/page.tsx`:
```tsx
export default function TrainingPage() {
  return <div className="p-4"><h1 className="text-lg font-bold">Training Guide</h1><p className="text-text-secondary mt-2">Coming in Task 8...</p></div>;
}
```

`frontend/src/app/inbox/page.tsx`:
```tsx
export default function InboxPage() {
  return <div className="p-4"><h1 className="text-lg font-bold">Inbox</h1><p className="text-text-secondary mt-2">Coming in Task 9...</p></div>;
}
```

`frontend/src/app/admin/page.tsx`:
```tsx
export default function AdminPage() {
  return <div className="p-4"><h1 className="text-lg font-bold">Admin</h1><p className="text-text-secondary mt-2">Coming in Task 10...</p></div>;
}
```

- [ ] **Step 7: Verify build**

```bash
cd frontend && npm run build
```

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "feat: add sidebar shell, mobile drawer, theme toggle, route pages"
```

---

## Task 7: Frontend — War Room (Our Team + Enemy + War Banner)

**Files:**
- Create: `frontend/src/components/war/WarBanner.tsx`
- Create: `frontend/src/components/war/ChainStatus.tsx`
- Create: `frontend/src/components/war/MemberTable.tsx`
- Create: `frontend/src/components/war/MemberCard.tsx`
- Create: `frontend/src/components/war/EnemyTable.tsx`
- Create: `frontend/src/components/war/EnemyCard.tsx`
- Create: `frontend/src/components/war/EnemyFilter.tsx`
- Create: `frontend/src/hooks/useWarData.ts`
- Modify: `frontend/src/app/war/page.tsx`

This is the largest task. It rewrites the entire War Room UI in React. The existing `static/app.js` (~1000 lines) is the reference implementation. Use the `frontend-design` skill for all component UI.

**Note:** This task is too large for a single agent. Break it into sub-steps but keep it as one logical unit. The agent implementing this should:
1. Read `static/app.js` thoroughly for all behaviors
2. Implement components one by one
3. Test each in the browser via `npm run dev` with API proxy

- [ ] **Step 1: Create useWarData hook**

`frontend/src/hooks/useWarData.ts`:
```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import type { OverviewResponse, DetailResponse, EnemyResponse } from "@/types/war";

const REFRESH_INTERVAL = 60_000;

export function useWarData() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [enemy, setEnemy] = useState<EnemyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [ov, det, en] = await Promise.all([
        api.overview(),
        api.detail(),
        api.enemy(),
      ]);
      setOverview(ov);
      setDetail(det);
      setEnemy(en);
      setLastUpdate(new Date());
    } catch (e) {
      console.error("Refresh failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEnemy = useCallback(async (factionId: number) => {
    const en = await api.enemy(factionId);
    setEnemy(en);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  return { overview, detail, enemy, loading, lastUpdate, refresh, loadEnemy };
}
```

- [ ] **Step 2: Create WarBanner component**

`frontend/src/components/war/WarBanner.tsx` — displays war status banner above content. Reference: `static/app.js:508-544` (renderWar function). Shows:
- Active: green banner with scores
- Upcoming: yellow banner with countdown
- No war: hidden

The agent must read `static/app.js` lines 508-544 and replicate the logic in React with Tailwind styling.

- [ ] **Step 3: Create ChainStatus component**

`frontend/src/components/war/ChainStatus.tsx` — shows chain info during active war. Reference: `static/app.js:777-784`.

- [ ] **Step 4: Create MemberTable (desktop) and MemberCard (mobile)**

Reference: `static/app.js:546-690` (renderOurTeam, getReadiness, getOurSortValue). Key behaviors to replicate:
- Color-coded readiness (green/yellow/red based on status + energy + drug CD)
- Sortable columns: name, level, status, energy, drug CD, position
- Desktop: table rows. Mobile: collapsible cards
- Energy from detail data (merge by member ID)
- YATA warning when yata_down is true

- [ ] **Step 5: Create EnemyTable (desktop) and EnemyCard (mobile)**

Reference: `static/app.js:723-806` (renderEnemy) and `static/app.js:405-496` (renderMobileEnemyCards). Key behaviors:
- Threat badges (easy/medium/hard/avoid) with color coding
- Sort by: threat, name, level, state, xanax, attacks won
- Sort direction toggle (asc/desc)
- Filter by state: all, attackable, online, idle, offline, hospital
- Attack button, stats link, profile link
- Hospital countdown timer
- Personal stats tooltip on hover (desktop)

- [ ] **Step 6: Create EnemyFilter component**

`frontend/src/components/war/EnemyFilter.tsx`:
```tsx
"use client";

interface Props {
  filter: string;
  onFilterChange: (filter: string) => void;
  sort: { col: string; asc: boolean };
  onSortChange: (col: string) => void;
  onSortDirToggle: () => void;
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "okay", label: "Attackable" },
  { value: "online", label: "Online" },
  { value: "idle", label: "Idle" },
  { value: "offline", label: "Offline" },
  { value: "hospital", label: "Hospital" },
];

export function EnemyFilter({ filter, onFilterChange, sort, onSortChange, onSortDirToggle }: Props) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <select
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary"
      >
        {FILTERS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
      {/* Mobile only: sort controls */}
      <div className="flex gap-1 lg:hidden ml-auto">
        <select
          value={sort.col}
          onChange={(e) => onSortChange(e.target.value)}
          className="bg-bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary"
        >
          <option value="threat_score">Threat</option>
          <option value="name">Name</option>
          <option value="level">Level</option>
          <option value="state">State</option>
        </select>
        <button
          onClick={onSortDirToggle}
          className="bg-bg-surface border border-border rounded px-2 py-1 text-xs"
        >
          {sort.asc ? "▲" : "▼"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Wire up war/page.tsx**

`frontend/src/app/war/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useWarData } from "@/hooks/useWarData";
import { WarBanner } from "@/components/war/WarBanner";
import { ChainStatus } from "@/components/war/ChainStatus";
import { MemberTable } from "@/components/war/MemberTable";
import { EnemyTable } from "@/components/war/EnemyTable";

type Tab = "team" | "enemy";

export default function WarPage() {
  const { overview, detail, enemy, loading, lastUpdate, refresh, loadEnemy } = useWarData();
  const [tab, setTab] = useState<Tab>("team");

  if (loading) {
    return <div className="p-4 text-text-secondary">Loading war data...</div>;
  }

  return (
    <div>
      <WarBanner war={overview?.war ?? null} warProgress={overview?.war_progress ?? null} />
      <ChainStatus chain={overview?.chain ?? null} warActive={!!overview?.war?.war_id} />

      {/* Tabs */}
      <div className="flex gap-4 px-4 pt-3 border-b border-border">
        <button
          onClick={() => setTab("team")}
          className={`pb-2 text-sm font-medium transition-colors ${
            tab === "team"
              ? "text-torn-green border-b-2 border-torn-green"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Our Team
        </button>
        <button
          onClick={() => setTab("enemy")}
          className={`pb-2 text-sm font-medium transition-colors ${
            tab === "enemy"
              ? "text-torn-green border-b-2 border-torn-green"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Enemy
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {tab === "team" && (
          <MemberTable
            members={overview?.members ?? []}
            detail={detail}
          />
        )}
        {tab === "enemy" && (
          <EnemyTable
            data={enemy}
            onLoadEnemy={loadEnemy}
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 text-text-muted text-[10px] flex items-center gap-2">
        <span>Last update: {lastUpdate?.toLocaleTimeString() ?? "—"}</span>
        <button onClick={refresh} className="text-torn-green hover:underline">Refresh</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Verify build**

```bash
cd frontend && npm run build
```

Expected: Build succeeds.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/
git commit -m "feat: rewrite War Room in React (Our Team, Enemy, Banner, Chain)"
```

---

## Task 8: Frontend — Training Guide integration

**Files:**
- Copy and adapt from `/Users/pawelorzech/Programowanie/tm-training-guide/src/`:
  - `components/calculator/*` → `frontend/src/components/training/calculator/`
  - `components/guide/*` → `frontend/src/components/training/guide/`
  - `components/charts/*` → `frontend/src/components/training/charts/`
  - `components/layout/RecommendationsPanel.tsx` → `frontend/src/components/training/RecommendationsPanel.tsx`
  - `components/layout/TableOfContents.tsx` → `frontend/src/components/training/TableOfContents.tsx`
  - `hooks/useCalculator.ts` → `frontend/src/hooks/useCalculator.ts`
  - `hooks/useTornApi.ts` → adapt into existing `useApi.ts` or keep separate
  - `hooks/useLocalStorage.ts` → `frontend/src/hooks/useLocalStorage.ts`
  - `lib/constants.ts` → `frontend/src/lib/constants.ts`
  - `lib/formulas.ts` → `frontend/src/lib/formulas.ts`
  - `lib/format.ts` → merge with existing or copy
  - `lib/recommendations.ts` → `frontend/src/lib/recommendations.ts`
  - `lib/torn-api.ts` → adapt (API key now comes from auth, not manual input)
  - `types/calculator.ts` → `frontend/src/types/training.ts`
  - `types/torn-api.ts` → merge into existing types
- Modify: `frontend/src/app/training/page.tsx`

- [ ] **Step 1: Copy lib files from training guide**

```bash
cp /Users/pawelorzech/Programowanie/tm-training-guide/src/lib/constants.ts frontend/src/lib/constants.ts
cp /Users/pawelorzech/Programowanie/tm-training-guide/src/lib/formulas.ts frontend/src/lib/formulas.ts
cp /Users/pawelorzech/Programowanie/tm-training-guide/src/lib/recommendations.ts frontend/src/lib/recommendations.ts
cp /Users/pawelorzech/Programowanie/tm-training-guide/src/types/calculator.ts frontend/src/types/training.ts
```

Merge `format.ts` from training guide into `frontend/src/lib/format.ts` (keep both war room and training guide formatters).

- [ ] **Step 2: Copy and adapt hooks**

```bash
cp /Users/pawelorzech/Programowanie/tm-training-guide/src/hooks/useCalculator.ts frontend/src/hooks/useCalculator.ts
cp /Users/pawelorzech/Programowanie/tm-training-guide/src/hooks/useLocalStorage.ts frontend/src/hooks/useLocalStorage.ts
```

Adapt `useTornApi.ts` — in the training guide it uses a manually-entered API key. In TM Hub the user is already authenticated, so the API key comes from the backend. Create a new hook that fetches user stats via the existing auth mechanism instead.

- [ ] **Step 3: Copy components**

```bash
mkdir -p frontend/src/components/training/{calculator,guide,charts}
cp /Users/pawelorzech/Programowanie/tm-training-guide/src/components/calculator/*.tsx frontend/src/components/training/calculator/
cp /Users/pawelorzech/Programowanie/tm-training-guide/src/components/guide/*.tsx frontend/src/components/training/guide/
cp /Users/pawelorzech/Programowanie/tm-training-guide/src/components/charts/*.tsx frontend/src/components/training/charts/
cp /Users/pawelorzech/Programowanie/tm-training-guide/src/components/layout/RecommendationsPanel.tsx frontend/src/components/training/
cp /Users/pawelorzech/Programowanie/tm-training-guide/src/components/layout/TableOfContents.tsx frontend/src/components/training/
```

Update all import paths from `@/components/` → `@/components/training/`, `@/hooks/` stays the same, `@/lib/` stays the same, `@/types/calculator` → `@/types/training`.

- [ ] **Step 4: Remove the standalone Header/Footer from training guide**

The training guide had its own Header and Footer. Those are now replaced by TM Hub's AppShell (Sidebar + AuthGate). Delete the copied Header.tsx and Footer.tsx if they were copied. The ApiKeyInput component needs reworking — the user is already authenticated, so we can auto-load stats via the backend or skip manual API key input.

- [ ] **Step 5: Wire up training/page.tsx**

Reference: `/Users/pawelorzech/Programowanie/tm-training-guide/src/app/page.tsx`. Copy the tab structure and component rendering, adapting to TM Hub's layout. The page should have the same tabs: Calculator, Getting Started, Gym Formula, etc.

- [ ] **Step 6: Verify build**

```bash
cd frontend && npm run build
```

Fix any import errors, TypeScript errors, or missing dependencies.

- [ ] **Step 7: Copy tests from training guide**

```bash
mkdir -p frontend/__tests__
cp /Users/pawelorzech/Programowanie/tm-training-guide/__tests__/*.test.ts frontend/__tests__/
```

Update imports and run:
```bash
cd frontend && npm run test
```

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "feat: integrate Training Guide components into TM Hub"
```

---

## Task 9: Frontend — Announcement carousel and inbox

**Files:**
- Create: `frontend/src/components/layout/AnnouncementCarousel.tsx`
- Create: `frontend/src/hooks/useAnnouncements.ts`
- Create: `frontend/src/components/inbox/AnnouncementList.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Modify: `frontend/src/app/inbox/page.tsx`

- [ ] **Step 1: Create useAnnouncements hook**

`frontend/src/hooks/useAnnouncements.ts`:
```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import type { Announcement } from "@/types/admin";

export function useAnnouncements() {
  const [active, setActive] = useState<Announcement[]>([]);
  const [all, setAll] = useState<Announcement[]>([]);

  const getDismissed = (): number[] =>
    JSON.parse(localStorage.getItem("dismissedAnnouncements") || "[]");

  const dismiss = useCallback((id: number) => {
    const dismissed = getDismissed();
    if (!dismissed.includes(id)) {
      localStorage.setItem("dismissedAnnouncements", JSON.stringify([...dismissed, id]));
    }
    setActive((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [activeRes, allRes] = await Promise.all([
        api.announcements(),
        api.announcementsAll(),
      ]);
      const dismissed = getDismissed();
      setActive(activeRes.announcements.filter((a) => a.type === "alert" || !dismissed.includes(a.id)));
      setAll(allRes.announcements);
    } catch {}
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const unreadCount = active.length;

  return { active, all, unreadCount, dismiss, refresh };
}
```

- [ ] **Step 2: Create AnnouncementCarousel**

`frontend/src/components/layout/AnnouncementCarousel.tsx`:

The carousel:
- Shows active announcements below war banner
- Alert type: pinned, red pulsing border, cannot be dismissed
- Others: auto-rotate every 5 seconds, dots for navigation, dismiss button (×)
- Single announcement: static, no rotation
- Empty: hidden entirely

Use `frontend-design` skill for styling — this is a high-visibility component.

- [ ] **Step 3: Create inbox page**

`frontend/src/components/inbox/AnnouncementList.tsx` and `frontend/src/app/inbox/page.tsx`:

Inbox shows all announcements:
- Active: full color, type badge
- Expired: dimmed, "Expired" label
- Revoked: strikethrough text, "Revoked" label + reason if available

State logic:
```typescript
function getAnnouncementState(a: Announcement): "active" | "expired" | "revoked" {
  if (a.revoked_at) return "revoked";
  if (a.expires_at && new Date(a.expires_at) <= new Date()) return "expired";
  return "active";
}
```

- [ ] **Step 4: Integrate carousel into AppShell**

Update `AppShell.tsx` to use `useAnnouncements` and render `<AnnouncementCarousel>` inside the main content area, passing the active announcements.

- [ ] **Step 5: Verify build**

```bash
cd frontend && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/
git commit -m "feat: add announcement carousel and inbox"
```

---

## Task 10: Frontend — Admin panel

**Files:**
- Create: `frontend/src/hooks/useAdminSession.ts`
- Create: `frontend/src/components/admin/AnnouncementEditor.tsx`
- Create: `frontend/src/components/admin/ManageAdmins.tsx`
- Create: `frontend/src/components/admin/AnalyticsDashboard.tsx`
- Modify: `frontend/src/app/admin/page.tsx`

- [ ] **Step 1: Create useAdminSession hook**

Admin session uses JWT (same as current system). The hook:
1. Checks if admin token exists in localStorage
2. If not, requests one via `POST /api/admin/session`
3. Adds `Authorization: Bearer <token>` to admin API calls

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";

export function useAdminSession() {
  const { playerId } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("adminToken");
    if (stored) {
      setToken(stored);
      setLoading(false);
      return;
    }
    if (!playerId) { setLoading(false); return; }

    fetch("/api/admin/session", {
      method: "POST",
      headers: { "X-Player-Id": String(playerId) },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.token) {
          localStorage.setItem("adminToken", data.token);
          setToken(data.token);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [playerId]);

  const adminFetch = useCallback(
    async <T>(path: string, init?: RequestInit): Promise<T> => {
      const res = await fetch(path, {
        ...init,
        headers: {
          ...((init?.headers as Record<string, string>) || {}),
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    [token]
  );

  return { token, loading, adminFetch };
}
```

- [ ] **Step 2: Create AnnouncementEditor**

Admin UI for creating and revoking announcements. Reference: spec section "Admin Panel — Announcements Section".

Form: textarea + type selector (alert/warning/info/success) + optional expiry datetime picker. Active list with "Revoke" button (opens dialog for optional reason). History view.

- [ ] **Step 3: Create ManageAdmins (superadmin only)**

Shows list of current admins with "Demote" button. "Promote" form: enter player ID. Uses `/api/admin/admins` GET, POST, DELETE endpoints.

The component checks `role === "superadmin"` and renders nothing otherwise.

- [ ] **Step 4: Create AnalyticsDashboard**

Migrate existing admin analytics from `static/app.js:953-1090`. Reference endpoints:
- `GET /api/admin/stats/requests?days=N`
- `GET /api/admin/stats/users?days=N`
- `GET /api/admin/stats/errors?days=N`
- `GET /api/admin/system`
- `GET /api/admin/keys`

- [ ] **Step 5: Wire up admin/page.tsx**

```tsx
"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAdminSession } from "@/hooks/useAdminSession";
import { AnalyticsDashboard } from "@/components/admin/AnalyticsDashboard";
import { AnnouncementEditor } from "@/components/admin/AnnouncementEditor";
import { ManageAdmins } from "@/components/admin/ManageAdmins";

type Tab = "analytics" | "announcements" | "admins";

export default function AdminPage() {
  const { role } = useAuth();
  const { token, loading } = useAdminSession();
  const [tab, setTab] = useState<Tab>("analytics");

  if (loading) return <div className="p-4 text-text-secondary">Authenticating...</div>;
  if (!token) return <div className="p-4 text-torn-red">Admin access required</div>;

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "analytics", label: "Analytics", show: true },
    { id: "announcements", label: "Announcements", show: true },
    { id: "admins", label: "Manage Admins", show: role === "superadmin" },
  ];

  return (
    <div>
      <div className="flex gap-4 px-4 pt-3 border-b border-border">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "text-torn-green border-b-2 border-torn-green"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "analytics" && <AnalyticsDashboard />}
        {tab === "announcements" && <AnnouncementEditor />}
        {tab === "admins" && role === "superadmin" && <ManageAdmins />}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
cd frontend && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: add admin panel with analytics, announcements, and role management"
```

---

## Task 11: Multi-stage Dockerfile and FastAPI static serving

**Files:**
- Modify: `Dockerfile`
- Modify: `api/main.py` (static file serving)
- Modify: `docker-compose.yml`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Update Dockerfile**

```dockerfile
# Stage 1: Build frontend
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Backend + serve frontend
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .
COPY api/ api/
COPY --from=frontend /frontend/out/ static/
RUN mkdir -p data
EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Update FastAPI static serving in api/main.py**

Replace the old static file serving at the bottom of `api/main.py`:

```python
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

static_dir = os.path.join(os.path.dirname(__file__), "..", "static")

@app.get("/{path:path}")
async def serve_frontend(path: str):
    """Serve Next.js static export with SPA fallback."""
    file_path = os.path.join(static_dir, path)
    # Try exact file
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    # Try with .html extension (Next.js static export pattern)
    html_path = file_path + ".html"
    if os.path.isfile(html_path):
        return FileResponse(html_path)
    # Try index.html in directory
    index_path = os.path.join(file_path, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    # SPA fallback
    fallback = os.path.join(static_dir, "index.html")
    if os.path.isfile(fallback):
        return FileResponse(fallback)
    raise HTTPException(status_code=404, detail="Not found")
```

Remove the old `app.mount("/static", ...)` and `@app.get("/")` routes. The catch-all route must be registered last (after all `/api/*` routes).

Also mount `_next/static` for efficient static asset serving:
```python
_next_static = os.path.join(static_dir, "_next", "static")
if os.path.isdir(_next_static):
    app.mount("/_next/static", StaticFiles(directory=_next_static), name="next-static")
```

- [ ] **Step 3: Update docker-compose.yml**

Update service name and any references:
```yaml
services:
  hub:
    build: .
    ports:
      - "8000:8000"
    environment:
      - TORN_API_KEY=${TORN_API_KEY}
      - TORNSTATS_API_KEY=${TORNSTATS_API_KEY:-}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - FACTION_ID=${FACTION_ID:-11559}
      - CACHE_TTL=${CACHE_TTL:-60}
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - hub-data:/app/data
    restart: unless-stopped
    networks:
      - coolify

volumes:
  hub-data:

networks:
  coolify:
    external: true
```

- [ ] **Step 4: Update CI/CD workflow**

`.github/workflows/deploy.yml` — add Node.js setup for the test job (frontend tests):
```yaml
name: Deploy to Coolify

on:
  push:
    branches: [master]
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync --extra dev
      - run: uv run pytest -v
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd frontend && npm ci && npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Coolify deploy
        run: |
          RESPONSE=$(curl -s -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}" \
            "${{ secrets.COOLIFY_URL }}/api/v1/deploy?uuid=${{ secrets.COOLIFY_APP_UUID }}&force=true")
          echo "$RESPONSE" | jq .
          DEPLOY_UUID=$(echo "$RESPONSE" | jq -r '.deployments[0].deployment_uuid')
          echo "Deployment queued: $DEPLOY_UUID"
          for i in $(seq 1 24); do
            sleep 5
            STATUS=$(curl -s -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}" \
              "${{ secrets.COOLIFY_URL }}/api/v1/deployments/$DEPLOY_UUID" | jq -r '.status')
            echo "Status: $STATUS"
            if [ "$STATUS" = "finished" ]; then echo "Deploy successful!"; exit 0; fi
            if [ "$STATUS" = "failed" ]; then echo "Deploy failed!"; exit 1; fi
          done
          echo "Deploy timed out"; exit 1
```

- [ ] **Step 5: Test Docker build locally**

```bash
docker build -t tm-hub .
docker run --rm -p 8000:8000 \
  -e TORN_API_KEY=test \
  -e ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())") \
  -e JWT_SECRET=testsecret \
  tm-hub
```

Verify: Open `http://localhost:8000` → should show login screen. API calls to `/api/me` should return 401.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .github/ api/main.py
git commit -m "feat: multi-stage Docker build, FastAPI serves Next.js export"
```

---

## Task 12: Remove old static frontend and update footer

**Files:**
- Delete: `static/index.html`, `static/app.js`, `static/style.css`, `static/favicon.svg`
- Modify: `frontend/src/components/layout/AppShell.tsx` (add footer with version)

- [ ] **Step 1: Remove old static files**

```bash
git rm static/index.html static/app.js static/style.css static/favicon.svg
```

The `static/` directory will be populated by the Docker build (Next.js export output).

- [ ] **Step 2: Add footer to AppShell**

Add to the bottom of AppShell, inside the `<main>` wrapper:
```tsx
<footer className="px-4 py-3 text-text-muted text-[10px] text-center border-t border-border mt-auto">
  TM Hub v1.0.0 — by{" "}
  <a href="https://www.torn.com/profiles.php?XID=2362436" target="_blank" className="text-torn-green hover:underline">
    Bombel [2362436]
  </a>
</footer>
```

- [ ] **Step 3: Add .gitkeep for static dir**

```bash
touch static/.gitkeep
git add static/.gitkeep
```

- [ ] **Step 4: Run backend tests**

```bash
uv run pytest tests/ -v
```

Expected: All pass (static file tests may need updating if any reference old files).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove old vanilla JS frontend, add footer with version"
```

---

## Task 13: Coolify deploy and domain setup

**Files:** None (infrastructure only)

- [ ] **Step 1: Create new Coolify app for hub.tri.ovh**

Either change the existing Coolify app domain from `rw.tri.ovh` to `hub.tri.ovh`, or create a new one. Update Coolify app UUID in GitHub secrets if changed.

- [ ] **Step 2: Set up DNS**

Add `hub.tri.ovh` A record pointing to `109.199.102.222` in BunnyCDN DNS.

- [ ] **Step 3: Configure redirects**

Set up 301 redirects in Coolify/Traefik:
- `rw.tri.ovh/*` → `hub.tri.ovh/war`
- `train.tri.ovh/*` → `hub.tri.ovh/training`

This can be done via Traefik redirect middleware in Coolify, or by adding a small redirect handler in FastAPI.

- [ ] **Step 4: Push and deploy**

```bash
git push origin master
```

Monitor GitHub Actions for test + deploy success.

- [ ] **Step 5: Verify**

- Open `hub.tri.ovh` → login screen
- Login with API key → sidebar + War Room
- Navigate to Training → training guide works
- Navigate to Inbox → announcements list
- Check `rw.tri.ovh` redirects to `hub.tri.ovh/war`
- Check `train.tri.ovh` redirects to `hub.tri.ovh/training`
- Check mobile layout (hamburger + drawer)

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: post-deploy adjustments"
```

---

## Task 14: UI polish pass with frontend-design agent

**Files:** Various frontend components

This is the final pass. Use the `frontend-design` skill to review and enhance every component for delightful, production-grade UI. Focus areas:

- [ ] **Step 1: Login screen** — make it memorable, not generic
- [ ] **Step 2: Sidebar** — smooth transitions, hover states, active indicators
- [ ] **Step 3: Mobile drawer** — slide animation, swipe-to-close
- [ ] **Step 4: War Banner** — visual impact, pulse animation for active war
- [ ] **Step 5: Member/Enemy tables and cards** — readability, tap targets, spacing
- [ ] **Step 6: Announcement carousel** — smooth rotation transitions, type-specific styling
- [ ] **Step 7: Inbox** — clear visual hierarchy for active/expired/revoked states
- [ ] **Step 8: Admin panel** — clean forms, confirmation dialogs
- [ ] **Step 9: Overall consistency check** — spacing, colors, typography, dark/light modes

- [ ] **Step 10: Commit**

```bash
git add frontend/
git commit -m "style: UI polish pass — delightful design across all components"
```

- [ ] **Step 11: Push and deploy final version**

```bash
git push origin master
```
