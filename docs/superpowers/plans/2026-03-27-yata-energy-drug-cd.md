# YATA Energy & Drug CD Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-member Torn API energy/drug CD fetching with a hybrid YATA + per-key approach, gated by position-based access control.

**Architecture:** Backend fetches YATA faction members data (single call, 1h cache) and merges with per-key Torn API data (real-time, for registered members). Position of the requesting user determines whether they see all members or only themselves. Frontend renders energy/drug CD with source indicators.

**Tech Stack:** Python/FastAPI, httpx, vanilla JS

---

### Task 1: Add `fetch_yata_members()` to TornClient

**Files:**
- Modify: `app/torn_client.py:34-42` (cache methods)
- Modify: `app/torn_client.py:12-13` (constants)
- Test: `tests/test_torn_client.py`

- [ ] **Step 1: Write failing test for `fetch_yata_members` success**

Add to `tests/test_torn_client.py`:

```python
FAKE_YATA_MEMBERS = {
    "123": {
        "id": 123, "name": "TestPlayer", "status": "online", "last_action": 1711500000,
        "dif": 365, "energy_share": 1, "energy": 87, "refill": False,
        "drug_cd": 14400, "revive": True, "nnb_share": 1, "nnb": 45,
        "crimes_rank": 5, "bonus_score": 120, "carnage": 2,
        "stats_share": -1, "stats_dexterity": 0, "stats_defense": 0,
        "stats_speed": 0, "stats_strength": 0, "stats_total": 0,
    }
}


@pytest.mark.asyncio
async def test_fetch_yata_members(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_YATA_MEMBERS
    mock_resp.raise_for_status = lambda: None
    with patch.object(client._http, "get", return_value=mock_resp):
        data = await client.fetch_yata_members()
    assert data is not None
    assert "123" in data
    assert data["123"]["energy"] == 87
    assert data["123"]["drug_cd"] == 14400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && python -m pytest tests/test_torn_client.py::test_fetch_yata_members -v`
Expected: FAIL — `TornClient` has no attribute `fetch_yata_members`

- [ ] **Step 3: Implement `fetch_yata_members()` with custom cache TTL**

In `app/torn_client.py`, add YATA constant after line 13:

```python
YATA_BASE = "https://yata.yt/api/v1"
YATA_CACHE_TTL = 3600
```

Modify `_get_cached` (line 34) to accept optional TTL:

```python
def _get_cached(self, key: str, ttl: int | None = None) -> Any | None:
    if key in self._cache:
        ts, data = self._cache[key]
        if time.time() - ts < (ttl if ttl is not None else self._cache_ttl):
            return data
    return None
```

Add method after `fetch_member_bars` (after line 104):

```python
async def fetch_yata_members(self, api_key: str | None = None) -> dict | None:
    """Fetch faction members energy/drug data from YATA API.

    Returns dict keyed by member ID string, or None on error.
    """
    cached = self._get_cached("yata_members", ttl=YATA_CACHE_TTL)
    if cached is not None:
        return cached
    key = api_key or self._api_key
    try:
        resp = await self._http.get(
            f"{YATA_BASE}/faction/members/",
            params={"key": key},
            timeout=8.0,
        )
        resp.raise_for_status()
        data = await _json(resp)
        if "error" in data:
            return None
        self._set_cached("yata_members", data)
        return data
    except Exception:
        return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && python -m pytest tests/test_torn_client.py::test_fetch_yata_members -v`
Expected: PASS

- [ ] **Step 5: Write test for YATA timeout returning None**

Add to `tests/test_torn_client.py`:

```python
@pytest.mark.asyncio
async def test_fetch_yata_members_timeout(client):
    with patch.object(client._http, "get", side_effect=httpx.TimeoutException("timeout")):
        data = await client.fetch_yata_members()
    assert data is None
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && python -m pytest tests/test_torn_client.py::test_fetch_yata_members_timeout -v`
Expected: PASS (implementation already returns None on exception)

