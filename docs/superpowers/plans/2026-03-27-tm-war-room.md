# TM War Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time RW prep dashboard for The Masters faction that shows member readiness at a glance.

**Architecture:** FastAPI backend serves a single-page dashboard and proxies Torn API calls with caching. SQLite stores opted-in member API keys (Fernet-encrypted). Frontend is vanilla HTML/CSS/JS with 60s auto-refresh polling.

**Tech Stack:** Python 3.12, FastAPI, httpx, SQLite, cryptography (Fernet), Docker, Coolify

---

## File Structure

```
tm-war-room/
├── app/
│   ├── __init__.py          # empty
│   ├── main.py              # FastAPI app, routes, lifespan
│   ├── torn_client.py       # Torn API wrapper with caching
│   ├── db.py                # SQLite + Fernet key storage
│   ├── models.py            # Pydantic models
│   └── config.py            # Settings from env vars
├── static/
│   ├── index.html           # Dashboard page
│   ├── style.css            # Styles
│   └── app.js               # Frontend logic
├── tests/
│   ├── __init__.py
│   ├── test_torn_client.py  # API client tests
│   ├── test_db.py           # DB tests
│   └── test_routes.py       # Route tests
├── Dockerfile
├── docker-compose.yml
├── pyproject.toml
├── .env.example
└── docs/
    └── PRD.md
```

## Environment Variables

```env
TORN_API_KEY=QnwG8tWc1EumWqJ1          # Faction member key for overview
FACTION_ID=11559                         # The Masters
ENCRYPTION_KEY=                          # Auto-generated Fernet key if not set
CACHE_TTL=60                             # Seconds
POLL_INTERVAL=60                         # Seconds between member polls
```

---

### Task 1: Project Setup

**Files:**
- Create: `pyproject.toml`
- Create: `app/__init__.py`
- Create: `app/config.py`
- Create: `tests/__init__.py`
- Create: `.env.example`

- [ ] **Step 1: Create pyproject.toml**

```toml
[project]
name = "tm-war-room"
version = "0.1.0"
description = "RW prep dashboard for The Masters faction"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "httpx>=0.28.0",
    "cryptography>=44.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24.0",
    "httpx",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
```

- [ ] **Step 2: Create app/config.py**

```python
from __future__ import annotations

import os
from cryptography.fernet import Fernet


TORN_API_KEY: str = os.environ["TORN_API_KEY"]
FACTION_ID: int = int(os.environ.get("FACTION_ID", "11559"))
CACHE_TTL: int = int(os.environ.get("CACHE_TTL", "60"))

_enc_key = os.environ.get("ENCRYPTION_KEY")
if not _enc_key:
    _enc_key = Fernet.generate_key().decode()
    print(f"WARNING: No ENCRYPTION_KEY set. Generated ephemeral key. Keys will be lost on restart.")

ENCRYPTION_KEY: str = _enc_key
```

- [ ] **Step 3: Create .env.example**

```env
TORN_API_KEY=your_torn_api_key_here
FACTION_ID=11559
ENCRYPTION_KEY=
CACHE_TTL=60
```

- [ ] **Step 4: Create empty __init__.py files**

Create empty `app/__init__.py` and `tests/__init__.py`.

- [ ] **Step 5: Install dependencies and verify**

```bash
cd ~/Programowanie/tm-war-room
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
python -c "from app.config import FACTION_ID; print(f'Config OK, faction {FACTION_ID}')"
```

Expected: `Config OK, faction 11559` (will need TORN_API_KEY env var set)

- [ ] **Step 6: Commit**

```bash
git init
echo -e ".venv/\n__pycache__/\n*.pyc\n.env\ndata/" > .gitignore
git add .
git commit -m "feat: project setup with config and dependencies"
```

---

### Task 2: Pydantic Models

**Files:**
- Create: `app/models.py`
- Create: `tests/test_models.py`

- [ ] **Step 1: Write test for model parsing**

