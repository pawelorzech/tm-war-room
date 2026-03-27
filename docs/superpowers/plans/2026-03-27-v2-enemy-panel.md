# V2: Enemy Panel & War Command Center

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the passive status board into an active war command center with enemy faction view, threat scoring, attack links, and war progress tracking.

**Architecture:** Add enemy faction data from Torn API v2 + TornStats spy data for threat estimation. Enemy faction auto-detected from active RW or manually entered. Frontend gets tabbed UI (Our Team / Enemy Targets) with direct attack links and a war score progress bar.

**Tech Stack:** Same as V1 (FastAPI, httpx, vanilla JS) + TornStats API integration

---

## API Reference (verified from live calls)

### Enemy faction members (Torn v2)
```
GET https://api.torn.com/v2/faction/{faction_id}?selections=members&key={KEY}
```
Returns same structure as our faction: `{members: [{id, name, level, last_action, status, position, is_on_wall, ...}]}`

### Enemy faction basic info (Torn v2)
```
GET https://api.torn.com/v2/faction/{faction_id}?key={KEY}
```
Returns: `{basic: {id, name, tag, leader_id, respect, rank: {level, name, division, wins}, best_chain, members (count)}}`

### TornStats spy/faction
```
GET https://www.tornstats.com/api/v2/{TS_KEY}/spy/faction/{faction_id}
```
Returns per member: `{name, level, id, personalstats: {Xanax Taken, Refills, Stat Enhancers Used, Attacks Won, Defends Won, Damage Done, Networth, Highest Level Beaten, Best Damage Made, Best Kill Streak, ...}}`

### Enemy player profile (Torn v1)
```
GET https://api.torn.com/user/{player_id}?selections=profile&key={KEY}
```
Returns: `{player_id, name, level, life: {current, maximum}, status, last_action, faction, job}`

### Attack URL pattern
```
https://www.torn.com/loader.php?sid=attack&user2ID={player_id}
```

---

## File Changes

```
app/
├── config.py           # MODIFY: add TORNSTATS_API_KEY
├── models.py           # MODIFY: add EnemyMember, FactionInfo, PersonalStats, ThreatScore
├── torn_client.py      # MODIFY: add fetch_enemy_members, fetch_faction_info, fetch_tornstats_spy
├── main.py             # MODIFY: add /api/enemy, /api/enemy/set endpoints
└── threat.py           # CREATE: threat score calculator
static/
├── index.html          # REWRITE: tabbed layout, war progress bar, faction ID input
├── style.css           # REWRITE: tabs, progress bar, attack buttons, threat colors
└── app.js              # REWRITE: enemy tab, threat display, tab switching, war progress
tests/
├── test_threat.py      # CREATE: threat score tests
├── test_torn_client.py # MODIFY: add enemy/tornstats tests
└── test_routes.py      # MODIFY: add enemy route tests
```

---

### Task 1: Models & Config

**Files:**
- Modify: `app/config.py`
- Modify: `app/models.py`

- [ ] **Step 1: Update config.py — add TornStats key**

Replace full content of `app/config.py`:

```python
from __future__ import annotations

import os
from cryptography.fernet import Fernet


TORN_API_KEY: str = os.environ.get("TORN_API_KEY", "")
FACTION_ID: int = int(os.environ.get("FACTION_ID", "11559"))
CACHE_TTL: int = int(os.environ.get("CACHE_TTL", "60"))
TORNSTATS_API_KEY: str = os.environ.get("TORNSTATS_API_KEY", "")

_enc_key = os.environ.get("ENCRYPTION_KEY")
if not _enc_key:
    _enc_key = Fernet.generate_key().decode()
    print("WARNING: No ENCRYPTION_KEY set. Generated ephemeral key. Keys will be lost on restart.")

ENCRYPTION_KEY: str = _enc_key
```

- [ ] **Step 2: Add new models to models.py**

Append to end of `app/models.py` (keep all existing models):

```python
class PersonalStats(BaseModel):
    xanax_taken: int = 0
    refills: int = 0
    stat_enhancers_used: int = 0
    attacks_won: int = 0
    attacks_lost: int = 0
    defends_won: int = 0
    defends_lost: int = 0
    networth: int = 0
    highest_beaten: int = 0
    best_damage: int = 0
    best_kill_streak: int = 0
    damage_done: int = 0

    @classmethod
    def from_tornstats(cls, raw: dict) -> PersonalStats:
        return cls(
            xanax_taken=raw.get("Xanax Taken", 0),
            refills=raw.get("Refills", 0),
            stat_enhancers_used=raw.get("Stat Enhancers Used", 0),
            attacks_won=raw.get("Attacks Won", 0),
            attacks_lost=raw.get("Attacks Lost", 0),
            defends_won=raw.get("Defends Won", 0),
            defends_lost=raw.get("Defends Lost", 0),
            networth=raw.get("Networth", 0),
            highest_beaten=raw.get("Highest Level Beaten", 0),
            best_damage=raw.get("Best Damage Made", 0),
            best_kill_streak=raw.get("Best Kill Streak", 0),
            damage_done=raw.get("Damage Done", 0),
        )


class EnemyMember(BaseModel):
    id: int
    name: str
    level: int
    last_action: LastAction
    status: MemberStatus
    position: str
    is_on_wall: bool = False
    life: Bar | None = None
    personal_stats: PersonalStats | None = None
    threat_score: int = 0  # 0-100, computed by threat.py
    threat_label: str = "unknown"  # easy / medium / hard / avoid / unknown


class FactionInfo(BaseModel):
    id: int
    name: str
    tag: str = ""
    respect: int = 0
    members_count: int = 0
    rank_name: str = ""
    rank_level: int = 0
    best_chain: int = 0
    wins: int = 0


class WarProgress(BaseModel):
    war_id: int | None
    start: int | None
    end: int | None
    target: int | None
    our_score: int = 0
    their_score: int = 0
    our_name: str = ""
    their_name: str = ""
    our_id: int = 0
    their_id: int = 0

    @property
    def our_progress_pct(self) -> float:
        if not self.target:
            return 0.0
        return min(100.0, (self.our_score / self.target) * 100)

    @property
    def their_progress_pct(self) -> float:
        if not self.target:
            return 0.0
        return min(100.0, (self.their_score / self.target) * 100)
```