- [ ] **Step 7: Write test for YATA error response returning None**

Add to `tests/test_torn_client.py`:

```python
@pytest.mark.asyncio
async def test_fetch_yata_members_error_response(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = {"error": {"error": "Invalid key", "code": 2}}
    mock_resp.raise_for_status = lambda: None
    with patch.object(client._http, "get", return_value=mock_resp):
        data = await client.fetch_yata_members()
    assert data is None
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && python -m pytest tests/test_torn_client.py::test_fetch_yata_members_error_response -v`
Expected: PASS

- [ ] **Step 9: Write test for YATA caching**

Add to `tests/test_torn_client.py`:

```python
@pytest.mark.asyncio
async def test_yata_caching(client):
    mock_resp = AsyncMock()
    mock_resp.json.return_value = FAKE_YATA_MEMBERS
    mock_resp.raise_for_status = lambda: None
    with patch.object(client._http, "get", return_value=mock_resp) as mock_get:
        await client.fetch_yata_members()
        await client.fetch_yata_members()
    mock_get.assert_called_once()
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && python -m pytest tests/test_torn_client.py::test_yata_caching -v`
Expected: PASS

- [ ] **Step 11: Run all torn_client tests to ensure nothing broke**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && python -m pytest tests/test_torn_client.py -v`
Expected: All tests PASS

- [ ] **Step 12: Commit**

```bash
git add app/torn_client.py tests/test_torn_client.py
git commit -m "feat: add fetch_yata_members() with custom cache TTL support"
```

---

### Task 2: Modify `/api/members/detail` with YATA + position filtering

**Files:**
- Modify: `app/main.py:83-95` (members_detail endpoint)
- Test: `tests/test_routes.py`

**Context:** The existing `_make_member` helper (line 10-16 of test_routes.py) hardcodes `position="Team 1"`. We need to make `position` configurable and write tests for position-based access control.

- [ ] **Step 1: Update `_make_member` helper to accept `position` parameter**

In `tests/test_routes.py`, modify the helper (line 10):

```python
def _make_member(id: int = 123, name: str = "Test", status_state: str = "Okay", online: str = "Online", position: str = "Team 1") -> FactionMember:
    return FactionMember(
        id=id, name=name, level=50, days_in_faction=100,
        last_action=LastAction(status=online, timestamp=1774600000, relative="1 min ago"),
        status=MemberStatus(description=status_state, details=None, state=status_state, color="green", until=None),
        position=position, is_on_wall=False, is_revivable=False, is_in_oc=False,
    )
```

- [ ] **Step 2: Write failing test — full access (Leader sees all members)**

Add to `tests/test_routes.py`:

```python
FAKE_YATA = {
    "123": {
        "id": 123, "name": "Test", "energy_share": 1, "energy": 87,
        "drug_cd": 14400, "refill": False, "nnb_share": 0, "nnb": 0,
        "stats_share": -1, "stats_dexterity": 0, "stats_defense": 0,
        "stats_speed": 0, "stats_strength": 0, "stats_total": 0,
        "status": "online", "last_action": 1711500000, "dif": 365,
        "crimes_rank": 5, "bonus_score": 120, "carnage": 2, "revive": True,
    },
    "456": {
        "id": 456, "name": "Other", "energy_share": 1, "energy": 120,
        "drug_cd": 0, "refill": True, "nnb_share": 0, "nnb": 0,
        "stats_share": -1, "stats_dexterity": 0, "stats_defense": 0,
        "stats_speed": 0, "stats_strength": 0, "stats_total": 0,
        "status": "online", "last_action": 1711500000, "dif": 200,
        "crimes_rank": 3, "bonus_score": 80, "carnage": 1, "revive": True,
    },
}


