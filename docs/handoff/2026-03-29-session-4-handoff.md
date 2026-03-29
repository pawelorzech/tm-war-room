# TM Hub Session 4 Handoff — 2026-03-29

## Session stats
- **19 commits**, 228 backend tests (up from 213), 32 frontend routes, 17 DB migrations
- Zero console errors in production after hotfix
- One production bug caught and fixed during sanity check (Torn API returns company specials as dict not array)

## What was built this session

### Feature 1: Awards Circulation Chart
- `CirculationChart` component (`frontend/src/components/awards/CirculationChart.tsx`) — Chart.js line chart matching StockPriceChart style
- Period selector: 7d / 30d / 90d / 1Y
- Wired into `/awards/detail` page below existing stats grid
- Uses existing backend API `GET /api/awards/circulation/{kind}/{award_id}?days=N`
- Shows "tracking started recently" message when < 2 data points
- Data collects daily at 05:00 UTC via existing `collect_circulation` scheduler job

### Feature 2: Company Specials Tracker
- **Backend:** `fetch_company_catalog()` in `torn_client.py` — calls `/torn?selections=companies`, cached 1hr
- **Backend:** `api/routers/company.py` with 2 endpoints:
  - `GET /api/company/catalog` — all 40 company types with specials/positions/stock (normalized from Torn API dict→array)
  - `GET /api/company/faction` — faction members grouped by their companies (from stored API keys)
- **Frontend:** `/company` page with:
  - "Our Faction's Companies" — cards grouped by company, members with positions, specials badges
  - "Company Directory" — searchable/filterable grid of all 40 types, filter by energy/items/passive, sort by name/cost, expandable details
  - PageExplainer with JP mechanics, 72hr cooldown, star ratings, wiki links
  - Color coding: green=energy specials, blue=items, purple=passive
- **Sidebar:** "Companies" added to TOOLS section with 🏢 icon
- **Hotfix:** Torn API returns `specials`/`positions`/`stock` as dicts (keyed by ID) not arrays — backend normalizes with `isinstance()` check, frontend also normalizes on load

### Feature 3: Push Notifications with Graceful Degradation
- **Migration:** `017_push_subscriptions.sql` — player_id, endpoint (UNIQUE), p256dh, auth, preferences JSON, timestamps
- **Repository:** `api/db/repos/push_repository.py` — save (upsert), get_by_player, get_by_preference, get_by_player_and_preference, update_preferences, delete_by_endpoint
- **Service:** `api/push_service.py` — `PushService` with:
  - `dispatch(event_type, title, body, url)` → sends to ALL matching subscribers + creates in-app notification
  - `dispatch_to_player(player_id, ...)` → sends to specific player's subscriptions
  - Auto-removes 410 (expired) subscriptions
  - Gracefully disabled when no VAPID keys configured (in-app notifications only)
- **Router:** `api/routers/push.py` — `GET /vapid-key`, `POST /subscribe`, `PUT /preferences`, `DELETE /unsubscribe` (with ownership check)
- **Config:** VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_MAILTO env vars (all optional)
- **Triggers in `refresh_data.py`:**
  - Loot level 4+: tracks `_prev_npc_levels` dict, dispatches when NPC crosses from <4 to >=4
  - War start: dispatches on war state change (existing war detection logic)
  - Stakeout change: dispatches to `added_by` player when monitored target changes status
- **Frontend:**
  - Service Worker (`public/sw.js`) — push event handler + notificationclick (focus/open window)
  - `usePushNotifications` hook — permission management, SW registration, subscription lifecycle, preference toggles
  - Push settings UI on `/notifications` page — Enabled/Disabled/Blocked status badge, per-event toggles (loot, war, stakeout), test button, disable button, blocked-permission guidance
- **Dependency:** `pywebpush>=2.0.0` added

### Review fixes applied during session
- `company_id` was missing from `fetch_training_data` return dict → added
- `classifySpecial()` had JS operator precedence bug (`||` before `&&`) → rewrote to use effect text matching only
- Unsubscribe endpoint had no ownership check → added `get_by_player` + verify before delete
- `oc_ready` toggle was in UI but no backend trigger exists → removed from UI
- `icon-192.png` referenced but didn't exist → changed to `favicon.ico`
- Torn API company specials returned as dict not array → normalized on both backend and frontend