- [ ] **Step 3: Commit**

```bash
git add app/config.py app/models.py
git commit -m "feat: add enemy models, TornStats config, war progress"
```

---

### Task 2: Threat Score Calculator

**Files:**
- Create: `app/threat.py`
- Create: `tests/test_threat.py`

- [ ] **Step 1: Write threat score tests**

```python
# tests/test_threat.py
from app.models import PersonalStats
from app.threat import compute_threat


def test_easy_target():
    stats = PersonalStats(
        xanax_taken=100, refills=10, stat_enhancers_used=0,
        attacks_won=200, attacks_lost=50, defends_won=10, defends_lost=100,
        networth=500_000_000, highest_beaten=60, best_damage=2000,
        best_kill_streak=10, damage_done=500_000,
    )
    score, label = compute_threat(stats, level=30)
    assert score < 30
    assert label == "easy"


def test_medium_target():
    stats = PersonalStats(
        xanax_taken=1000, refills=300, stat_enhancers_used=0,
        attacks_won=2000, attacks_lost=200, defends_won=100, defends_lost=500,
        networth=3_000_000_000, highest_beaten=85, best_damage=4000,
        best_kill_streak=50, damage_done=5_000_000,
    )
    score, label = compute_threat(stats, level=65)
    assert 30 <= score < 60
    assert label == "medium"


def test_hard_target():
    stats = PersonalStats(
        xanax_taken=3000, refills=1500, stat_enhancers_used=10,
        attacks_won=8000, attacks_lost=300, defends_won=500, defends_lost=1000,
        networth=8_000_000_000, highest_beaten=100, best_damage=7000,
        best_kill_streak=100, damage_done=20_000_000,
    )
    score, label = compute_threat(stats, level=95)
    assert 60 <= score < 85
    assert label == "hard"


def test_avoid_target():
    stats = PersonalStats(
        xanax_taken=5000, refills=3000, stat_enhancers_used=50,
        attacks_won=15000, attacks_lost=100, defends_won=2000, defends_lost=500,
        networth=15_000_000_000, highest_beaten=100, best_damage=9000,
        best_kill_streak=200, damage_done=50_000_000,
    )
    score, label = compute_threat(stats, level=100)
    assert score >= 85
    assert label == "avoid"


def test_no_stats():
    score, label = compute_threat(None, level=50)
    assert label == "unknown"


def test_score_capped_at_100():
    stats = PersonalStats(
        xanax_taken=99999, refills=99999, stat_enhancers_used=999,
        attacks_won=99999, attacks_lost=0, defends_won=99999, defends_lost=0,
        networth=99_000_000_000, highest_beaten=100, best_damage=99999,
        best_kill_streak=9999, damage_done=999_000_000,
    )
    score, label = compute_threat(stats, level=100)
    assert score <= 100
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/Programowanie/tm-war-room && source .venv/bin/activate
pytest tests/test_threat.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement threat calculator**

```python
# app/threat.py
from __future__ import annotations

from app.models import PersonalStats


def compute_threat(stats: PersonalStats | None, level: int) -> tuple[int, str]:
    """Compute threat score (0-100) and label from personalstats + level.

    Scoring weights (tuned for RW context):
    - Xanax/refills = training intensity proxy (35%)
    - Combat record = experience proxy (30%)
    - Level + highest beaten = power proxy (20%)
    - Networth + SEs = resource proxy (15%)
    """
    if stats is None:
        return 0, "unknown"

    # Training intensity (0-35)
    xan_score = min(10, stats.xanax_taken / 500)  # 5000 xan = max
    refill_score = min(10, stats.refills / 300)  # 3000 refills = max
    se_score = min(5, stats.stat_enhancers_used / 10)  # 50 SEs = max
    damage_score = min(10, stats.damage_done / 5_000_000)  # 50M damage = max
    training = xan_score + refill_score + se_score + damage_score

    # Combat record (0-30)
    wins_score = min(15, stats.attacks_won / 1000)  # 15K wins = max
    streak_score = min(5, stats.best_kill_streak / 40)  # 200 streak = max
    best_dmg_score = min(5, stats.best_damage / 1800)  # 9000 best = max
    defend_score = min(5, stats.defends_won / 400)  # 2000 defends = max
    combat = wins_score + streak_score + best_dmg_score + defend_score

    # Power proxy (0-20)
    level_score = min(10, level / 10)  # lvl 100 = max
    beaten_score = min(10, stats.highest_beaten / 10)  # beaten lvl 100 = max
    power = level_score + beaten_score

    # Resources (0-15)
    nw_score = min(15, stats.networth / 1_000_000_000)  # 15B NW = max
    resources = nw_score

    raw = training + combat + power + resources
    score = min(100, max(0, int(raw)))

    if score < 30:
        label = "easy"
    elif score < 60:
        label = "medium"
    elif score < 85:
        label = "hard"
    else:
        label = "avoid"

    return score, label
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_threat.py -v
```

Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/threat.py tests/test_threat.py
git commit -m "feat: threat score calculator from personalstats"
```

---

### Task 3: TornClient — Enemy & TornStats Methods