@pytest.fixture
def mock_client_yata():
    client = AsyncMock()
    client.fetch_members = AsyncMock(return_value=[
        _make_member(id=123, name="Leader", position="Leader"),
        _make_member(id=456, name="Member1", position="Team 1"),
    ])
    client.fetch_yata_members = AsyncMock(return_value=FAKE_YATA)
    client.fetch_member_bars = AsyncMock(return_value=MemberBars(
        energy=Bar(current=150, maximum=150),
        happy=Bar(current=4000, maximum=4525),
        cooldowns=Cooldowns(drug=0),
    ))
    return client


@pytest.fixture
def mock_store_leader():
    store = MagicMock()
    store.get_all_keys.return_value = [
        {"player_id": 123, "player_name": "Leader", "api_key": "leader_key", "is_faction_key": True},
    ]
    store.get_faction_key.return_value = {"player_id": 123, "player_name": "Leader", "api_key": "leader_key"}
    return store


@pytest.mark.asyncio
async def test_detail_full_access_sees_all(mock_client_yata, mock_store_leader):
    with patch("app.main.torn_client", mock_client_yata), patch("app.main.key_store", mock_store_leader):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/members/detail", headers={"X-Player-Id": "123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["yata_down"] is False
    # Leader sees both members
    assert "123" in data["members"]
    assert "456" in data["members"]
    # Player 123 has registered key — source should be "torn_api"
    assert data["members"]["123"]["source"] == "torn_api"
    assert data["members"]["123"]["energy"] == 150
    assert data["members"]["123"]["max_energy"] == 150
    # Player 456 has no registered key — source should be "yata"
    assert data["members"]["456"]["source"] == "yata"
    assert data["members"]["456"]["energy"] == 120
    assert data["members"]["456"]["max_energy"] is None
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && python -m pytest tests/test_routes.py::test_detail_full_access_sees_all -v`
Expected: FAIL — current endpoint doesn't return this shape

- [ ] **Step 4: Write test — self-only position sees only self**

Add to `tests/test_routes.py`:

```python
@pytest.fixture
def mock_store_member():
    store = MagicMock()
    store.get_all_keys.return_value = [
        {"player_id": 456, "player_name": "Member1", "api_key": "member_key", "is_faction_key": False},
    ]
    store.get_faction_key.return_value = None
    return store


@pytest.mark.asyncio
async def test_detail_self_only_sees_self(mock_client_yata, mock_store_member):
    with patch("app.main.torn_client", mock_client_yata), patch("app.main.key_store", mock_store_member):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/members/detail", headers={"X-Player-Id": "456"})
    assert resp.status_code == 200
    data = resp.json()
    # Team 1 position — sees only self
    assert len(data["members"]) == 1
    assert "456" in data["members"]
    assert "123" not in data["members"]
```

- [ ] **Step 5: Write test — YATA down degrades to per-key only**

Add to `tests/test_routes.py`:

```python
@pytest.mark.asyncio
async def test_detail_yata_down(mock_client_yata, mock_store_leader):
    mock_client_yata.fetch_yata_members = AsyncMock(return_value=None)
    with patch("app.main.torn_client", mock_client_yata), patch("app.main.key_store", mock_store_leader):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/members/detail", headers={"X-Player-Id": "123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["yata_down"] is True
    # Only registered members have data
    assert "123" in data["members"]
    assert data["members"]["123"]["source"] == "torn_api"
```

- [ ] **Step 6: Write test — YATA energy_share flags**

Add to `tests/test_routes.py`:

```python
@pytest.mark.asyncio
async def test_detail_yata_sharing_flags(mock_client_yata, mock_store_leader):
    yata_data = {
        "123": {**FAKE_YATA["123"], "energy_share": 1},
        "456": {**FAKE_YATA["456"], "energy_share": -1},
        "789": {**FAKE_YATA["456"], "id": 789, "name": "NotOnYata", "energy_share": 0},
    }
    mock_client_yata.fetch_yata_members = AsyncMock(return_value=yata_data)
    mock_client_yata.fetch_members = AsyncMock(return_value=[
        _make_member(id=123, name="Leader", position="Leader"),
        _make_member(id=456, name="Hidden", position="Team 1"),
        _make_member(id=789, name="NotOnYata", position="Team 2"),
    ])
    with patch("app.main.torn_client", mock_client_yata), patch("app.main.key_store", mock_store_leader):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/members/detail", headers={"X-Player-Id": "123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["members"]["456"]["source"] == "hidden"
    assert data["members"]["789"]["source"] == "not_on_yata"
