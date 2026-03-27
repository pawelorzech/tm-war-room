# TM War Room — Product Requirements Document

## Overview

**TM War Room** is a real-time Ranked War (RW) preparation dashboard for **The Masters** faction (ID: 11559) in Torn.com. It shows faction leadership who's ready for war and who needs help — at a glance.

## Problem

Before an RW, faction leaders have no unified view of member readiness. They check Discord, manually ask members, or hope everyone stacks energy. There's no way to see who's online, who's stacking, who has drug cooldowns, or who's traveling — all in one place.

## Solution

A self-hosted web dashboard that pulls live data from the Torn API and displays a color-coded member readiness table.

## Domain & Hosting

- **URL:** https://rw.tri.ovh
- **Hosting:** Coolify (admin.orzech.me), Docker container
- **DNS:** BunnyCDN (tri.ovh zone)

## API Access

### Tier 1 — Faction Overview (no member opt-in needed)
Uses bombel's API key (or any faction member's key) to call:
- `GET /v2/faction/members` → member list, online status, hospital/jail/traveling, last action, is_on_wall, is_revivable
- `GET /v2/faction/?selections=wars` → active RW status, scores, opponent

### Tier 2 — Individual Tracking (member opt-in)
Members submit their personal API key. Server polls:
- `GET /user/?selections=bars,cooldowns` → energy (current/max), drug cooldown, booster cooldown

## Features (MVP)

### 1. War Status Header
- Current RW: opponent name, scores, start time, duration
- War state: "Upcoming" / "Active" / "No war"

### 2. Member Readiness Table
Columns:
- **Name** (linked to Torn profile)
- **Level**
- **Status** — Online / Offline / Idle + state (Okay / Hospital / Jail / Traveling / Abroad)
- **Last Action** — relative time ("5 min ago")
- **Energy** — current/max (only if opted in via Tier 2)
- **Drug CD** — cooldown remaining (only if opted in)
- **Position** — Team assignment
- **On Wall** — whether being attacked (boolean)

Color coding:
- 🟢 **Ready** — Online + Okay + (if opted in: energy stacked or drug CD < 1h)
- 🟡 **Warning** — Online but in hospital, or drug CD active, or energy low
- 🔴 **Problem** — Offline + no recent activity, or Traveling/Abroad, or Jail
- ⚪ **Unknown** — No opt-in data, can't determine energy state

### 3. Key Registration
- Simple form: paste API key → server validates → stores
- Member can delete their key anytime
- Keys stored encrypted (Fernet) in SQLite

### 4. Auto-Refresh
- Dashboard auto-refreshes every 60 seconds
- Faction data cached server-side (60s TTL)
- Individual member data polled every 60s for opted-in members

## Non-Goals (Future)
- Discord bot / webhook notifications
- Historical war performance tracking
- Stacking calculator ("how many cans do I need")
- OD insurance tracking
- Full authentication system (MVP uses shared access)

## Tech Stack
- **Backend:** Python 3.12, FastAPI, SQLite, httpx
- **Frontend:** Vanilla HTML + CSS + JS (no framework — keep it simple)
- **Deploy:** Docker, Coolify, BunnyCDN DNS
- **Security:** Fernet encryption for stored API keys, HTTPS via Coolify/Traefik

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Serve dashboard HTML |
| GET | `/api/overview` | Faction members + war status (cached) |
| GET | `/api/members/detail` | Opted-in members' bars/cooldowns |
| POST | `/api/keys` | Register member API key |
| DELETE | `/api/keys/{player_id}` | Remove member API key |

## Data Refresh Strategy
- `/api/overview` → calls Torn v2 API, caches 60s server-side
- `/api/members/detail` → polls each registered key, caches 60s
- Frontend polls `/api/overview` + `/api/members/detail` every 60s via JS

## Torn API Reference

### Faction Members (v2)
```
GET https://api.torn.com/v2/faction/members?key={KEY}
```
Response per member:
```json
{
  "id": 467331,
  "name": "Maukun",
  "level": 92,
  "days_in_faction": 1298,
  "last_action": {"status": "Offline", "timestamp": 1774592942, "relative": "2 hours ago"},
  "status": {"description": "Okay", "details": null, "state": "Okay", "color": "green", "until": null},
  "revive_setting": "Unknown",
  "position": "Team 3",
  "is_revivable": false,
  "is_on_wall": false,
  "is_in_oc": true,
  "has_early_discharge": false
}
```

### Faction Wars (v2)
```
GET https://api.torn.com/v2/faction/?selections=wars&key={KEY}
```
Response:
```json
{
  "wars": {
    "ranked": {
      "war_id": 39363,
      "start": 1774630800,
      "end": null,
      "target": 11800,
      "winner": null,
      "factions": [
        {"id": 9420, "name": "The Pusheen Army", "score": 0, "chain": 0},
        {"id": 11559, "name": "The Masters", "score": 0, "chain": 0}
      ]
    }
  }
}
```

### User Bars + Cooldowns (v1)
```
GET https://api.torn.com/user/?selections=bars,cooldowns&key={MEMBER_KEY}
```
Response:
```json
{
  "energy": {"current": 900, "maximum": 150, "increment": 5, "interval": 600, "ticktime": 50, "fulltime": 0},
  "nerve": {"current": 11, "maximum": 125},
  "happy": {"current": 4525, "maximum": 4525},
  "cooldowns": {"drug": 17919, "medical": 0, "booster": 89600}
}
```
Note: `energy.current > energy.maximum` means member is **stacking** energy (using Xanax/FHC/cans beyond natural cap).