**Files:**
- Modify: `app/torn_client.py`
- Modify: `tests/test_torn_client.py`

- [ ] **Step 1: Add tests for new methods**

Append to `tests/test_torn_client.py`:

```python
FAKE_ENEMY_MEMBERS = {
    "members": [
        {
            "id": 183527,
            "name": "DarkMagic",
            "level": 82,
            "days_in_faction": 66,
            "last_action": {"status": "Offline", "timestamp": 1774603546, "relative": "13 min ago"},
            "status": {"description": "Okay", "details": None, "state": "Okay", "color": "green", "until": None},
            "position": "Tubby Kitten",
            "is_on_wall": False,
            "is_revivable": False,
            "is_in_oc": False,
        }
    ]
}

FAKE_FACTION_INFO = {
    "basic": {
        "id": 9420,
        "name": "The Pusheen Army",
        "tag": "TPA",
        "tag_image": "9420-30654.png",
        "leader_id": 1959482,
        "co_leader_id": 2820593,
        "respect": 4161395,
        "days_old": 6323,
        "capacity": 100,
        "members": 73,
        "is_enlisted": None,
        "rank": {"level": 16, "name": "Platinum", "division": 2, "position": 0, "wins": 62},
        "best_chain": 50000,
    }
}

FAKE_TORNSTATS_SPY = {
    "status": True,
    "faction": {
        "members": {
            "183527": {
                "name": "DarkMagic",
                "level": 82,
                "id": 183527,
                "personalstats": {
                    "Xanax Taken": 2002,
                    "Refills": 934,
                    "Stat Enhancers Used": 0,
                    "Attacks Won": 4742,
                    "Attacks Lost": 257,
                    "Defends Won": 264,
                    "Defends Lost": 2630,
                    "Damage Done": 13808654,
                    "Networth": 5900149236,
                    "Highest Level Beaten": 100,
                    "Best Damage Made": 6365,
                    "Best Kill Streak": 93,
                },
            }
        }
    },
}


@pytest.mark.asyncio
async def test_fetch_enemy_members(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_ENEMY_MEMBERS
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        members = await client.fetch_enemy_members(9420)

    assert len(members) == 1
    assert members[0].name == "DarkMagic"
    assert members[0].level == 82


@pytest.mark.asyncio
async def test_fetch_faction_info(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_FACTION_INFO
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        info = await client.fetch_faction_info(9420)

    assert info.name == "The Pusheen Army"
    assert info.tag == "TPA"
    assert info.rank_name == "Platinum"
    assert info.wins == 62


@pytest.mark.asyncio
async def test_fetch_tornstats_spy(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_TORNSTATS_SPY
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        spy_data = await client.fetch_tornstats_spy(9420, "fake_ts_key")

    assert 183527 in spy_data
    assert spy_data[183527].xanax_taken == 2002
    assert spy_data[183527].networth == 5900149236


@pytest.mark.asyncio
async def test_fetch_tornstats_spy_empty(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = {"status": False}
    mock_resp.raise_for_status = lambda: None

    with patch.object(client._http, "get", return_value=mock_resp):
        spy_data = await client.fetch_tornstats_spy(9420, "fake_ts_key")

    assert spy_data == {}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_torn_client.py -v
```

Expected: 4 new tests FAIL (AttributeError: `TornClient` has no `fetch_enemy_members`)

- [ ] **Step 3: Add new methods to TornClient**

Add these methods to the `TornClient` class in `app/torn_client.py` (after `fetch_member_bars`):

```python
    async def fetch_enemy_members(self, faction_id: int) -> list[FactionMember]:
        cache_key = f"enemy_{faction_id}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        resp = await self._http.get(
            f"{V2_BASE}/faction/{faction_id}",
            params={"selections": "members", "key": self._api_key},
        )
        resp.raise_for_status()
        raw = await _json(resp)
        members = [FactionMember(**m) for m in raw["members"]]
        self._set_cached(cache_key, members)
        return members

    async def fetch_faction_info(self, faction_id: int) -> "FactionInfo":
        from app.models import FactionInfo

        cache_key = f"finfo_{faction_id}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        resp = await self._http.get(
            f"{V2_BASE}/faction/{faction_id}",
            params={"key": self._api_key},
        )
        resp.raise_for_status()
        raw = await _json(resp)
        basic = raw.get("basic", {})
        rank = basic.get("rank", {})
        info = FactionInfo(
            id=basic.get("id", faction_id),
            name=basic.get("name", "Unknown"),
            tag=basic.get("tag", ""),
            respect=basic.get("respect", 0),
            members_count=basic.get("members", 0),
            rank_name=rank.get("name", ""),
            rank_level=rank.get("level", 0),
            best_chain=basic.get("best_chain", 0),
            wins=rank.get("wins", 0),
        )
        self._set_cached(cache_key, info)
        return info

    async def fetch_tornstats_spy(self, faction_id: int, ts_key: str) -> dict[int, "PersonalStats"]:
        from app.models import PersonalStats

        cache_key = f"tspy_{faction_id}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        resp = await self._http.get(
            f"https://www.tornstats.com/api/v2/{ts_key}/spy/faction/{faction_id}",
        )
        resp.raise_for_status()
        raw = await _json(resp)

        result: dict[int, PersonalStats] = {}
        if not raw.get("status"):
            self._set_cached(cache_key, result)
            return result

        members_data = raw.get("faction", {}).get("members", {})
        for pid_str, member_data in members_data.items():
            ps_raw = member_data.get("personalstats", {})
            if ps_raw:
                result[int(pid_str)] = PersonalStats.from_tornstats(ps_raw)

        self._set_cached(cache_key, result)
        return result
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_torn_client.py -v
```

Expected: All 9 tests PASS (5 old + 4 new)

- [ ] **Step 5: Commit**