```python
# tests/test_models.py
from app.models import FactionMember, WarStatus, MemberBars


def test_parse_faction_member():
    raw = {
        "id": 467331,
        "name": "Maukun",
        "level": 92,
        "days_in_faction": 1298,
        "last_action": {"status": "Offline", "timestamp": 1774592942, "relative": "2 hours ago"},
        "status": {"description": "Okay", "details": None, "state": "Okay", "color": "green", "until": None},
        "position": "Team 3",
        "is_on_wall": False,
        "is_revivable": False,
        "is_in_oc": True,
    }
    m = FactionMember(**raw)
    assert m.name == "Maukun"
    assert m.last_action.status == "Offline"
    assert m.status.state == "Okay"


def test_parse_war_status_active():
    raw = {
        "war_id": 39363,
        "start": 1774630800,
        "end": None,
        "target": 11800,
        "winner": None,
        "factions": [
            {"id": 9420, "name": "The Pusheen Army", "score": 0, "chain": 0},
            {"id": 11559, "name": "The Masters", "score": 0, "chain": 0},
        ],
    }
    w = WarStatus(**raw)
    assert w.war_id == 39363
    assert len(w.factions) == 2
    assert w.factions[0].name == "The Pusheen Army"


def test_parse_war_status_none():
    w = WarStatus(war_id=None, start=None, end=None, target=None, winner=None, factions=[])
    assert w.war_id is None


def test_parse_member_bars():
    raw = {
        "energy": {"current": 900, "maximum": 150},
        "happy": {"current": 4525, "maximum": 4525},
        "cooldowns": {"drug": 17919, "medical": 0, "booster": 89600},
    }
    b = MemberBars(**raw)
    assert b.energy.current == 900
    assert b.energy.maximum == 150
    assert b.is_stacking is True  # current > maximum
    assert b.cooldowns.drug == 17919


def test_member_bars_not_stacking():
    raw = {
        "energy": {"current": 100, "maximum": 150},
        "happy": {"current": 4525, "maximum": 4525},
        "cooldowns": {"drug": 0, "medical": 0, "booster": 0},
    }
    b = MemberBars(**raw)
    assert b.is_stacking is False
    assert b.cooldowns.drug == 0
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Programowanie/tm-war-room
source .venv/bin/activate
pytest tests/test_models.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.models'` or `ImportError`

- [ ] **Step 3: Implement models**

```python
# app/models.py
from __future__ import annotations

from pydantic import BaseModel


class LastAction(BaseModel):
    status: str  # "Online" / "Offline" / "Idle"
    timestamp: int
    relative: str


class MemberStatus(BaseModel):
    description: str
    details: str | None = None
    state: str  # "Okay" / "Hospital" / "Jail" / "Traveling" / "Abroad"
    color: str
    until: int | None = None


class FactionMember(BaseModel):
    id: int
    name: str
    level: int
    days_in_faction: int
    last_action: LastAction
    status: MemberStatus
    position: str
    is_on_wall: bool = False
    is_revivable: bool = False
    is_in_oc: bool = False


class WarFaction(BaseModel):
    id: int
    name: str
    score: int
    chain: int


class WarStatus(BaseModel):
    war_id: int | None
    start: int | None
    end: int | None
    target: int | None
    winner: int | None
    factions: list[WarFaction]


class Bar(BaseModel):
    current: int
    maximum: int


class Cooldowns(BaseModel):
    drug: int = 0
    medical: int = 0
    booster: int = 0


class MemberBars(BaseModel):
    energy: Bar
    happy: Bar
    cooldowns: Cooldowns

    @property
    def is_stacking(self) -> bool:
        return self.energy.current > self.energy.maximum


class OverviewResponse(BaseModel):
    members: list[FactionMember]
    war: WarStatus | None
    cached_at: int  # unix timestamp


class MemberDetail(BaseModel):
    player_id: int
    name: str
    bars: MemberBars | None = None
    error: str | None = None


class DetailResponse(BaseModel):
    members: list[MemberDetail]
    cached_at: int
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_models.py -v
```

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "feat: pydantic models for Torn API responses"
```

---

### Task 3: Torn API Client with Caching

**Files:**
- Create: `app/torn_client.py`
- Create: `tests/test_torn_client.py`

- [ ] **Step 1: Write tests with mocked HTTP**

```python
# tests/test_torn_client.py
import time
import pytest
import httpx
from unittest.mock import AsyncMock, patch

from app.torn_client import TornClient


FAKE_MEMBERS_RESPONSE = {
    "members": [
        {
            "id": 123,
            "name": "TestPlayer",
            "level": 50,
            "days_in_faction": 100,
            "last_action": {"status": "Online", "timestamp": 1774600000, "relative": "1 min ago"},
            "status": {"description": "Okay", "details": None, "state": "Okay", "color": "green", "until": None},
            "position": "Team 1",
            "is_on_wall": False,
            "is_revivable": False,
            "is_in_oc": False,
        }
    ]
}

FAKE_WARS_RESPONSE = {
    "wars": {
        "ranked": {
            "war_id": 100,
            "start": 1774630800,
            "end": None,
            "target": 500,
            "winner": None,
            "factions": [
                {"id": 1, "name": "Enemy", "score": 5, "chain": 10},
                {"id": 2, "name": "Us", "score": 8, "chain": 15},
            ],
        },
        "raids": [],
        "territory": [],
    }
}

