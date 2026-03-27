# YATA Energy & Drug CD Integration

## Overview

Replace per-member Torn API energy/drug CD fetching with a hybrid approach: YATA API as primary source for all faction members, with registered API keys providing real-time overrides for individual members. Position-based access control determines who sees what.

## Data Sources

### YATA API (primary, all members)
- **Endpoint:** `GET https://yata.yt/api/v1/faction/members/?key=<torn_api_key>`
- **Auth:** Any valid Torn API key from a faction member
- **Cache:** 1 hour on YATA's side
- **Timeout:** 8 seconds
- **Key fields:** `energy`, `energy_share`, `drug_cd`, `refill`
- **Sharing flags:** `energy_share` (-1 = opted out, 0 = not on YATA, 1 = sharing)

### Torn API v1 (override, registered members only)
- **Endpoint:** `GET https://api.torn.com/v1/user?selections=bars,cooldowns&key=<member_key>`
- **Auth:** Individual member's registered API key
- **Cache:** 60 seconds (existing)
- **Provides:** Real-time energy (current + max), drug cooldown, refill status

### Merge Strategy
Per-key Torn API data wins where available (fresher). YATA fills the rest. If a member's registered key fails, fall back to YATA data for that member.

## Position-Based Access Control

User's position is determined from the Torn API v2 members list (already cached by `/api/overview`).

### Full access (sees all members' energy + drug CD)
- Leader, Co-leader, Council, API, Leadership

### Self-only (sees only own energy + drug CD)
- Team 1, Team 2, Team 3, Team 4, Member, Contact

### No access (no energy/drug CD shown)
- Unknown or unrecognized position

Filtering happens server-side. Frontend receives only what the user is allowed to see.

## Backend Changes

### `torn_client.py` — new method

`fetch_yata_members(api_key: str) -> dict | None`
- Calls YATA faction members endpoint
- Timeout: 8 seconds
- Cache key: `"yata_members"`, TTL: 3600 seconds
- On error/timeout: returns `None` (non-fatal, triggers degraded mode)

### `main.py` — modified `/api/members/detail`

New logic:
1. Get requesting user's `position` from cached members data
2. Determine access level from position sets
3. Fetch YATA data (single call, using faction key or fallback to any registered key)
4. Fetch per-key Torn API data for registered members (existing logic, in parallel)
5. Merge per member:
   - Has registered key with valid response → per-key data, `source: "torn_api"`
   - YATA `energy_share == 1` → YATA data, `source: "yata"`
   - YATA `energy_share == -1` → `source: "hidden"`
   - YATA `energy_share == 0` or absent from YATA → `source: "not_on_yata"`
6. Filter by access level: full → all members; self-only → requesting player only; none → empty

### `models.py` — response shape per member

Top-level response:
```python
{
    "yata_down": False,       # true if YATA was unreachable (global flag)
    "members": {
        "<player_id>": {
            "energy": 150,          # current energy (0 if hidden/unavailable)
            "max_energy": 150,      # max energy (per-key only, None from YATA)
            "drug_cd": 14400,       # drug cooldown in seconds
            "refill": False,        # refill available
            "source": "torn_api"    # "torn_api" | "yata" | "hidden" | "not_on_yata"
        }
    }
}
```

### YATA key selection
1. Use faction key (`TORN_API_KEY` env var)
2. If that fails, try any registered member's key
3. YATA accepts any valid faction member key

## Frontend Changes

### `app.js` — `renderOurTeam()` energy/drug CD rendering

Based on `source` field:
- `"torn_api"` — full energy bar (current/max), color-coded as now, small "live" indicator
- `"yata"` — energy value only (no max from YATA), subtle staleness hint
- `"hidden"` — gray "Hidden" text
- `"not_on_yata"` — gray "No data" text

Drug CD column follows same pattern: countdown for torn_api/yata, status text for hidden/not_on_yata.

### YATA down handling
- If `yata_down: true` in response → dismissible warning banner: "YATA is currently unavailable — showing data only for registered members"
- Registered-key members still show real-time data
- Others show "Unavailable" instead of "Not on YATA"

### `style.css`
- Source indicator styling (subtle, small text)
- YATA warning banner styling

### No changes to
- Login flow, tabs structure, sorting logic
- Enemy tab, war dashboard, chain display
- Position column display

## Error Handling

### YATA failures
- Timeout (8s) / 502 / 5xx → `yata_down: true`, degrade to per-key only
- 429 rate limit → same treatment, log warning
- 400 (bad key) → log error, try next registered key

### Position edge cases
- User not in members list → return empty, show error
- Unrecognized position string → no access (safe default)
- Position matching is case-sensitive (Torn API strings)

### Data merge edge cases
- Member has registered key AND is on YATA → per-key wins
- Member's key invalid/expired → fall back to YATA for that member
- YATA returns member not in Torn API members → ignore (stale)

## Cache Strategy

| Source | Cache TTL | Key |
|--------|-----------|-----|
| YATA members | 3600s (1h) | `"yata_members"` |
| Per-key bars/cooldowns | 60s | existing |
| Members list (positions) | 60s | existing |

## Files Modified

1. `app/torn_client.py` — add `fetch_yata_members()` method
2. `app/main.py` — modify `/api/members/detail` with hybrid fetch + position filtering
3. `app/models.py` — add source field to member detail response
4. `static/app.js` — update energy/drug CD rendering + YATA down banner
5. `static/style.css` — source indicators + warning banner styling
6. `tests/` — new tests for YATA fetching, position filtering, merge logic