```bash
git add app/torn_client.py tests/test_torn_client.py
git commit -m "feat: enemy faction + TornStats spy methods"
```

---

### Task 4: API Routes — Enemy Endpoint

**Files:**
- Modify: `app/main.py`
- Modify: `tests/test_routes.py`

- [ ] **Step 1: Add enemy route tests**

Append to `tests/test_routes.py`:

```python
from app.models import FactionInfo, PersonalStats, EnemyMember


@pytest.mark.asyncio
async def test_enemy_with_rw(mock_client, mock_store):
    """When RW is active, /api/enemy auto-detects enemy faction."""
    mock_client.fetch_enemy_members = AsyncMock(return_value=[_make_member(id=999, name="Enemy1")])
    mock_client.fetch_faction_info = AsyncMock(return_value=FactionInfo(
        id=9420, name="The Pusheen Army", tag="TPA", respect=4000000,
        members_count=73, rank_name="Platinum", rank_level=16, best_chain=50000, wins=62,
    ))
    mock_client.fetch_tornstats_spy = AsyncMock(return_value={
        999: PersonalStats(xanax_taken=2000, refills=900, attacks_won=4000,
                           networth=5_000_000_000, highest_beaten=100, best_damage=6000,
                           best_kill_streak=90, damage_done=13_000_000)
    })

    with patch("app.main.torn_client", mock_client), patch("app.main.key_store", mock_store):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/enemy")
    assert resp.status_code == 200
    data = resp.json()
    assert data["faction"]["name"] == "The Pusheen Army"
    assert len(data["members"]) == 1
    assert data["members"][0]["name"] == "Enemy1"
    assert data["members"][0]["threat_score"] > 0


@pytest.mark.asyncio
async def test_enemy_manual_faction(mock_client, mock_store):
    """When no RW, use query param faction_id."""
    mock_client.fetch_war = AsyncMock(return_value=None)
    mock_client.fetch_enemy_members = AsyncMock(return_value=[_make_member(id=888, name="ManualEnemy")])
    mock_client.fetch_faction_info = AsyncMock(return_value=FactionInfo(
        id=12345, name="Some Faction", tag="SF",
    ))
    mock_client.fetch_tornstats_spy = AsyncMock(return_value={})

    with patch("app.main.torn_client", mock_client), patch("app.main.key_store", mock_store):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/enemy?faction_id=12345")
    assert resp.status_code == 200
    data = resp.json()
    assert data["faction"]["name"] == "Some Faction"


@pytest.mark.asyncio
async def test_war_progress(mock_client, mock_store):
    with patch("app.main.torn_client", mock_client), patch("app.main.key_store", mock_store):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/overview")
    data = resp.json()
    assert "war_progress" in data
    assert data["war_progress"]["target"] == 500
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_routes.py -v
```

Expected: 3 new tests FAIL

- [ ] **Step 3: Update main.py**

Replace full content of `app/main.py`:

```python
from __future__ import annotations

import inspect
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import TORN_API_KEY, FACTION_ID, CACHE_TTL, ENCRYPTION_KEY, TORNSTATS_API_KEY
from app.torn_client import TornClient
from app.db import KeyStore
from app.threat import compute_threat

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


def _build_war_progress(war) -> dict | None:
    if not war or not war.war_id:
        return None
    us = next((f for f in war.factions if f.id == FACTION_ID), None)
    them = next((f for f in war.factions if f.id != FACTION_ID), None)
    if not us or not them:
        return None
    target = war.target or 0
    return {
        "war_id": war.war_id,
        "start": war.start,
        "end": war.end,
        "target": target,
        "our_score": us.score,
        "their_score": them.score,
        "our_name": us.name,
        "their_name": them.name,
        "our_id": us.id,
        "their_id": them.id,
        "our_pct": min(100.0, (us.score / target * 100)) if target else 0,
        "their_pct": min(100.0, (them.score / target * 100)) if target else 0,
    }


@app.get("/api/overview")
async def overview():
    members = await torn_client.fetch_members()
    war = await torn_client.fetch_war()
    return {
        "members": [m.model_dump() for m in members],
        "war": war.model_dump() if war else None,
        "war_progress": _build_war_progress(war),
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


@app.get("/api/enemy")
async def enemy(faction_id: int | None = Query(default=None)):
    # Auto-detect from RW if no faction_id provided
    enemy_id = faction_id
    if not enemy_id:
        war = await torn_client.fetch_war()
        if war and war.factions:
            enemy_faction = next((f for f in war.factions if f.id != FACTION_ID), None)
            if enemy_faction:
                enemy_id = enemy_faction.id

    if not enemy_id:
        return {"faction": None, "members": [], "cached_at": int(time.time())}

    # Fetch enemy data in parallel-ish (sequential but cached)
    members = await torn_client.fetch_enemy_members(enemy_id)
    info = await torn_client.fetch_faction_info(enemy_id)

    # TornStats spy data (optional — may not have key)
    spy_data = {}
    if TORNSTATS_API_KEY:
        try:
            spy_data = await torn_client.fetch_tornstats_spy(enemy_id, TORNSTATS_API_KEY)
        except Exception:
            pass  # TornStats down or rate limited — continue without

    # Build enemy member list with threat scores
    enemy_list = []
    for m in members:
        ps = spy_data.get(m.id)
        score, label = compute_threat(ps, m.level)
        enemy_list.append({
            **m.model_dump(),
            "personal_stats": ps.model_dump() if ps else None,
            "threat_score": score,
            "threat_label": label,
            "attack_url": f"https://www.torn.com/loader.php?sid=attack&user2ID={m.id}",
            "profile_url": f"https://www.torn.com/profiles.php?XID={m.id}",
            "tornstats_url": f"https://www.tornstats.com/playerinfo.php?user={m.id}",
        })

    # Sort: attackable first (Online+Okay), then by threat (easy first)
    def sort_key(e):
        attackable = 0 if (e["last_action"]["status"] == "Online" and e["status"]["state"] == "Okay") else 1
        return (attackable, e["threat_score"])

    enemy_list.sort(key=sort_key)

    return {
        "faction": info.model_dump(),
        "members": enemy_list,
        "cached_at": int(time.time()),
    }


class KeyRegister(BaseModel):
    api_key: str


@app.post("/api/keys")
async def register_key(body: KeyRegister):
    resp = await torn_client._http.get(
        "https://api.torn.com/user/",
        params={"selections": "basic", "key": body.api_key},
    )
    resp.raise_for_status()
    raw = resp.json()
    if inspect.isawaitable(raw):
        raw = await raw
    if "error" in raw:
        raise HTTPException(status_code=400, detail=raw["error"]["error"])
    player_id = raw["player_id"]
    player_name = raw["name"]

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
pytest tests/ -v
```