```

- [ ] **Step 7: Implement the new `/api/members/detail` endpoint**

Replace `members_detail` function in `app/main.py` (lines 83-95):

```python
FULL_ACCESS_POSITIONS = {"Leader", "Co-leader", "Council", "API", "Leadership"}
SELF_ONLY_POSITIONS = {"Team 1", "Team 2", "Team 3", "Team 4", "Member", "Contact"}


@app.get("/api/members/detail")
async def members_detail(x_player_id: int = Header()):
    # Auth check
    all_keys = key_store.get_all_keys()
    if not any(k["player_id"] == x_player_id for k in all_keys):
        raise HTTPException(status_code=401, detail="Register your API key first")

    # Get members for position lookup
    active_key = _get_active_api_key()
    if active_key != torn_client._api_key:
        torn_client._api_key = active_key
    members = await torn_client.fetch_members()
    member_map = {m.id: m for m in members}

    # Determine access level
    requesting_member = member_map.get(x_player_id)
    if not requesting_member:
        return {"yata_down": False, "members": {}, "cached_at": int(time.time())}
    position = requesting_member.position
    if position in FULL_ACCESS_POSITIONS:
        visible_ids = set(member_map.keys())
    elif position in SELF_ONLY_POSITIONS:
        visible_ids = {x_player_id}
    else:
        return {"yata_down": False, "members": {}, "cached_at": int(time.time())}

    # Fetch YATA data (try faction key first, fallback to any registered key)
    yata_data = await torn_client.fetch_yata_members()
    if yata_data is None and all_keys:
        for entry in all_keys:
            yata_data = await torn_client.fetch_yata_members(api_key=entry["api_key"])
            if yata_data is not None:
                break
    yata_down = yata_data is None

    # Fetch per-key data for registered members
    per_key = {}
    for entry in all_keys:
        pid = entry["player_id"]
        if pid not in visible_ids:
            continue
        try:
            bars = await torn_client.fetch_member_bars(entry["api_key"])
            per_key[pid] = bars
        except Exception:
            pass

    # Merge: per-key wins, then YATA, then status flags
    result = {}
    for pid in visible_ids:
        pid_str = str(pid)
        if pid in per_key:
            bars = per_key[pid]
            result[pid_str] = {
                "energy": bars.energy.current,
                "max_energy": bars.energy.maximum,
                "drug_cd": bars.cooldowns.drug,
                "refill": False,
                "source": "torn_api",
            }
        elif yata_data and pid_str in yata_data:
            ym = yata_data[pid_str]
            share = ym.get("energy_share", 0)
            if share == 1:
                result[pid_str] = {
                    "energy": ym.get("energy", 0),
                    "max_energy": None,
                    "drug_cd": ym.get("drug_cd", 0),
                    "refill": ym.get("refill", False),
                    "source": "yata",
                }
            elif share == -1:
                result[pid_str] = {
                    "energy": 0, "max_energy": None,
                    "drug_cd": 0, "refill": False,
                    "source": "hidden",
                }
            else:
                result[pid_str] = {
                    "energy": 0, "max_energy": None,
                    "drug_cd": 0, "refill": False,
                    "source": "not_on_yata",
                }
        else:
            result[pid_str] = {
                "energy": 0, "max_energy": None,
                "drug_cd": 0, "refill": False,
                "source": "not_on_yata" if not yata_down else "unavailable",
            }

    return {"yata_down": yata_down, "members": result, "cached_at": int(time.time())}
