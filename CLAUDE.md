# TM Hub

Torn.com faction toolkit for The Masters [TM]. Monorepo: `api/` (FastAPI) + `frontend/` (Next.js 15 + React 19 + Tailwind v4).

## Deploy

- Production: `hub.tri.ovh` (Coolify, Docker, Contabo server)
- Coolify UUID: `jut6hmgjyhv2bf8qpbahf92e`
- Redirects: `rw.tri.ovh` → `/war`, `train.tri.ovh` → `/training`

## Workflow

After each commit:
1. Run `/simplify` to review changed code for quality and efficiency
2. Fix any issues found
3. Push to master → auto-deploys via GitHub Actions + Coolify

## Stack

- Backend: Python 3.12, FastAPI, SQLite, httpx
- Frontend: Next.js 15 (static export), React 19, TypeScript, Tailwind CSS v4, Chart.js
- Auth: Torn API key → X-Player-Id header
- Roles: superadmin (2362436) > admin > member

## Key paths

- `api/main.py` — FastAPI routes + SPA serving
- `api/config.py` — env vars, SUPERADMIN_ID
- `api/db.py` — SQLite (keys, admin_roles, announcements)
- `frontend/src/app/` — Next.js pages (war, training, inbox, admin)
- `frontend/src/components/` — React components by domain
- `frontend/src/hooks/` — React hooks (useAuth, useWarData, useAnnouncements, etc.)
- `tests/` — pytest for backend (79 tests)

## Testing

```bash
uv run pytest tests/ -v          # backend
cd frontend && npm run build     # frontend (static export = build test)
```