Expected: All tests PASS (old + new)

- [ ] **Step 5: Commit**

```bash
git add app/main.py tests/test_routes.py
git commit -m "feat: enemy endpoint with auto-detect, threat scoring, attack links"
```

---

### Task 5: Frontend V2 — Tabbed War Command Center

**Files:**
- Rewrite: `static/index.html`
- Rewrite: `static/style.css`
- Rewrite: `static/app.js`

- [ ] **Step 1: Rewrite index.html**

Replace full content of `static/index.html`:

```html
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
        <div class="header-row">
            <h1>TM War Room</h1>
            <div class="header-controls">
                <span id="last-update"></span>
                <button onclick="refresh()">Refresh</button>
                <button onclick="showKeyModal()">+ API Key</button>
            </div>
        </div>
        <div id="war-status" class="war-banner">Loading...</div>
        <div id="war-progress" class="war-progress" style="display:none">
            <div class="progress-labels">
                <span id="wp-our-name">Us</span>
                <span id="wp-target">Target: 0</span>
                <span id="wp-their-name">Them</span>
            </div>
            <div class="progress-track">
                <div id="wp-our-bar" class="progress-bar progress-us" style="width:0%"></div>
            </div>
            <div class="progress-track">
                <div id="wp-their-bar" class="progress-bar progress-them" style="width:0%"></div>
            </div>
        </div>
    </header>

    <nav class="tabs">
        <button class="tab active" data-tab="our-team" onclick="switchTab('our-team')">Our Team <span id="our-count" class="badge">0</span></button>
        <button class="tab" data-tab="enemy" onclick="switchTab('enemy')">Enemy Targets <span id="enemy-count" class="badge">0</span></button>
    </nav>

    <main>
        <!-- OUR TEAM TAB -->
        <div id="tab-our-team" class="tab-content active">
            <div class="summary" id="our-summary"></div>
            <table>
                <thead>
                    <tr>
                        <th></th>
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
                <tbody id="our-body"></tbody>
            </table>
        </div>

        <!-- ENEMY TAB -->
        <div id="tab-enemy" class="tab-content">
            <div class="enemy-header">
                <div class="summary" id="enemy-summary"></div>
                <div id="enemy-faction-input" style="display:none">
                    <input type="number" id="faction-id-input" placeholder="Enter faction ID">
                    <button onclick="loadEnemy()">Load</button>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th></th>
                        <th>Name</th>
                        <th>Lvl</th>
                        <th>Threat</th>
                        <th>State</th>
                        <th>Last Action</th>
                        <th>Xan/Refills</th>
                        <th>Atk Won</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="enemy-body"></tbody>
            </table>
        </div>
    </main>

    <div id="key-modal" class="modal" style="display:none">
        <div class="modal-content">
            <h2>Register API Key</h2>
            <p>Your key is stored encrypted. Only energy &amp; cooldowns are read.</p>
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

- [ ] **Step 2: Rewrite style.css**

Replace full content of `static/style.css`:

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0a0a0a;
    color: #e0e0e0;
    min-height: 100vh;
}

/* Header */
header { padding: 1rem 2rem; border-bottom: 1px solid #222; }
.header-row { display: flex; justify-content: space-between; align-items: center; }
header h1 { font-size: 1.2rem; color: #888; text-transform: uppercase; letter-spacing: 0.1em; }
.header-controls { display: flex; align-items: center; gap: 0.75rem; font-size: 0.8rem; color: #555; }
.header-controls button {
    padding: 0.3rem 0.6rem; background: #1a1a2e; border: 1px solid #333;
    color: #aaa; border-radius: 4px; cursor: pointer; font-size: 0.75rem;
}
.header-controls button:hover { background: #252540; color: #fff; }

/* War banner */
.war-banner { margin-top: 0.5rem; padding: 0.75rem 1rem; border-radius: 6px; font-size: 1rem; font-weight: 600; }
.war-active { background: #1a2d1a; border: 1px solid #2d5a2d; color: #4ade80; }
.war-upcoming { background: #2d2a1a; border: 1px solid #5a4d2d; color: #facc15; }
.war-none { background: #1a1a1a; border: 1px solid #333; color: #666; }

/* War progress */
.war-progress { margin-top: 0.5rem; }
.progress-labels { display: flex; justify-content: space-between; font-size: 0.75rem; color: #888; margin-bottom: 0.25rem; }
.progress-track { height: 6px; background: #1a1a1a; border-radius: 3px; margin-bottom: 0.25rem; overflow: hidden; }
.progress-bar { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
.progress-us { background: #4ade80; }
.progress-them { background: #f87171; }

/* Tabs */
.tabs { display: flex; border-bottom: 1px solid #222; padding: 0 2rem; }
.tab {
    padding: 0.6rem 1.2rem; background: none; border: none; border-bottom: 2px solid transparent;
    color: #666; cursor: pointer; font-size: 0.85rem; font-weight: 500;
}
.tab:hover { color: #aaa; }
.tab.active { color: #e0e0e0; border-bottom-color: #4ade80; }
.badge { font-size: 0.7rem; background: #222; padding: 0.1rem 0.4rem; border-radius: 8px; margin-left: 0.3rem; }

/* Tab content */
main { padding: 1rem 2rem; }
.tab-content { display: none; }
.tab-content.active { display: block; }

/* Summary */
.summary { font-size: 0.8rem; color: #888; margin-bottom: 0.75rem; }
.summary .num-green { color: #4ade80; font-weight: 600; }
.summary .num-yellow { color: #facc15; font-weight: 600; }
.summary .num-red { color: #f87171; font-weight: 600; }

/* Enemy header */
.enemy-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
#enemy-faction-input { display: flex; gap: 0.5rem; }
#enemy-faction-input input {
    padding: 0.3rem 0.5rem; background: #111; border: 1px solid #333;
    color: #e0e0e0; border-radius: 4px; font-size: 0.8rem; width: 120px;
}
#enemy-faction-input button {
    padding: 0.3rem 0.6rem; background: #1a1a2e; border: 1px solid #333;
    color: #aaa; border-radius: 4px; cursor: pointer; font-size: 0.8rem;
}

/* Tables */
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th {
    text-align: left; padding: 0.5rem 0.75rem; border-bottom: 2px solid #222;
    color: #666; font-weight: 600; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em;
}
td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #1a1a1a; }
tr:hover { background: #111; }

/* Dots */
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.dot-green { background: #4ade80; box-shadow: 0 0 4px #4ade8066; }
.dot-yellow { background: #facc15; box-shadow: 0 0 4px #facc1566; }
.dot-red { background: #f87171; box-shadow: 0 0 4px #f8717166; }
.dot-gray { background: #555; }

/* Energy */
.energy-stacking { color: #4ade80; font-weight: 600; }
.energy-low { color: #f87171; }
.energy-unknown { color: #555; }
.cd-active { color: #facc15; }
.cd-clear { color: #4ade80; }

/* Threat */
.threat { font-size: 0.75rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 3px; display: inline-block; }
.threat-easy { background: #1a2d1a; color: #4ade80; }
.threat-medium { background: #2d2a1a; color: #facc15; }
.threat-hard { background: #2d1a1a; color: #f87171; }
.threat-avoid { background: #2d1a2d; color: #c084fc; }
.threat-unknown { background: #1a1a1a; color: #555; }

/* Attack button */
.btn-attack {
    padding: 0.25rem 0.5rem; background: #2d1a1a; border: 1px solid #5a2d2d;
    color: #f87171; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 600;
    text-decoration: none; display: inline-block;
}
.btn-attack:hover { background: #3d2a2a; color: #fca5a5; text-decoration: none; }
.btn-attack.disabled { opacity: 0.3; pointer-events: none; }

/* Links */
a { color: #60a5fa; text-decoration: none; }
a:hover { text-decoration: underline; }

/* Modal */
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal-content { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 2rem; max-width: 400px; width: 90%; }
.modal-content h2 { margin-bottom: 0.5rem; font-size: 1.1rem; }
.modal-content p { color: #888; font-size: 0.8rem; margin-bottom: 1rem; }
.modal-content input { width: 100%; padding: 0.5rem; background: #0a0a0a; border: 1px solid #333; color: #e0e0e0; border-radius: 4px; font-size: 0.9rem; margin-bottom: 1rem; }
.modal-buttons { display: flex; gap: 0.5rem; }
.modal-buttons button { flex: 1; padding: 0.5rem; border: 1px solid #333; border-radius: 4px; cursor: pointer; font-size: 0.85rem; background: #1a1a2e; color: #aaa; }
.modal-buttons button:first-child { background: #1a2d1a; border-color: #2d5a2d; color: #4ade80; }
#key-status { margin-top: 0.5rem; font-size: 0.8rem; }
```