```

- [ ] **Step 8: Run all new detail tests to verify they pass**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && python -m pytest tests/test_routes.py -k "detail" -v`
Expected: All detail tests PASS

- [ ] **Step 9: Update existing `test_members_detail` for new response shape**

The existing test at line 73 expects old response shape. Update it:

```python
@pytest.mark.asyncio
async def test_members_detail(mock_client, mock_store):
    mock_client.fetch_yata_members = AsyncMock(return_value=None)
    with patch("app.main.torn_client", mock_client), patch("app.main.key_store", mock_store):
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/members/detail", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["yata_down"] is True
    assert "123" in data["members"]
    assert data["members"]["123"]["source"] == "torn_api"
    assert data["members"]["123"]["energy"] == 500
```

Note: The existing `mock_client` fixture creates `fetch_members` returning a member with `position="Team 1"` and `id=123`. Since position is "Team 1" (self-only), and the requesting player is 123, they see only themselves. Need to also add `fetch_yata_members` mock to existing `mock_client` fixture.

Update the `mock_client` fixture to include `fetch_yata_members`:

```python
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
    client.fetch_chain = AsyncMock(return_value={"id": 0, "current": 0, "max": 10, "timeout": 0, "modifier": 1, "cooldown": 0, "start": 0, "end": 0})
    client.fetch_yata_members = AsyncMock(return_value=None)
    return client
```

- [ ] **Step 10: Run all route tests**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && python -m pytest tests/test_routes.py -v`
Expected: All tests PASS

- [ ] **Step 11: Run full test suite**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && python -m pytest -v`
Expected: All tests PASS

- [ ] **Step 12: Commit**

```bash
git add app/main.py tests/test_routes.py
git commit -m "feat: YATA + position-based access control for members detail endpoint"
```

---

### Task 3: Update frontend for new response format

**Files:**
- Modify: `static/app.js:4,32,68-77,118-202,206-215,312-331`
- Modify: `static/index.html:64-65` (add YATA warning banner slot)
- Modify: `static/style.css` (source indicators + warning banner)

- [ ] **Step 1: Add YATA warning banner HTML**

In `static/index.html`, add after the summary div (after line 65):

```html
<div id="yata-warning" class="yata-warning" style="display:none">
    YATA is currently unavailable — showing data only for registered members
</div>
```

- [ ] **Step 2: Add CSS for source indicators and YATA warning**

In `static/style.css`, add after the `.energy-unknown` rule (after line 104):

```css
.energy-source { font-size: 0.6rem; color: var(--text-dim); margin-left: 0.2rem; }
.yata-warning { padding: 0.5rem 0.75rem; background: var(--yellow-bg); border: 1px solid var(--yellow-border); color: var(--yellow); border-radius: 6px; font-size: 0.75rem; margin-bottom: 0.5rem; }
```

- [ ] **Step 3: Update `renderOurTeam()` in app.js**

Replace the `renderOurTeam` function (lines 118-203) with:

```javascript
function renderOurTeam(members, detailResponse) {
    const dm = detailResponse?.members || {};
    const yataDown = detailResponse?.yata_down || false;

    // Show/hide YATA warning
    const yataWarn = document.getElementById('yata-warning');
    if (yataWarn) yataWarn.style.display = yataDown ? 'block' : 'none';

    const ord = {green:0,yellow:1,gray:2,red:3};
    let sorted;
    if (ourSort.col) {
        sorted = [...members].sort((a, b) => {
            const va = getOurSortValue(a, dm, ourSort.col);
            const vb = getOurSortValue(b, dm, ourSort.col);
            const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
            return ourSort.asc ? cmp : -cmp;
        });
    } else {
        sorted = [...members].sort((a,b) => {
            const ra = ord[getReadiness(a,dm[a.id])]??2, rb = ord[getReadiness(b,dm[b.id])]??2;
            return ra !== rb ? ra-rb : a.name.localeCompare(b.name);
        });
    }

    let on=0, hosp=0, off=0;
    for (const m of members) { if (m.last_action.status==='Online') on++; else if (m.status.state==='Hospital') hosp++; else off++; }
    const inOc = members.filter(m => m.is_in_oc).length;
    const withData = Object.values(dm).filter(d => d.source === 'torn_api' || d.source === 'yata').length;
    document.getElementById('our-summary').innerHTML = `<span class="g">${on}</span> online, <span class="y">${hosp}</span> hospital, <span class="r">${off}</span> offline/away — <span class="g">${withData}</span>/${members.length} with data — ${inOc} in OC`;
    document.getElementById('our-count').textContent = members.length;

    const userName = localStorage.getItem('myKeyName');
    if (userName) document.getElementById('user-info').textContent = userName;

    document.getElementById('our-body').innerHTML = sorted.map(m => {
        const d = dm[m.id];
        const r = getReadiness(m, d);
        let eH, cdH;
        if (d && d.source === 'torn_api') {
            eH = d.energy > d.max_energy
                ? `<span class="energy-stacking">${d.energy}/${d.max_energy}</span>`
                : `<span class="${d.energy < d.max_energy ? 'energy-low' : ''}">${d.energy}/${d.max_energy}</span>`;
            cdH = d.drug_cd > 0
                ? `<span class="cd-active">${fmtCD(d.drug_cd)}</span>`
                : `<span class="cd-clear">Ready</span>`;
        } else if (d && d.source === 'yata') {
            eH = `<span>${d.energy}E</span><span class="energy-source">yata</span>`;
            cdH = d.drug_cd > 0
                ? `<span class="cd-active">${fmtCD(d.drug_cd)}</span>`
                : `<span class="cd-clear">Ready</span>`;
        } else if (d && d.source === 'hidden') {
            eH = '<span class="energy-unknown">Hidden</span>';
            cdH = '<span class="energy-unknown">Hidden</span>';
        } else if (d && d.source === 'not_on_yata') {
            eH = '<span class="energy-unknown">No data</span>';
            cdH = '<span class="energy-unknown">\u2014</span>';
        } else {
            eH = '<span class="energy-unknown">\u2014</span>';
            cdH = '<span class="energy-unknown">\u2014</span>';
        }

        let stateText;
        if (m.status.state === 'Hospital') {
            const reason = m.status.details || 'hospitalized';
            const shortReason = reason.replace('Overdosed on ', 'OD ').replace('Hospitalized by ', 'by ').replace('Mugged by ', 'mugged ').replace('Attacked by ', 'atk ');
            const until = m.status.until;
            const left = until ? fmtCD(until - Math.floor(Date.now()/1000)) : '';
            stateText = `<span class="cd-active">Hosp: ${shortReason}${left ? ' ('+left+')' : ''}</span>`;
        } else if (m.status.state === 'Traveling' || m.status.state === 'Abroad') {
            const desc = m.status.description || '';
            const dest = desc.replace('Traveling to ', '\u2192 ').replace('Returning to Torn from ', '\u2190 ').replace('In ', '\u2022 ');
            stateText = `<span class="cd-active">${dest}</span>`;
        } else if (m.status.state === 'Jail') {
            const until = m.status.until;
            const left = until ? fmtCD(until - Math.floor(Date.now()/1000)) : '';
            stateText = `<span style="color:var(--red)">Jail${left ? ' ('+left+')' : ''}</span>`;
        } else {
            stateText = m.last_action.status;
        }

        let reviveHtml;
        if (m.revive_setting === 'No one') {
            reviveHtml = '<span style="color:var(--green)">OFF</span>';
        } else if (m.revive_setting === 'Friends & faction') {
            reviveHtml = '<span style="color:var(--yellow)" title="Faction members can revive you \u2014 OK but consider OFF during RW">Faction</span>';
        } else if (m.revive_setting === 'Everyone') {
            reviveHtml = '<span style="color:var(--red)" title="ANYONE can revive you \u2014 enemies can revive and attack again!">\u26A0 ALL</span>';
        } else {
            reviveHtml = '<span class="energy-unknown">\u2014</span>';
        }

        const ocHtml = m.is_in_oc ? '<span style="color:var(--green)">\u2713</span>' : '<span class="energy-unknown">\u2014</span>';
        const isNew = m.days_in_faction <= 30;
        const nameHtml = `<a href="https://www.torn.com/profiles.php?XID=${m.id}" target="_blank">${m.name}</a>${isNew ? ' <span class="badge-new">new</span>' : ''}`;

        return `<tr><td><span class="dot dot-${r}"></span></td><td>${nameHtml}</td><td>${m.level}</td><td>${stateText}</td><td>${m.last_action.relative}</td><td>${eH}</td><td>${cdH}</td><td class="hide-mobile">${m.position}</td><td class="hide-mobile">${reviveHtml}</td><td class="hide-mobile">${ocHtml}</td></tr>`;
    }).join('');
}
```