## Architecture (updated)

### Backend
- **FastAPI** with 18 routers (added: company, push), module-level state injection
- **SQLite** (WAL mode), 17 migrations, `BaseRepository` pattern
- **APScheduler 4.x** — 4 jobs: stats (4:00 UTC), circulation (5:00), spies (30min), data refresh (30s)
- **PushService** — Web Push via `pywebpush`, falls back to in-app notifications
- **External APIs**: Torn v1/v2, TornStats (spy), YATA (travel)
- **httpx** AsyncClient with `User-Agent: TM-Hub/1.0` header

### Frontend
- **Next.js 15** static export, React 19, Tailwind v4, **32 routes**
- **Chart.js** for stock prices + award circulation trends
- **Service Worker** for push notifications
- **Reusable components**: `useSort`, `SortableHeader`, `ExportButton`, `PageExplainer`, `ErrorBoundary`, `usePushNotifications`

### Key new files
- `api/routers/company.py` — company catalog + faction endpoints
- `api/routers/push.py` — push subscription management
- `api/push_service.py` — Web Push dispatch + in-app fallback
- `api/db/repos/push_repository.py` — push subscription CRUD
- `api/db/migrations/017_push_subscriptions.sql` — push subscriptions table
- `frontend/src/components/awards/CirculationChart.tsx` — Chart.js line chart
- `frontend/src/hooks/usePushNotifications.ts` — push notification lifecycle hook
- `frontend/public/sw.js` — Service Worker for push display
- `frontend/src/app/company/page.tsx` — company specials page

## Remaining backlog

### Priority 1: Activate push notifications in production
1. **Generate VAPID keys** — `npx web-push generate-vapid-keys` and set `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_MAILTO` env vars in Coolify. Without these, push is gracefully disabled (in-app only).
2. **Add OC ready trigger** — wire `dispatch("oc_ready", ...)` in refresh_data.py when OC has all slots filled. Re-add toggle to notifications UI.
3. **Add favicon/icon** — create proper 192px icon for push notification display.

### Priority 2: Polish & improvements
4. **Loading states audit** — verify every page has loading skeleton, error state, empty state. No blank screens.
5. **Caching improvements** — SQLite-backed cache instead of in-memory dict (resets on deploy).
6. **Company employees page** — company details, employee stats (requires per-company API calls).
7. **Push notification test endpoint** — server-side `POST /api/push/test` that sends a real webpush to verify end-to-end (current "Send Test" button only fires a local notification).

### Priority 3: Nice to have
8. **Faction vs faction comparison** — compare two factions
9. **More educational content** — continuously improve PageExplainer bullets
10. **Circulation chart trend analysis** — show growth rate, predict when award will reach X circulation

## Deploy
```bash
# Commit (SSH signing disabled)
git -c commit.gpgsign=false commit -m "message"

# Push (SSH via 1Password doesn't work)
GIT_SSH_COMMAND="ssh -o IdentityFile=/dev/null -o IdentitiesOnly=yes" \
  git push https://pawelorzech:$(gh auth token)@github.com/pawelorzech/tm-war-room.git master
```

Push master → GitHub Actions (tests + build) → Coolify auto-deploy.
Coolify API token: `~/.config/coolify/credentials.json`, app UUID: `jut6hmgjyhv2bf8qpbahf92e`

## Mandatory post-deploy
After EVERY deploy: sanity check hub.tri.ovh with Playwright. Check /dashboard, /team, /chain, /awards, /company, /loot, /stocks, /bounties, /notifications, /analytics. Check console for errors. See CLAUDE.md.

## Env vars
| Variable | Required | Default |
|----------|----------|---------|
| `TORN_API_KEY` | yes | — |
| `ENCRYPTION_KEY` | yes (ephemeral) | — |
| `TORNSTATS_API_KEY` | no | — |
| `FACTION_ID` | no | 11559 |
| `CACHE_TTL` | no | 60 |
| `JWT_SECRET` | no (ephemeral) | — |
| `VAPID_PRIVATE_KEY` | no (push disabled) | — |
| `VAPID_PUBLIC_KEY` | no (push disabled) | — |
| `VAPID_MAILTO` | no | `mailto:admin@tri.ovh` |