- [ ] **Step 3: Rewrite app.js**

Replace full content of `static/app.js`:

```javascript
const REFRESH_INTERVAL = 60_000;
const FACTION_ID = 11559;

let overviewData = null;
let detailData = null;
let enemyData = null;

// --- API ---
const api = {
    overview: () => fetch('/api/overview').then(r => r.json()),
    detail: () => fetch('/api/members/detail').then(r => r.json()),
    enemy: (fid) => fetch(fid ? `/api/enemy?faction_id=${fid}` : '/api/enemy').then(r => r.json()),
};

// --- Tabs ---
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tab}`));
}

// --- Formatting ---
function formatCooldown(s) {
    if (!s || s <= 0) return '\u2014';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatNumber(n) {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
}

// --- Readiness (our team) ---
function getReadiness(m, detail) {
    const online = m.last_action.status, state = m.status.state;
    if (state === 'Traveling' || state === 'Abroad' || state === 'Jail') return 'red';
    if (online === 'Offline') return 'red';
    if (state === 'Hospital') return 'yellow';
    if (detail?.bars?.cooldowns.drug > 3600) return 'yellow';
    if (online === 'Online' && state === 'Okay') return 'green';
    if (online === 'Idle') return 'yellow';
    return 'gray';
}

// --- Enemy attackability ---
function isAttackable(m) {
    return m.last_action.status !== 'Offline' && m.status.state === 'Okay';
}

// --- War Banner ---
function renderWar(war, wp) {
    const el = document.getElementById('war-status');
    const prog = document.getElementById('war-progress');

    if (!war?.war_id) {
        el.className = 'war-banner war-none';
        el.textContent = 'No active Ranked War';
        prog.style.display = 'none';
        document.getElementById('enemy-faction-input').style.display = 'flex';
        return;
    }

    document.getElementById('enemy-faction-input').style.display = 'none';
    const us = war.factions.find(f => f.id === FACTION_ID);
    const them = war.factions.find(f => f.id !== FACTION_ID);
    const now = Math.floor(Date.now() / 1000);
    const started = war.start <= now;

    if (started) {
        el.className = 'war-banner war-active';
        el.innerHTML = `RW ACTIVE vs <strong>${them?.name || '?'}</strong> \u2014 <strong>${us?.score || 0}</strong> : ${them?.score || 0} (target: ${war.target})`;
    } else {
        const diff = war.start - now;
        const h = Math.floor(diff / 3600), m = Math.floor((diff % 3600) / 60);
        el.className = 'war-banner war-upcoming';
        el.innerHTML = `RW in <strong>${h}h ${m}m</strong> vs <strong>${them?.name || '?'}</strong>`;
    }

    // Progress bars
    if (wp) {
        prog.style.display = 'block';
        document.getElementById('wp-our-name').textContent = `${wp.our_name}: ${wp.our_score}`;
        document.getElementById('wp-target').textContent = `Target: ${wp.target}`;
        document.getElementById('wp-their-name').textContent = `${wp.their_name}: ${wp.their_score}`;
        document.getElementById('wp-our-bar').style.width = wp.our_pct + '%';
        document.getElementById('wp-their-bar').style.width = wp.their_pct + '%';
    }
}

// --- Our Team ---
function renderOurTeam(members, details) {
    const detailMap = {};
    if (details) for (const d of details) detailMap[d.player_id] = d;

    const order = { green: 0, yellow: 1, gray: 2, red: 3 };
    const sorted = [...members].sort((a, b) => {
        const ra = order[getReadiness(a, detailMap[a.id])] ?? 2;
        const rb = order[getReadiness(b, detailMap[b.id])] ?? 2;
        return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
    });

    // Summary
    let online = 0, hospital = 0, offline = 0;
    for (const m of members) {
        if (m.last_action.status === 'Online') online++;
        else if (m.status.state === 'Hospital') hospital++;
        else offline++;
    }
    document.getElementById('our-summary').innerHTML =
        `<span class="num-green">${online}</span> online, <span class="num-yellow">${hospital}</span> hospital, <span class="num-red">${offline}</span> offline/away`;
    document.getElementById('our-count').textContent = members.length;

    document.getElementById('our-body').innerHTML = sorted.map(m => {
        const d = detailMap[m.id];
        const r = getReadiness(m, d);
        let eHtml = '<span class="energy-unknown">\u2014</span>';
        let cdHtml = '<span class="energy-unknown">\u2014</span>';
        if (d?.bars) {
            const e = d.bars.energy;
            eHtml = e.current > e.maximum
                ? `<span class="energy-stacking">${e.current}/${e.maximum}</span>`
                : `<span class="${e.current < e.maximum ? 'energy-low' : ''}">${e.current}/${e.maximum}</span>`;
            const cd = d.bars.cooldowns.drug;
            cdHtml = cd > 0 ? `<span class="cd-active">${formatCooldown(cd)}</span>` : `<span class="cd-clear">Ready</span>`;
        }
        const state = m.status.state !== 'Okay' ? m.status.state : m.last_action.status;
        return `<tr>
            <td><span class="dot dot-${r}"></span></td>
            <td><a href="https://www.torn.com/profiles.php?XID=${m.id}" target="_blank">${m.name}</a></td>
            <td>${m.level}</td>
            <td>${state}</td>
            <td>${m.last_action.relative}</td>
            <td>${eHtml}</td>
            <td>${cdHtml}</td>
            <td>${m.position}</td>
            <td>${m.is_on_wall ? '\u2694\uFE0F' : ''}</td>
        </tr>`;
    }).join('');
}

// --- Enemy ---
function renderEnemy(data) {
    if (!data?.faction) {
        document.getElementById('enemy-summary').textContent = 'No enemy faction loaded';
        document.getElementById('enemy-body').innerHTML = '';
        document.getElementById('enemy-count').textContent = '0';
        return;
    }

    const f = data.faction;
    const members = data.members;
    let online = 0, hospital = 0;
    for (const m of members) {
        if (m.last_action.status !== 'Offline' && m.status.state === 'Okay') online++;
        if (m.status.state === 'Hospital') hospital++;
    }

    document.getElementById('enemy-summary').innerHTML =
        `<strong>${f.name}</strong> [${f.tag}] \u2014 ${f.rank_name} (${f.wins}W) \u2014 ` +
        `<span class="num-green">${online}</span> attackable, ` +
        `<span class="num-yellow">${hospital}</span> hospital, ` +
        `${members.length} total`;
    document.getElementById('enemy-count').textContent = members.length;

    document.getElementById('enemy-body').innerHTML = members.map(m => {
        const attackable = isAttackable(m);
        const state = m.status.state !== 'Okay' ? m.status.state : m.last_action.status;
        const ps = m.personal_stats;
        const xanRef = ps ? `${formatNumber(ps.xanax_taken)}/${formatNumber(ps.refills)}` : '\u2014';
        const atkWon = ps ? formatNumber(ps.attacks_won) : '\u2014';

        const hospitalTime = m.status.state === 'Hospital' && m.status.until
            ? ` (${formatCooldown(m.status.until - Math.floor(Date.now()/1000))})`
            : '';

        return `<tr>
            <td><span class="dot dot-${attackable ? 'green' : m.status.state === 'Hospital' ? 'yellow' : 'red'}"></span></td>
            <td><a href="${m.profile_url}" target="_blank">${m.name}</a></td>
            <td>${m.level}</td>
            <td><span class="threat threat-${m.threat_label}">${m.threat_label} ${m.threat_score}</span></td>
            <td>${state}${hospitalTime}</td>
            <td>${m.last_action.relative}</td>
            <td>${xanRef}</td>
            <td>${atkWon}</td>
            <td>
                <a href="${m.attack_url}" target="_blank" class="btn-attack ${attackable ? '' : 'disabled'}">Attack</a>
                <a href="${m.tornstats_url}" target="_blank" style="font-size:0.7rem;margin-left:0.3rem">TS</a>
            </td>
        </tr>`;
    }).join('');
}

// --- Refresh ---
async function refresh() {
    try {
        const [ov, det, en] = await Promise.all([api.overview(), api.detail(), api.enemy()]);
        overviewData = ov; detailData = det; enemyData = en;

        renderWar(ov.war, ov.war_progress);
        renderOurTeam(ov.members, det.members);
        renderEnemy(en);

        document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
    } catch (e) {
        console.error('Refresh failed:', e);
    }
}

async function loadEnemy() {
    const fid = document.getElementById('faction-id-input').value.trim();
    if (!fid) return;
    enemyData = await api.enemy(fid);
    renderEnemy(enemyData);
}

// --- Key Modal ---
function showKeyModal() {
    document.getElementById('key-modal').style.display = 'flex';
    document.getElementById('key-input').value = '';
    document.getElementById('key-status').textContent = '';
}
function hideKeyModal() { document.getElementById('key-modal').style.display = 'none'; }

async function submitKey() {
    const key = document.getElementById('key-input').value.trim();
    const status = document.getElementById('key-status');
    if (!key) { status.textContent = 'Enter a key'; return; }
    status.textContent = 'Validating...';
    try {
        const resp = await fetch('/api/keys', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: key }),
        });
        const data = await resp.json();
        if (resp.ok) {
            status.style.color = '#4ade80';
            status.textContent = `OK: ${data.name} [${data.player_id}]`;
            setTimeout(() => { hideKeyModal(); refresh(); }, 1000);
        } else {
            status.style.color = '#f87171';
            status.textContent = data.detail || 'Invalid key';
        }
    } catch (e) { status.style.color = '#f87171'; status.textContent = e.message; }
}