- [ ] **Step 4: Update `getReadiness()` for new data shape**

Replace the `getReadiness` function (lines 68-77):

```javascript
function getReadiness(m, d) {
    const on = m.last_action.status, st = m.status.state;
    if (['Traveling','Abroad','Jail'].includes(st)) return 'red';
    if (on === 'Offline') return 'red';
    if (st === 'Hospital') return 'yellow';
    if (d && (d.source === 'torn_api' || d.source === 'yata') && d.drug_cd > 3600) return 'yellow';
    if (on === 'Online' && st === 'Okay') return 'green';
    if (on === 'Idle') return 'yellow';
    return 'gray';
}
```

- [ ] **Step 5: Update `getOurSortValue()` for new data shape**

Replace the `getOurSortValue` function (lines 206-215):

```javascript
function getOurSortValue(m, dm, col) {
    switch(col) {
        case 'name': return m.name.toLowerCase();
        case 'level': return m.level;
        case 'state': return m.status.state + m.last_action.status;
        case 'energy': return dm[m.id]?.energy ?? -1;
        case 'position': return m.position;
        default: return 0;
    }
}
```

- [ ] **Step 6: Update `refresh()` to pass full detail response**

In the `refresh()` function (line 327), change:

```javascript
renderOurTeam(ov.members, det.members);
```

to:

```javascript
renderOurTeam(ov.members, det);
```

Also update the `sortOur` function (line 232):

```javascript
if (overviewData && detailData) renderOurTeam(overviewData.members, detailData);
```

- [ ] **Step 7: Verify the app runs without errors**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && python -m uvicorn app.main:app --port 8001 &`

Open browser, check console for JS errors, verify the Our Team tab renders.

Kill the server after verification.

- [ ] **Step 8: Run full test suite**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && python -m pytest -v`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add static/app.js static/index.html static/style.css
git commit -m "feat: frontend YATA energy/drug CD rendering with source indicators"
```

---

### Task 4: Final integration test and cleanup

**Files:**
- Review: all modified files

- [ ] **Step 1: Run the full test suite**

Run: `cd /Users/pawelorzech/Programowanie/tm-war-room && python -m pytest -v`
Expected: All tests PASS

- [ ] **Step 2: Manual smoke test**

Start server: `cd /Users/pawelorzech/Programowanie/tm-war-room && python -m uvicorn app.main:app --port 8001`

Check:
1. Login still works
2. Our Team tab shows members
3. Energy column shows appropriate source-based rendering
4. No JS console errors
5. Sorting still works
6. Enemy tab still works

- [ ] **Step 3: Commit any final fixes if needed**

```bash
git add -A
git commit -m "fix: integration cleanup for YATA energy feature"
```
