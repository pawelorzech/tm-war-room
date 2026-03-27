# TM War Room

Real-time Ranked War prep dashboard for **The Masters** faction in Torn.com.

## What it does

- Shows all 70 faction members with live status (online/offline, hospital, jail, traveling)
- Displays current RW info (opponent, scores, time)
- Members can opt-in with their API key to show energy stacking + drug cooldowns
- Auto-refreshes every 60 seconds
- Color-coded readiness: green (ready), yellow (warning), red (problem)

## Stack

- **Backend:** Python 3.12, FastAPI, SQLite, httpx
- **Frontend:** Vanilla HTML/CSS/JS
- **Deploy:** Docker on Coolify at `rw.tri.ovh`

## Dev

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
TORN_API_KEY=your_key uvicorn app.main:app --reload --port 8080
```

## Test

```bash
pytest -v
```

## Deploy

Deployed via Coolify (admin.orzech.me) as Docker Compose service.
DNS: `rw.tri.ovh` → Coolify server via BunnyCDN.