refresh();
setInterval(refresh, REFRESH_INTERVAL);
```

- [ ] **Step 4: Manual test**

```bash
cd ~/Programowanie/tm-war-room && source .venv/bin/activate
TORN_API_KEY=QnwG8tWc1EumWqJ1 TORNSTATS_API_KEY=TS_skXIryO5jWYGOOYv uvicorn app.main:app --reload --port 8080
```

Open http://localhost:8080 — verify:
- War progress bar shows score + target
- "Our Team" tab works as before
- "Enemy Targets" tab shows The Pusheen Army members
- Threat scores appear (easy/medium/hard/avoid)
- Attack buttons link to torn.com
- TornStats "TS" links work
- Hospital timers show remaining time

- [ ] **Step 5: Commit**

```bash
git add static/
git commit -m "feat: V2 frontend — tabbed UI, enemy targets, threat scores, attack links, war progress"
```

---

### Task 6: Deploy V2

- [ ] **Step 1: Add TORNSTATS_API_KEY to Coolify**

```bash
APP_UUID="jut6hmgjyhv2bf8qpbahf92e"
curl -s -X POST \
  -H "Authorization: Bearer 3|sGidHUIVFgdtc3KMjU1TdxI9NDa2EmEltOMOFZ4Kad46fd6c" \
  -H "Content-Type: application/json" \
  -d '{"key": "TORNSTATS_API_KEY", "value": "TS_skXIryO5jWYGOOYv", "is_preview": false}' \
  "https://admin.orzech.me/api/v1/applications/$APP_UUID/envs"