FAKE_BARS_RESPONSE = {
    "energy": {"current": 500, "maximum": 150, "increment": 5, "interval": 600, "ticktime": 50, "fulltime": 0},
    "happy": {"current": 4000, "maximum": 4525, "increment": 5, "interval": 900, "ticktime": 350, "fulltime": 0},
    "cooldowns": {"drug": 3600, "medical": 0, "booster": 0},
}


@pytest.fixture
def client():
    return TornClient(api_key="fake_key", cache_ttl=5)


@pytest.mark.asyncio
async def test_fetch_members(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_MEMBERS_RESPONSE
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        members = await client.fetch_members()

    assert len(members) == 1
    assert members[0].name == "TestPlayer"


@pytest.mark.asyncio
async def test_fetch_war(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_WARS_RESPONSE
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        war = await client.fetch_war()

    assert war is not None
    assert war.war_id == 100
    assert war.factions[1].name == "Us"


@pytest.mark.asyncio
async def test_fetch_war_no_rw(client):
    resp_data = {"wars": {"ranked": None, "raids": [], "territory": []}}
    mock_resp = AsyncMock()
    mock_resp.json.return_value = resp_data
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        war = await client.fetch_war()

    assert war is None


@pytest.mark.asyncio
async def test_fetch_member_bars(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_BARS_RESPONSE
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        bars = await client.fetch_member_bars("member_key_123")

    assert bars.energy.current == 500
    assert bars.is_stacking is True
    assert bars.cooldowns.drug == 3600


@pytest.mark.asyncio
async def test_caching(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_MEMBERS_RESPONSE
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp) as mock_get:
        await client.fetch_members()
        await client.fetch_members()  # should hit cache

    mock_get.assert_called_once()  # only 1 HTTP call
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_torn_client.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement TornClient**

```python
# app/torn_client.py
from __future__ import annotations

import time
from typing import Any

import httpx

from app.models import FactionMember, WarStatus, MemberBars


V1_BASE = "https://api.torn.com"
V2_BASE = "https://api.torn.com/v2"


class TornClient:
    def __init__(self, api_key: str, cache_ttl: int = 60) -> None:
        self._api_key = api_key
        self._cache_ttl = cache_ttl
        self._http = httpx.AsyncClient(timeout=15.0)
        self._cache: dict[str, tuple[float, Any]] = {}

    async def close(self) -> None:
        await self._http.aclose()

    def _get_cached(self, key: str) -> Any | None:
        if key in self._cache:
            ts, data = self._cache[key]
            if time.time() - ts < self._cache_ttl:
                return data
        return None

    def _set_cached(self, key: str, data: Any) -> None:
        self._cache[key] = (time.time(), data)

    async def fetch_members(self) -> list[FactionMember]:
        cached = self._get_cached("members")
        if cached is not None:
            return cached

        resp = await self._http.get(
            f"{V2_BASE}/faction/members",
            params={"key": self._api_key},
        )
        resp.raise_for_status()
        raw = resp.json()
        members = [FactionMember(**m) for m in raw["members"]]
        self._set_cached("members", members)
        return members

    async def fetch_war(self) -> WarStatus | None:
        cached = self._get_cached("war")
        if cached is not None:
            return cached

        resp = await self._http.get(
            f"{V2_BASE}/faction/",
            params={"selections": "wars", "key": self._api_key},
        )
        resp.raise_for_status()
        raw = resp.json()
        ranked = raw.get("wars", {}).get("ranked")
        if not ranked:
            self._set_cached("war", None)
            return None

        war = WarStatus(**ranked)
        self._set_cached("war", war)
        return war

    async def fetch_member_bars(self, member_key: str) -> MemberBars:
        resp = await self._http.get(
            f"{V1_BASE}/user/",
            params={"selections": "bars,cooldowns", "key": member_key},
        )
        resp.raise_for_status()
        raw = resp.json()
        return MemberBars(
            energy=raw["energy"],
            happy=raw["happy"],
            cooldowns=raw["cooldowns"],
        )
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_torn_client.py -v
```

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/torn_client.py tests/test_torn_client.py
git commit -m "feat: Torn API client with caching"
```

---

### Task 4: SQLite Key Storage with Encryption

**Files:**
- Create: `app/db.py`
- Create: `tests/test_db.py`

- [ ] **Step 1: Write tests**

```python
# tests/test_db.py
import os
import pytest
from cryptography.fernet import Fernet

from app.db import KeyStore


@pytest.fixture
def store(tmp_path):
    db_path = str(tmp_path / "test.db")
    key = Fernet.generate_key().decode()
    return KeyStore(db_path=db_path, encryption_key=key)


def test_store_and_retrieve_key(store):
    store.save_key(player_id=123, player_name="TestPlayer", api_key="abc123secret")
    result = store.get_all_keys()
    assert len(result) == 1
    assert result[0]["player_id"] == 123
    assert result[0]["player_name"] == "TestPlayer"
    assert result[0]["api_key"] == "abc123secret"  # decrypted


def test_delete_key(store):
    store.save_key(player_id=123, player_name="TestPlayer", api_key="abc123secret")
    store.delete_key(player_id=123)
    result = store.get_all_keys()
    assert len(result) == 0


def test_update_existing_key(store):
    store.save_key(player_id=123, player_name="TestPlayer", api_key="old_key")
    store.save_key(player_id=123, player_name="TestPlayer", api_key="new_key")
    result = store.get_all_keys()
    assert len(result) == 1
    assert result[0]["api_key"] == "new_key"


def test_keys_are_encrypted_in_db(store):
    store.save_key(player_id=123, player_name="Test", api_key="plaintext_secret")
    # Read raw from DB — should NOT contain plaintext
    import sqlite3
    conn = sqlite3.connect(store._db_path)
    row = conn.execute("SELECT api_key_encrypted FROM member_keys WHERE player_id = 123").fetchone()
    conn.close()
    assert row[0] != "plaintext_secret"
    assert row[0] != b"plaintext_secret"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_db.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement KeyStore**

```python
# app/db.py
from __future__ import annotations

import sqlite3
from cryptography.fernet import Fernet


class KeyStore:
    def __init__(self, db_path: str = "data/keys.db", encryption_key: str = "") -> None:
        self._db_path = db_path
        self._fernet = Fernet(encryption_key.encode() if isinstance(encryption_key, str) else encryption_key)
        self._init_db()

    def _init_db(self) -> None:
        conn = sqlite3.connect(self._db_path)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS member_keys (
                player_id INTEGER PRIMARY KEY,
                player_name TEXT NOT NULL,
                api_key_encrypted BLOB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        conn.close()

    def save_key(self, player_id: int, player_name: str, api_key: str) -> None:
        encrypted = self._fernet.encrypt(api_key.encode())
        conn = sqlite3.connect(self._db_path)
        conn.execute(
            """INSERT INTO member_keys (player_id, player_name, api_key_encrypted)
               VALUES (?, ?, ?)
               ON CONFLICT(player_id) DO UPDATE SET
                 player_name = excluded.player_name,
                 api_key_encrypted = excluded.api_key_encrypted""",
            (player_id, player_name, encrypted),
        )
        conn.commit()
        conn.close()

    def delete_key(self, player_id: int) -> None:
        conn = sqlite3.connect(self._db_path)
        conn.execute("DELETE FROM member_keys WHERE player_id = ?", (player_id,))
        conn.commit()
        conn.close()

    def get_all_keys(self) -> list[dict]:
        conn = sqlite3.connect(self._db_path)
        rows = conn.execute("SELECT player_id, player_name, api_key_encrypted FROM member_keys").fetchall()
        conn.close()
        result = []
        for player_id, player_name, encrypted in rows:
            api_key = self._fernet.decrypt(encrypted).decode()
            result.append({"player_id": player_id, "player_name": player_name, "api_key": api_key})
        return result
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_db.py -v
```

Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/db.py tests/test_db.py
git commit -m "feat: encrypted key storage with SQLite"
```

---

### Task 5: FastAPI Routes

**Files:**
- Create: `app/main.py`
- Create: `tests/test_routes.py`

- [ ] **Step 1: Write route tests**

```python
# tests/test_routes.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.models import FactionMember, WarStatus, MemberBars, Bar, Cooldowns, LastAction, MemberStatus, WarFaction


def _make_member(id: int = 123, name: str = "Test", status_state: str = "Okay", online: str = "Online") -> FactionMember:
    return FactionMember(
        id=id, name=name, level=50, days_in_faction=100,
        last_action=LastAction(status=online, timestamp=1774600000, relative="1 min ago"),
        status=MemberStatus(description=status_state, details=None, state=status_state, color="green", until=None),
        position="Team 1", is_on_wall=False, is_revivable=False, is_in_oc=False,
    )


def _make_war() -> WarStatus:
    return WarStatus(
        war_id=100, start=1774630800, end=None, target=500, winner=None,
        factions=[WarFaction(id=1, name="Enemy", score=5, chain=10), WarFaction(id=2, name="Us", score=8, chain=15)],
    )


@pytest.fixture
def mock_client():
    client = AsyncMock()
    client.fetch_members = AsyncMock(return_value=[_make_member()])
    client.fetch_war = AsyncMock(return_value=_make_war())
    client.fetch_member_bars = AsyncMock(return_value=MemberBars(
        energy=Bar(current=500, maximum=150),
        happy=Bar(current=4000, maximum=4525),
        cooldowns=Cooldowns(drug=3600),
    ))
    return client


@pytest.fixture
def mock_store():
    store = MagicMock()
    store.get_all_keys.return_value = [{"player_id": 123, "player_name": "Test", "api_key": "fake_key"}]
    store.save_key = MagicMock()
    store.delete_key = MagicMock()
    return store


@pytest.mark.asyncio
async def test_overview(mock_client, mock_store):
    with patch("app.main.torn_client", mock_client), patch("app.main.key_store", mock_store):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["members"]) == 1
    assert data["members"][0]["name"] == "Test"
    assert data["war"]["war_id"] == 100


@pytest.mark.asyncio
async def test_members_detail(mock_client, mock_store):
    with patch("app.main.torn_client", mock_client), patch("app.main.key_store", mock_store):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/members/detail")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["members"]) == 1
    assert data["members"][0]["bars"]["energy"]["current"] == 500


@pytest.mark.asyncio
async def test_register_key(mock_client, mock_store):
    # Mock the validate call — returns player info
    validate_resp = AsyncMock()
    validate_resp.json.return_value = {"player_id": 999, "name": "NewPlayer"}
    validate_resp.raise_for_status = lambda: None
    mock_client._http = AsyncMock()
    mock_client._http.get = AsyncMock(return_value=validate_resp)

    with patch("app.main.torn_client", mock_client), patch("app.main.key_store", mock_store):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/keys", json={"api_key": "some_key"})
    assert resp.status_code == 200
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_routes.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement FastAPI app**

```python
# app/main.py
from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import TORN_API_KEY, FACTION_ID, CACHE_TTL, ENCRYPTION_KEY
from app.torn_client import TornClient
from app.db import KeyStore

torn_client: TornClient | None = None
key_store: KeyStore | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global torn_client, key_store
    os.makedirs("data", exist_ok=True)
    torn_client = TornClient(api_key=TORN_API_KEY, cache_ttl=CACHE_TTL)
    key_store = KeyStore(db_path="data/keys.db", encryption_key=ENCRYPTION_KEY)
    yield
    await torn_client.close()


app = FastAPI(title="TM War Room", lifespan=lifespan)


@app.get("/api/overview")
async def overview():
    members = await torn_client.fetch_members()
    war = await torn_client.fetch_war()
    return {
        "members": [m.model_dump() for m in members],
        "war": war.model_dump() if war else None,
        "cached_at": int(time.time()),
    }


@app.get("/api/members/detail")
async def members_detail():
    keys = key_store.get_all_keys()
    results = []
    for entry in keys:
        try:
            bars = await torn_client.fetch_member_bars(entry["api_key"])
            results.append({
                "player_id": entry["player_id"],
                "name": entry["player_name"],
                "bars": bars.model_dump(),
                "error": None,
            })
        except Exception as e:
            results.append({
                "player_id": entry["player_id"],
                "name": entry["player_name"],
                "bars": None,
                "error": str(e),
            })
    return {"members": results, "cached_at": int(time.time())}


class KeyRegister(BaseModel):
    api_key: str


@app.post("/api/keys")
async def register_key(body: KeyRegister):
    # Validate key by fetching user profile
    import httpx
    async with httpx.AsyncClient(timeout=10.0) as http:
        resp = await http.get(
            "https://api.torn.com/user/",
            params={"selections": "basic", "key": body.api_key},
        )
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise HTTPException(status_code=400, detail=data["error"]["error"])
        player_id = data["player_id"]
        player_name = data["name"]

    key_store.save_key(player_id=player_id, player_name=player_name, api_key=body.api_key)
    return {"status": "ok", "player_id": player_id, "name": player_name}


@app.delete("/api/keys/{player_id}")
async def delete_key(player_id: int):
    key_store.delete_key(player_id=player_id)
    return {"status": "ok"}


# Static files — mount AFTER API routes
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/")
    async def index():
        return FileResponse(os.path.join(static_dir, "index.html"))
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_routes.py -v
```

Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/main.py tests/test_routes.py
git commit -m "feat: FastAPI routes for overview, detail, and key management"
```

---

### Task 6: Frontend Dashboard

**Files:**
- Create: `static/index.html`
- Create: `static/style.css`
- Create: `static/app.js`

- [ ] **Step 1: Create index.html**

```html
<!-- static/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TM War Room</title>
    <link rel="stylesheet" href="/static/style.css">
</head>
<body>
    <header>
        <h1>TM War Room</h1>
        <div id="war-status" class="war-banner">Loading...</div>
    </header>

    <main>
        <div class="controls">
            <span id="last-update">—</span>
            <span id="member-count">—</span>
            <button onclick="refresh()">Refresh</button>
            <button onclick="showKeyModal()">+ Add API Key</button>
        </div>

        <table id="members-table">
            <thead>
                <tr>
                    <th>Status</th>
                    <th>Name</th>
                    <th>Lvl</th>
                    <th>State</th>
                    <th>Last Action</th>
                    <th>Energy</th>
                    <th>Drug CD</th>
                    <th>Position</th>
                    <th>Wall</th>
                </tr>
            </thead>
            <tbody id="members-body">
            </tbody>
        </table>
    </main>

    <div id="key-modal" class="modal" style="display:none">
        <div class="modal-content">
            <h2>Register API Key</h2>
            <p>Your key is stored encrypted. Only energy & cooldowns are read.</p>
            <input type="text" id="key-input" placeholder="Paste your Torn API key">
            <div class="modal-buttons">
                <button onclick="submitKey()">Register</button>
                <button onclick="hideKeyModal()">Cancel</button>
            </div>
            <p id="key-status"></p>
        </div>
    </div>

    <script src="/static/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create style.css**

```css
/* static/style.css */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0a0a0a;
    color: #e0e0e0;
    min-height: 100vh;
}

header {
    padding: 1rem 2rem;
    border-bottom: 1px solid #222;
}

header h1 {
    font-size: 1.2rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.1em;
}

.war-banner {
    margin-top: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
}

.war-active { background: #1a2d1a; border: 1px solid #2d5a2d; color: #4ade80; }
.war-upcoming { background: #2d2a1a; border: 1px solid #5a4d2d; color: #facc15; }
.war-none { background: #1a1a1a; border: 1px solid #333; color: #666; }

main { padding: 1rem 2rem; }

.controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
    font-size: 0.85rem;
    color: #666;
}

.controls button {
    padding: 0.4rem 0.8rem;
    background: #1a1a2e;
    border: 1px solid #333;
    color: #aaa;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
}

.controls button:hover { background: #252540; color: #fff; }

table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
}

th {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 2px solid #222;
    color: #666;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.05em;
}

td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #1a1a1a;
}

tr:hover { background: #111; }

/* Readiness indicators */
.dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 4px;
}

.dot-green { background: #4ade80; box-shadow: 0 0 4px #4ade8066; }
.dot-yellow { background: #facc15; box-shadow: 0 0 4px #facc1566; }
.dot-red { background: #f87171; box-shadow: 0 0 4px #f8717166; }
.dot-gray { background: #555; }

.energy-stacking { color: #4ade80; font-weight: 600; }
.energy-low { color: #f87171; }
.energy-unknown { color: #555; }

.cd-active { color: #facc15; }
.cd-clear { color: #4ade80; }

a { color: #60a5fa; text-decoration: none; }
a:hover { text-decoration: underline; }

/* Modal */
.modal {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
}

.modal-content {
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 2rem;
    max-width: 400px;
    width: 90%;
}

.modal-content h2 { margin-bottom: 0.5rem; font-size: 1.1rem; }
.modal-content p { color: #888; font-size: 0.8rem; margin-bottom: 1rem; }

.modal-content input {
    width: 100%;
    padding: 0.5rem;
    background: #0a0a0a;
    border: 1px solid #333;
    color: #e0e0e0;
    border-radius: 4px;
    font-size: 0.9rem;
    margin-bottom: 1rem;
}

.modal-buttons { display: flex; gap: 0.5rem; }
.modal-buttons button {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #333;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
    background: #1a1a2e;
    color: #aaa;
}
.modal-buttons button:first-child { background: #1a2d1a; border-color: #2d5a2d; color: #4ade80; }

#key-status { margin-top: 0.5rem; font-size: 0.8rem; }
```

- [ ] **Step 3: Create app.js**

```javascript
// static/app.js
const REFRESH_INTERVAL = 60_000;

let overviewData = null;
let detailData = null;

async function fetchOverview() {
    const resp = await fetch('/api/overview');
    return resp.json();
}

async function fetchDetail() {
    const resp = await fetch('/api/members/detail');
    return resp.json();
}

function formatCooldown(seconds) {
    if (!seconds || seconds <= 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function getReadiness(member, detail) {
    const online = member.last_action.status;
    const state = member.status.state;

    // Red: offline long, traveling, jail
    if (state === 'Traveling' || state === 'Abroad') return 'red';
    if (state === 'Jail') return 'red';
    if (online === 'Offline') return 'red';

    // Yellow: hospital, or online but drug CD active
    if (state === 'Hospital') return 'yellow';
    if (detail && detail.bars) {
        if (detail.bars.cooldowns.drug > 3600) return 'yellow';
    }

    // Green: online + okay
    if (online === 'Online' && state === 'Okay') return 'green';
    if (online === 'Idle' && state === 'Okay') return 'yellow';

    return 'gray';
}

function renderWar(war) {
    const el = document.getElementById('war-status');
    if (!war || !war.war_id) {
        el.className = 'war-banner war-none';
        el.textContent = 'No active Ranked War';
        return;
    }

    const us = war.factions.find(f => f.id === 11559);
    const them = war.factions.find(f => f.id !== 11559);
    const now = Math.floor(Date.now() / 1000);
    const started = war.start <= now;

    if (started) {
        el.className = 'war-banner war-active';
        el.innerHTML = `RW ACTIVE vs <strong>${them?.name || '?'}</strong> — Score: <strong>${us?.score || 0}</strong> : ${them?.score || 0}`;
    } else {
        const diff = war.start - now;
        const hours = Math.floor(diff / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        el.className = 'war-banner war-upcoming';
        el.innerHTML = `RW in <strong>${hours}h ${mins}m</strong> vs <strong>${them?.name || '?'}</strong>`;
    }
}

function renderMembers(members, details) {
    const tbody = document.getElementById('members-body');
    const detailMap = {};
    if (details) {
        for (const d of details) {
            detailMap[d.player_id] = d;
        }
    }

    // Sort: online first, then by readiness
    const order = { green: 0, yellow: 1, gray: 2, red: 3 };
    const sorted = [...members].sort((a, b) => {
        const ra = order[getReadiness(a, detailMap[a.id])] ?? 2;
        const rb = order[getReadiness(b, detailMap[b.id])] ?? 2;
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
    });

    tbody.innerHTML = sorted.map(m => {
        const d = detailMap[m.id];
        const readiness = getReadiness(m, d);

        let energyHtml = '<span class="energy-unknown">—</span>';
        let cdHtml = '<span class="energy-unknown">—</span>';
        if (d && d.bars) {
            const e = d.bars.energy;
            const isStacking = e.current > e.maximum;
            energyHtml = isStacking
                ? `<span class="energy-stacking">${e.current}/${e.maximum}</span>`
                : `<span class="${e.current < e.maximum ? 'energy-low' : ''}">${e.current}/${e.maximum}</span>`;

            const drugCd = d.bars.cooldowns.drug;
            cdHtml = drugCd > 0
                ? `<span class="cd-active">${formatCooldown(drugCd)}</span>`
                : `<span class="cd-clear">Ready</span>`;
        }

        const stateText = m.status.state !== 'Okay' ? m.status.state : m.last_action.status;

        return `<tr>
            <td><span class="dot dot-${readiness}"></span></td>
            <td><a href="https://www.torn.com/profiles.php?XID=${m.id}" target="_blank">${m.name}</a></td>
            <td>${m.level}</td>
            <td>${stateText}</td>
            <td>${m.last_action.relative}</td>
            <td>${energyHtml}</td>
            <td>${cdHtml}</td>
            <td>${m.position}</td>
            <td>${m.is_on_wall ? '⚔️' : ''}</td>
        </tr>`;
    }).join('');
}

async function refresh() {
    try {
        const [ov, det] = await Promise.all([fetchOverview(), fetchDetail()]);
        overviewData = ov;
        detailData = det;

        renderWar(ov.war);
        renderMembers(ov.members, det.members);

        document.getElementById('last-update').textContent =
            `Updated: ${new Date().toLocaleTimeString()}`;
        document.getElementById('member-count').textContent =
            `${ov.members.length} members`;
    } catch (e) {
        console.error('Refresh failed:', e);
    }
}

function showKeyModal() {
    document.getElementById('key-modal').style.display = 'flex';
    document.getElementById('key-input').value = '';
    document.getElementById('key-status').textContent = '';
}

function hideKeyModal() {
    document.getElementById('key-modal').style.display = 'none';
}

async function submitKey() {
    const key = document.getElementById('key-input').value.trim();
    const status = document.getElementById('key-status');
    if (!key) { status.textContent = 'Please enter a key'; return; }

    status.textContent = 'Validating...';
    try {
        const resp = await fetch('/api/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: key }),
        });
        const data = await resp.json();
        if (resp.ok) {
            status.style.color = '#4ade80';
            status.textContent = `Registered: ${data.name} [${data.player_id}]`;
            setTimeout(() => { hideKeyModal(); refresh(); }, 1500);
        } else {
            status.style.color = '#f87171';
            status.textContent = data.detail || 'Invalid key';
        }
    } catch (e) {
        status.style.color = '#f87171';
        status.textContent = 'Error: ' + e.message;
    }
}

// Initial load + auto-refresh
refresh();
setInterval(refresh, REFRESH_INTERVAL);
```

- [ ] **Step 4: Manual test**

```bash
cd ~/Programowanie/tm-war-room
source .venv/bin/activate
TORN_API_KEY=QnwG8tWc1EumWqJ1 uvicorn app.main:app --reload --port 8080
```

Open http://localhost:8080 in browser. Verify:
- War status banner shows (active or upcoming RW)
- Member table populates with 70 members
- Color-coded dots work
- "Add API Key" modal opens/closes
- Auto-refresh works (check console for errors)

- [ ] **Step 5: Commit**

```bash
git add static/
git commit -m "feat: frontend dashboard with auto-refresh"
```

---

### Task 7: Docker & Deployment Config

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY app/ app/
COPY static/ static/

RUN mkdir -p data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
services:
  warroom:
    build: .
    ports:
      - "8000:8000"
    environment:
      - TORN_API_KEY=${TORN_API_KEY}
      - FACTION_ID=${FACTION_ID:-11559}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - CACHE_TTL=${CACHE_TTL:-60}
    volumes:
      - warroom-data:/app/data
    restart: unless-stopped
    networks:
      - coolify

networks:
  coolify:
    external: true

volumes:
  warroom-data:
```

- [ ] **Step 3: Test Docker build locally**

```bash
cd ~/Programowanie/tm-war-room
docker build -t tm-war-room .
```

Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: Docker setup for Coolify deployment"
```

---

### Task 8: Deploy to Coolify + DNS

This task uses external APIs. Run commands from the host machine.

- [ ] **Step 1: Create DNS record on BunnyCDN**

```bash
# Create A record: rw.tri.ovh -> 109.199.102.222 (Coolify server)
curl -s -X PUT \
  -H "AccessKey: ee7f6166-fb99-4d09-a5b3-8faa8919ee2fceca5bd5-0d69-4a6a-85fb-7752e7b24d58" \
  -H "Content-Type: application/json" \
  -d '{"Type": 0, "Name": "rw", "Value": "109.199.102.222", "Ttl": 300}' \
  "https://api.bunny.net/dnszone/456772/records"
```

Expected: 201 response with record ID.

- [ ] **Step 2: Push code to git repo**

Push to Forgejo (git.orzech.me) or GitHub:

```bash
cd ~/Programowanie/tm-war-room
# Option A: Forgejo
git remote add origin https://git.orzech.me/pawelorzech/tm-war-room.git
git push -u origin main

# Option B: GitHub
gh repo create tm-war-room --private --source=. --push
```

- [ ] **Step 3: Create Coolify service**

Create a new Docker Compose service via Coolify API under the "orzech" project:

```bash
# Generate a Fernet key for encryption
FERNET_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

# Create service via Coolify API
curl -s -X POST \
  -H "Authorization: Bearer 3|sGidHUIVFgdtc3KMjU1TdxI9NDa2EmEltOMOFZ4Kad46fd6c" \
  -H "Content-Type: application/json" \
  -d "{
    \"project_uuid\": \"uggg8ggco8skgkwggwkcgocg\",
    \"environment_name\": \"production\",
    \"type\": \"docker-compose\",
    \"server_uuid\": \"<SERVER_UUID>\",
    \"name\": \"tm-war-room\",
    \"domains\": \"rw.tri.ovh\"
  }" \
  "https://admin.orzech.me/api/v1/services"
```

Note: You need the server UUID first. Get it via:
```bash
curl -s -H "Authorization: Bearer 3|sGidHUIVFgdtc3KMjU1TdxI9NDa2EmEltOMOFZ4Kad46fd6c" \
  "https://admin.orzech.me/api/v1/servers" | python3 -m json.tool
```

- [ ] **Step 4: Configure env vars in Coolify**

Set these environment variables in the Coolify service:
- `TORN_API_KEY=QnwG8tWc1EumWqJ1`
- `FACTION_ID=11559`
- `ENCRYPTION_KEY=<generated Fernet key>`
- `CACHE_TTL=60`

- [ ] **Step 5: Deploy and verify**

Trigger deploy from Coolify UI or API. Then verify:

```bash
curl -s https://rw.tri.ovh/api/overview | python3 -m json.tool | head -20
```

Expected: JSON with members array and war object.

- [ ] **Step 6: Final commit with deployment notes**

```bash
git add .
git commit -m "docs: deployment configuration notes"
```

---

## Verification Checklist

After all tasks are complete, verify end-to-end:

- [ ] `https://rw.tri.ovh` loads the dashboard
- [ ] War status banner shows current RW info
- [ ] 70 members appear in the table, sorted by readiness
- [ ] Color dots are correct (green/yellow/red based on status)
- [ ] "Add API Key" modal works — test with bombel's key
- [ ] After adding key, energy + drug CD columns populate
- [ ] Auto-refresh works (wait 60s, data updates)
- [ ] Remove key via DELETE endpoint works
