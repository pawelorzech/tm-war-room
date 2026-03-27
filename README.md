# TM War Room

Real-time Ranked War command center for **The Masters** faction in [Torn.com](https://www.torn.com).

Live at **[rw.tri.ovh](https://rw.tri.ovh)** (faction members only).

## Features

### Our Team
- Live member status — online/offline, hospital (with reason + timer), traveling (with destination), jail
- Energy stacking & drug cooldown tracking (members register their API key)
- Revive settings — warns when members have revives disabled
- OC participation status
- New member badges (< 30 days)
- Sortable columns

### Enemy Targets
- Auto-detects enemy faction from active Ranked War (or manual faction ID input)
- Threat scoring — relative to YOUR stats, powered by TornStats spy data
- One-click Attack buttons + Torn profile/stats links
- Hospital timers, travel status
- Sortable by threat level, name, level, xanax, attacks won

### War Dashboard
- Live score tracker with progress bars
- Chain status during active RW
- Clickable faction links to Torn

### Security
- Faction-only access — must be a member of The Masters to log in
- API keys stored encrypted (Fernet) in SQLite
- All data endpoints require authentication
- Keys validated against Torn API on registration

## Stack

- **Backend:** Python 3.12, FastAPI, httpx, SQLite, cryptography
- **Frontend:** Vanilla HTML/CSS/JS — no build step, no framework
- **Integrations:** Torn API v1/v2, TornStats API
- **Deploy:** Docker on Coolify
- **DNS:** BunnyCDN

## Dev

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Required env vars
export TORN_API_KEY=your_torn_api_key
export TORNSTATS_API_KEY=your_tornstats_key  # optional, enables threat scoring

uvicorn app.main:app --reload --port 8080
```

## Test

```bash
pytest -v
```

29 tests covering models, API client, threat scoring, routes, and auth.

## Deploy

Deployed via [Coolify](https://coolify.io) as a Docker application from this repo.

```
rw.tri.ovh → BunnyCDN DNS → Coolify (Traefik + Let's Encrypt) → Docker container
```

### Env vars on Coolify

| Variable | Required | Description |
|----------|----------|-------------|
| `TORN_API_KEY` | yes | Any faction member's Torn API key |
| `TORNSTATS_API_KEY` | no | TornStats key for enemy threat data |
| `ENCRYPTION_KEY` | yes | Fernet key for encrypting stored API keys |
| `FACTION_ID` | no | Default: 11559 (The Masters) |
| `CACHE_TTL` | no | Default: 60 seconds |

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | no | Dashboard HTML |
| GET | `/api/overview` | yes | Faction members + war status + chain |
| GET | `/api/members/detail` | yes | Energy/cooldowns for opted-in members |
| GET | `/api/enemy` | yes | Enemy faction + threat scores |
| GET | `/api/keys` | yes | List registered keys |
| POST | `/api/keys` | no | Register API key (validates faction membership) |
| DELETE | `/api/keys/{id}` | no | Remove a key |

Auth = `X-Player-Id` header with a registered player ID.

## License

Private tool for The Masters faction. Not intended for general use.