```

- [ ] **Step 2: Push to GitHub**

```bash
cd ~/Programowanie/tm-war-room
git push origin master
```

- [ ] **Step 3: Trigger Coolify redeploy**

```bash
curl -s -H "Authorization: Bearer 3|sGidHUIVFgdtc3KMjU1TdxI9NDa2EmEltOMOFZ4Kad46fd6c" \
  "https://admin.orzech.me/api/v1/deploy?uuid=jut6hmgjyhv2bf8qpbahf92e&force=true"
```

- [ ] **Step 4: Verify live**

```bash
# Wait 30-60s for deploy, then:
curl -s https://rw.tri.ovh/api/enemy | python3 -m json.tool | head -30
```

Expected: JSON with `faction`, `members` array including `threat_score`, `attack_url`.

---

## Verification Checklist

- [ ] "Our Team" tab shows 70 members with readiness dots (unchanged from V1)
- [ ] "Enemy Targets" tab shows enemy faction members
- [ ] Enemy auto-detected from active RW (The Pusheen Army)
- [ ] When no RW: faction ID input field appears, manual entry works
- [ ] Threat scores show as colored badges (easy/medium/hard/avoid)
- [ ] Attack buttons link to `torn.com/loader.php?sid=attack&user2ID={id}`
- [ ] Attack buttons disabled (greyed out) for offline/hospital/traveling enemies
- [ ] TornStats "TS" links open player info
- [ ] War progress bar shows scores + target with % bars
- [ ] Hospital timers show remaining time for hospitalized enemies
- [ ] Xanax/Refills column shows training intensity
- [ ] Enemy sorted: attackable first, then by threat score (easy → avoid)
- [ ] Auto-refresh every 60s updates both tabs
- [ ] Summary line shows: "X attackable, Y hospital, Z total" for enemy
