# Company Specials Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New `/company` page showing faction members' companies and a full directory of all 40 company types with their specials, helping players choose optimal companies and coordinate specials usage.

**Architecture:** New backend router (`api/routers/company.py`) with two endpoints: catalog (all company types from Torn API) and faction (members' job data from stored keys). New `fetch_company_catalog()` method in `torn_client.py`. New frontend page with two sections: faction companies (top) and searchable directory (bottom). No new DB migration — all data is API-fetched and cached in-memory.

**Tech Stack:** FastAPI, httpx, React 19, Next.js 15, Tailwind v4

---

### Task 1: Add `fetch_company_catalog()` to TornClient

**Files:**
- Modify: `api/torn_client.py`
- Test: `tests/test_torn_client.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_torn_client.py`:

```python
@pytest.mark.asyncio
async def test_fetch_company_catalog(mock_http):
    mock_http.get.return_value = _resp({
        "companies": {
            "1": {
                "name": "Hair Salon",
                "cost": 500000,
                "default_employees": 3,
                "positions": [{"name": "Stylist", "man_required": 0, "int_required": 0, "end_required": 0}],
                "stock": [{"name": "Shampoo", "cost": 10, "rrp": 25}],
                "specials": [{"name": "Perm", "effect": "+2 happiness", "cost": 1, "rating_required": 1}],
            }
        }
    })
    from api.torn_client import TornClient
    tc = TornClient(api_key="test_key", cache_ttl=5)
    tc._http = mock_http
    result = await tc.fetch_company_catalog()
    assert "1" in result
    assert result["1"]["name"] == "Hair Salon"
    assert len(result["1"]["specials"]) == 1
    await tc.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_torn_client.py::test_fetch_company_catalog -v`
Expected: FAIL — `TornClient` has no `fetch_company_catalog` method.

- [ ] **Step 3: Implement `fetch_company_catalog` in `api/torn_client.py`**

Add this method to the `TornClient` class (after `fetch_honor_catalog`):

```python
    async def fetch_company_catalog(self) -> dict:
        """Fetch all company type definitions with specials, positions, stock."""
        cached = self._get_cached("company_catalog", ttl=3600)
        if cached is not None:
            return cached
        t0 = time.time()
        try:
            resp = await self._http.get(
                f"{V1_BASE}/torn/",
                params={"selections": "companies", "key": self._api_key},
            )
            resp.raise_for_status()
            data = await _json(resp)
            companies = data.get("companies", {})
            self._set_cached("company_catalog", companies)
            self._log_integration("torn", "torn/companies", True, (time.time() - t0) * 1000)
            return companies
        except Exception as e:
            self._log_integration("torn", "torn/companies", False, (time.time() - t0) * 1000, str(e))
            raise
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_torn_client.py::test_fetch_company_catalog -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/torn_client.py tests/test_torn_client.py
git -c commit.gpgsign=false commit -m "feat: fetch_company_catalog method in TornClient"
```

---

### Task 2: Create company router with catalog endpoint

**Files:**
- Create: `api/routers/company.py`
- Test: `tests/test_routes.py` (add company test)

- [ ] **Step 1: Write the failing test**

Add to `tests/test_routes.py`:

```python
@pytest.mark.asyncio
async def test_company_catalog(mock_client, mock_store):
    mock_client.fetch_company_catalog = AsyncMock(return_value={
        "1": {"name": "Hair Salon", "cost": 500000, "default_employees": 3,
              "positions": [], "stock": [],
              "specials": [{"name": "Perm", "effect": "+2 happy", "cost": 1, "rating_required": 1}]}
    })
    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store):
        import api.routers.company as company_mod
        company_mod.torn_client = mock_client
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/company/catalog", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert "companies" in data
    assert len(data["companies"]) == 1
    assert data["companies"][0]["name"] == "Hair Salon"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_routes.py::test_company_catalog -v`
Expected: FAIL — no module `api.routers.company`.

- [ ] **Step 3: Create `api/routers/company.py`**

```python
from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Header

logger = logging.getLogger("tm-hub.company")

router = APIRouter(prefix="/api/company", tags=["company"])
torn_client = None  # Set by main.py
key_store = None    # Set by main.py


@router.get("/catalog")
async def company_catalog():
    """Get all company types with specials, positions, stock."""
    if not torn_client:
        raise HTTPException(status_code=503, detail="Not initialized")
    raw = await torn_client.fetch_company_catalog()
    companies = []
    for cid, c in sorted(raw.items(), key=lambda x: int(x[0])):
        companies.append({
            "id": int(cid),
            "name": c.get("name", f"Company {cid}"),
            "cost": c.get("cost", 0),
            "default_employees": c.get("default_employees", 0),
            "positions": c.get("positions", []),
            "stock": c.get("stock", []),
            "specials": c.get("specials", []),
        })
    return {"companies": companies, "count": len(companies)}
```

- [ ] **Step 4: Register the router in `api/main.py`**

Add import after the notifications import (line 55):

```python
from api.routers.company import router as company_router
import api.routers.company as company_mod
```

In the lifespan function, after `bounties_mod.spy_service = spy_mod.spy_service` (around line 121), add:

```python
    company_mod.torn_client = torn_client
    company_mod.key_store = key_store
```

After `app.include_router(notifications_router)` (line 161), add:

```python
app.include_router(company_router)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_routes.py::test_company_catalog -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add api/routers/company.py api/main.py tests/test_routes.py
git -c commit.gpgsign=false commit -m "feat: company catalog API endpoint"
```

---

### Task 3: Add faction companies endpoint

**Files:**
- Modify: `api/routers/company.py`
- Test: `tests/test_routes.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_routes.py`:

```python
@pytest.mark.asyncio
async def test_company_faction(mock_client, mock_store):
    mock_store.get_all_keys.return_value = [
        {"player_id": 123, "player_name": "Bombel", "api_key": "key1"},
        {"player_id": 456, "player_name": "Tester", "api_key": "key2"},
    ]
    mock_client.fetch_training_data = AsyncMock(side_effect=[
        {"job": {"company_id": 100, "company_name": "Cool Farm", "company_type": 34, "position": "Farmer"}},
        {"job": {"company_id": 100, "company_name": "Cool Farm", "company_type": 34, "position": "Manager"}},
    ])
    with patch("api.main.torn_client", mock_client), patch("api.main.key_store", mock_store):
        import api.routers.company as company_mod
        company_mod.torn_client = mock_client
        company_mod.key_store = mock_store
        from api.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/company/faction", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert "companies" in data
    assert len(data["companies"]) == 1
    assert data["companies"][0]["company_name"] == "Cool Farm"
    assert len(data["companies"][0]["members"]) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_routes.py::test_company_faction -v`
Expected: FAIL — no `faction` endpoint on company router.

- [ ] **Step 3: Add the faction endpoint to `api/routers/company.py`**

Append to the file:

```python
@router.get("/faction")
async def company_faction(x_player_id: int = Header()):
    """Get faction members grouped by their companies."""
    if not torn_client or not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")

    all_keys = key_store.get_all_keys()
    members_by_company: dict[int, dict] = {}

    for kd in all_keys:
        try:
            training = await torn_client.fetch_training_data(kd["api_key"])
            if not training or "job" not in training:
                continue
            job = training["job"]
            cid = job.get("company_id", 0)
            if not cid:
                continue
            if cid not in members_by_company:
                members_by_company[cid] = {
                    "company_id": cid,
                    "company_name": job.get("company_name", "Unknown"),
                    "company_type": job.get("company_type", 0),
                    "members": [],
                }
            members_by_company[cid]["members"].append({
                "player_id": kd["player_id"],
                "player_name": kd.get("player_name", f"#{kd['player_id']}"),
                "position": job.get("position", "Unknown"),
            })
        except Exception as e:
            logger.warning("Failed to fetch job data for %s: %s", kd["player_id"], e)

    companies = sorted(members_by_company.values(), key=lambda c: len(c["members"]), reverse=True)
    return {"companies": companies, "count": len(companies)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_routes.py::test_company_faction -v`
Expected: PASS

- [ ] **Step 5: Run full backend tests**

Run: `uv run pytest tests/ -v`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/routers/company.py tests/test_routes.py
git -c commit.gpgsign=false commit -m "feat: faction companies API endpoint — members grouped by company"
```

---

### Task 4: Add API client methods and create company page

**Files:**
- Modify: `frontend/src/lib/api-client.ts`
- Create: `frontend/src/app/company/page.tsx`

- [ ] **Step 1: Add API client methods**

In `frontend/src/lib/api-client.ts`, add after the `revives` line (line 94):

```typescript
  companyCatalog: () => apiFetch<{
    companies: {
      id: number; name: string; cost: number; default_employees: number;
      positions: { name: string; man_required: number; int_required: number; end_required: number; special_ability?: string }[];
      stock: { name: string; cost: number; rrp: number }[];
      specials: { name: string; effect: string; cost: number; rating_required: number }[];
    }[];
    count: number;
  }>('/api/company/catalog'),
  companyFaction: () => apiFetch<{
    companies: {
      company_id: number; company_name: string; company_type: number;
      members: { player_id: number; player_name: string; position: string }[];
    }[];
    count: number;
  }>('/api/company/faction'),
```

- [ ] **Step 2: Create the company page**

Create `frontend/src/app/company/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { CardSkeleton } from '@/components/layout/LoadingSkeleton';
import { useSort } from '@/hooks/useSort';

interface Special {
  name: string;
  effect: string;
  cost: number;
  rating_required: number;
}

interface CompanyType {
  id: number;
  name: string;
  cost: number;
  default_employees: number;
  positions: { name: string; special_ability?: string }[];
  stock: { name: string; cost: number; rrp: number }[];
  specials: Special[];
}

interface FactionCompany {
  company_id: number;
  company_name: string;
  company_type: number;
  members: { player_id: number; player_name: string; position: string }[];
}

type SpecialFilter = 'all' | 'energy' | 'items' | 'passive';

function classifySpecial(s: Special): 'energy' | 'items' | 'passive' {
  const e = s.effect.toLowerCase();
  if (e.includes('energy') || e.includes('nerve') || e.includes('happy')) return 'energy';
  if (s.cost > 1 || e.includes('+') && (e.includes('item') || e.includes('drug') || e.includes('weapon') || e.includes('car') || e.includes('bomb') || e.includes('ammo'))) return 'items';
  return 'passive';
}

const FILTER_COLORS: Record<SpecialFilter, string> = {
  all: 'bg-text-secondary/20 text-text-primary',
  energy: 'bg-torn-green/20 text-torn-green',
  items: 'bg-torn-blue/20 text-torn-blue',
  passive: 'bg-purple-500/20 text-purple-400',
};

const SPECIAL_BADGE: Record<string, string> = {
  energy: 'bg-torn-green/15 text-torn-green',
  items: 'bg-torn-blue/15 text-torn-blue',
  passive: 'bg-purple-500/15 text-purple-400',
};

function formatCost(cost: number): string {
  if (cost >= 1e9) return `$${(cost / 1e9).toFixed(1)}B`;
  if (cost >= 1e6) return `$${(cost / 1e6).toFixed(1)}M`;
  if (cost >= 1e3) return `$${(cost / 1e3).toFixed(0)}K`;
  return `$${cost}`;
}

export default function CompanyPage() {
  const [catalog, setCatalog] = useState<CompanyType[]>([]);
  const [factionCompanies, setFactionCompanies] = useState<FactionCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [factionLoading, setFactionLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SpecialFilter>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadCatalog = () => {
    setLoading(true);
    setError(null);
    api.companyCatalog()
      .then(d => setCatalog(d.companies))
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };

  const loadFaction = () => {
    setFactionLoading(true);
    api.companyFaction()
      .then(d => setFactionCompanies(d.companies))
      .catch(() => {})
      .finally(() => setFactionLoading(false));
  };

  useEffect(() => { loadCatalog(); loadFaction(); }, []);

  const filtered = useMemo(() => {
    let result = catalog;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.specials.some(s => s.name.toLowerCase().includes(q) || s.effect.toLowerCase().includes(q))
      );
    }
    if (filter !== 'all') {
      result = result.filter(c => c.specials.some(s => classifySpecial(s) === filter));
    }
    return result;
  }, [catalog, search, filter]);

  const { sorted: sortedCompanies, sortCol, sortDir, toggle: toggleSort } = useSort(filtered, 'name');

  // Map company type ID to catalog entry for faction section
  const catalogById = useMemo(() => {
    const map: Record<number, CompanyType> = {};
    for (const c of catalog) map[c.id] = c;
    return map;
  }, [catalog]);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Company Specials</h1>
            <p className="text-text-secondary text-sm mt-1">Faction company overview and full specials directory.</p>
          </div>
          <RefreshButton onRefresh={() => { loadCatalog(); loadFaction(); }} />
        </div>

        <PageExplainer id="company" title="Companies — What's here?" bullets={[
          "Companies produce specials — bonus items, energy refills, or passive buffs. The specials you can use depend on your company's star rating and your Job Points (JP).",
          "JP are earned daily based on your work effectiveness. You can spend up to 100 JP per day on energy-granting specials. Passive specials are always active once the star requirement is met.",
          "New employees have a 72-hour recruit cooldown before they can use specials. Plan your company switches around this.",
          "Coordinate with faction members — having people spread across different companies gives the faction access to more specials. Check who works where in the faction section above the directory.",
        ]}
        dataSources={["Torn API /torn?selections=companies", "Member job data from stored API keys"]}
        links={[
          ["Torn Wiki: Companies", "https://wiki.torn.com/wiki/Company"],
          ["Torn Wiki: Company Specials", "https://wiki.torn.com/wiki/Company/Special_List"],
        ]}
        />

        {/* Faction Companies */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Our Faction&apos;s Companies</h2>
          {factionLoading ? (
            <CardSkeleton count={2} />
          ) : factionCompanies.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {factionCompanies.map(fc => {
                const catalogEntry = catalogById[fc.company_type];
                return (
                  <div key={fc.company_id} className="bg-bg-card border border-text-secondary/15 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-text-primary text-sm">{fc.company_name}</h3>
                      <span className="text-[10px] text-text-muted">{fc.members.length} member{fc.members.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {fc.members.map(m => (
                        <a key={m.player_id}
                          href={`https://www.torn.com/profiles.php?XID=${m.player_id}`}
                          target="_blank" rel="noopener"
                          className="px-2 py-0.5 text-xs rounded-full bg-bg-elevated text-text-secondary hover:text-torn-green transition-colors">
                          {m.player_name} <span className="text-text-muted">({m.position})</span>
                        </a>
                      ))}
                    </div>
                    {catalogEntry && catalogEntry.specials.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1 border-t border-border-light">
                        {catalogEntry.specials.map(s => (
                          <span key={s.name} className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${SPECIAL_BADGE[classifySpecial(s)]}`}>
                            {s.name} ({s.rating_required}★)
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-4 text-center text-text-muted text-sm">
              No faction company data available. Members need to have registered API keys.
            </div>
          )}
        </div>

        {/* Company Directory */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Company Directory</h2>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search companies or specials..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg bg-bg-elevated border border-text-secondary/20 text-text-primary placeholder-text-muted focus:border-torn-green/50 focus:outline-none w-48"
            />
            <div className="flex gap-1">
              {(['all', 'energy', 'items', 'passive'] as SpecialFilter[]).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-2 py-1 text-[10px] rounded font-medium transition-colors capitalize ${
                    filter === f ? FILTER_COLORS[f] : 'text-text-muted hover:text-text-secondary'
                  }`}>
                  {f}
                </button>
              ))}
            </div>
            <div className="flex gap-1 ml-auto">
              <button onClick={() => toggleSort('name')}
                className={`px-2 py-1 text-[10px] rounded transition-colors ${sortCol === 'name' ? 'bg-torn-green/20 text-torn-green' : 'text-text-muted hover:text-text-secondary'}`}>
                Name {sortCol === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
              </button>
              <button onClick={() => toggleSort('cost')}
                className={`px-2 py-1 text-[10px] rounded transition-colors ${sortCol === 'cost' ? 'bg-torn-green/20 text-torn-green' : 'text-text-muted hover:text-text-secondary'}`}>
                Cost {sortCol === 'cost' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
              </button>
            </div>
          </div>

          {loading ? (
            <CardSkeleton count={6} />
          ) : error ? (
            <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-danger text-sm">{error}</div>
          ) : (
            <div className="grid gap-2">
              {sortedCompanies.map(c => (
                <div key={c.id}
                  className="bg-bg-card border border-text-secondary/15 rounded-xl overflow-hidden transition-colors hover:border-text-secondary/30">
                  <button
                    onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    className="w-full p-3 text-left flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-text-primary">{c.name}</span>
                        <span className="text-[10px] text-text-muted">{formatCost(c.cost)}</span>
                        <span className="text-[10px] text-text-muted">{c.default_employees} emp</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {c.specials.map(s => (
                          <span key={s.name} className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${SPECIAL_BADGE[classifySpecial(s)]}`}>
                            {s.name} ({s.rating_required}★, {s.cost}JP)
                          </span>
                        ))}
                        {c.specials.length === 0 && (
                          <span className="text-[10px] text-text-muted">No specials</span>
                        )}
                      </div>
                    </div>
                    <span className="text-text-muted text-xs shrink-0">{expandedId === c.id ? '▼' : '▶'}</span>
                  </button>

                  {expandedId === c.id && (
                    <div className="px-3 pb-3 space-y-3 border-t border-border-light pt-3">
                      {/* Specials detail */}
                      {c.specials.length > 0 && (
                        <div>
                          <p className="text-[10px] text-text-muted uppercase mb-1">Specials</p>
                          <div className="space-y-1">
                            {c.specials.map(s => (
                              <div key={s.name} className="flex items-center gap-2 text-xs">
                                <span className={`px-1.5 py-0.5 rounded font-medium ${SPECIAL_BADGE[classifySpecial(s)]}`}>
                                  {s.rating_required}★
                                </span>
                                <span className="font-medium text-text-primary">{s.name}</span>
                                <span className="text-text-muted">— {s.effect}</span>
                                <span className="text-text-muted ml-auto">{s.cost} JP</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Positions */}
                      {c.positions.length > 0 && (
                        <div>
                          <p className="text-[10px] text-text-muted uppercase mb-1">Positions</p>
                          <div className="flex flex-wrap gap-1">
                            {c.positions.map(p => (
                              <span key={p.name} className="px-2 py-0.5 text-[10px] rounded bg-bg-elevated text-text-secondary">
                                {p.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Stock */}
                      {c.stock.length > 0 && (
                        <div>
                          <p className="text-[10px] text-text-muted uppercase mb-1">Products</p>
                          <div className="flex flex-wrap gap-1">
                            {c.stock.map(s => (
                              <span key={s.name} className="px-2 py-0.5 text-[10px] rounded bg-bg-elevated text-text-secondary">
                                {s.name} (${s.cost} → ${s.rrp})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {sortedCompanies.length === 0 && (
                <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-muted text-sm">
                  No companies match your search.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api-client.ts frontend/src/app/company/page.tsx
git -c commit.gpgsign=false commit -m "feat: company specials page — faction overview + searchable directory"
```

---

### Task 5: Add Companies to sidebar

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add Companies nav item to TOOLS section**

In `frontend/src/components/layout/Sidebar.tsx`, in the TOOLS section items array, after the Travel entry (`{ label: "Travel", href: "/travel", icon: "✈️" }`), add:

```typescript
      { label: "Companies", href: "/company", icon: "🏢" },
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx
git -c commit.gpgsign=false commit -m "feat: add Companies to sidebar TOOLS section"
```

---

### Task 6: Run full test suite

**Files:** None (verification only)

- [ ] **Step 1: Run all backend tests**

Run: `uv run pytest tests/ -v`
Expected: All tests pass (213+ existing + 2 new company tests).

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Static export succeeds.

- [ ] **Step 3: Commit if any fixes were needed, otherwise done**
