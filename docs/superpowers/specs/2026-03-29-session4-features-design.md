# Session 4 Features Design — 2026-03-29

Three independent features: awards circulation chart, company specials tracker, push notifications. Ship in this order.

---

## Feature 1: Awards Circulation Chart

### Goal
Show how an award's circulation (player count) changes over time on the `/awards/detail` page.

### Scope
Frontend-only. Backend API and data collection already exist.

### Frontend
- New `CirculationChart` component in `frontend/src/components/awards/CirculationChart.tsx`
- Uses `react-chartjs-2` Line chart with same setup as `StockPriceChart` (dynamic import, SSR disabled)
- Placed below the existing stats grid on `/awards/detail`
- Period selector buttons: 7d / 30d / 90d / All
- X-axis: dates, Y-axis: circulation count
- Torn green line (#3fb950) with fill, matching existing chart style
- If < 2 data points: show info message "Circulation tracking started recently. Check back in a few days."

### API Client
Add `api.awardCirculation(kind: string, id: number, days?: number)` calling `GET /api/awards/circulation/{kind}/{id}?days={days}`.

Response: `{ award_id, kind, history: [{snapshot_date, circulation}], count }`

### No backend changes needed
Data collects daily at 05:00 UTC via existing `collect_circulation` scheduler job.

---

## Feature 2: Company Specials Tracker

### Goal
New `/company` page showing faction members' companies and a full directory of all 40 company types with their specials. Helps players choose optimal companies and coordinate specials.

### Backend

**New router: `api/routers/company.py`**

Endpoints:
- `GET /api/company/catalog` — fetches all company types from Torn API `/torn?selections=companies`. Returns company types with specials, positions, stock definitions. Cached 1 hour.
- `GET /api/company/faction` — iterates stored member API keys, fetches each member's job data via `/user?selections=profile`. Returns members grouped by company. Cached 30 min.

**New method in `torn_client.py`:**
- `fetch_company_catalog()` — calls `/torn?selections=companies`, caches 1 hour

**No new migration needed for v1.** Catalog data is fetched from Torn API and cached in-memory. Faction member job data comes from per-member API calls.

### Frontend

**Page: `frontend/src/app/company/page.tsx`**

Two sections:

**Top: "Our Faction's Companies"**
- Cards grouped by company name
- Each card: company name, type, employee list (faction members + their positions)
- Highlights key specials the company offers
- Explainer: why coordinating company placement matters

**Bottom: "Company Directory"**
- Grid/list of all 40 company types
- Each entry: name, startup cost, max employees, specials list with star requirement and JP cost
- Filter by special type: Energy / Items / Passive / All
- Sort by: name, cost, employees
- Expandable detail showing positions and stock items
- Color coding: green = energy specials, blue = item specials, purple = passive buffs

**PageExplainer content:**
- Job Points: earned daily based on effectiveness, spent on active specials
- Daily limit: 100 JP on energy specials per day
- 72-hour recruit cooldown before specials access
- Star ratings: driven by popularity, efficiency, environment
- Links: Torn Wiki Company, Torn Wiki Company Specials

**Sidebar:** Add "Companies" to TOOLS section with factory icon, after existing tools.

### API Client
- `api.companyCatalog()` → `GET /api/company/catalog`
- `api.companyFaction()` → `GET /api/company/faction`

### Torn API Details
- `/torn?selections=companies` returns all 40 types. Each has: `name`, `cost`, `default_employees`, `positions[]` (with stat requirements, gains, special_ability), `stock[]`, `specials[]` (name, effect, cost in JP, rating_required)
- `/user?selections=profile` returns `job: {company_id, company_name, company_type, position}` per member
- Rate limit: 100 calls/min. For 100-member faction, takes ~1 min to refresh all. Cache 30 min to avoid hammering.

---

## Feature 3: Push Notifications with Graceful Degradation

### Goal
Web Push notifications for critical game events. Per-user event preferences. Falls back to existing in-app notification system when push permission is denied.

### Backend

**Migration `017_push_subscriptions.sql`:**
```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    preferences TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_player ON push_subscriptions(player_id);
```

Preferences JSON: `{"loot_level4": true, "war_start": true, "stakeout_change": false, "oc_ready": true}`

**New router: `api/routers/push.py`**
- `POST /api/push/subscribe` — saves subscription object + initial preferences
- `PUT /api/push/preferences` — updates preference flags
- `DELETE /api/push/unsubscribe` — removes subscription by endpoint
- `GET /api/push/vapid-key` — returns public VAPID key

**New service: `api/push_service.py`**
- `dispatch_notification(event_type: str, title: str, body: str, url: str)` — queries subscriptions where preference for event_type is true, sends Web Push via `pywebpush`. Auto-removes 410 (expired) subscriptions.
- Falls back: if push fails or no subscriptions, creates in-app notification via existing notification system.

**New repository: `api/db/repos/push_repository.py`**
- Standard BaseRepository pattern: save, get_by_player, get_by_preference, delete_by_endpoint

**Trigger points (hooks into existing code):**
- **Loot level 4+:** In `refresh_data` scheduler job — compare current NPC levels vs previous refresh (keep previous levels in module-level dict). When any NPC crosses from <4 to >=4, dispatch "loot_level4" to ALL subscribers with that preference. Include NPC name and level in payload.
- **War start:** In war data refresh — when new war detected (new war_id not seen before), dispatch "war_start" to ALL subscribers. Include enemy faction name.
- **Stakeout change:** In stakeout refresh — when monitored player status changes, dispatch "stakeout_change" ONLY to the player who created that stakeout (filter by player_id). Include target name and new status.
- **OC ready:** In OC data refresh — when all slots filled or cooldown expired, dispatch "oc_ready" to ALL subscribers. Include OC type.

**Env vars (all optional — push disabled if missing):**

| Variable | Required | Purpose |
|----------|----------|---------|
| `VAPID_PRIVATE_KEY` | for push | Web Push signing key |
| `VAPID_PUBLIC_KEY` | for push | Shared with frontend for subscription |
| `VAPID_MAILTO` | for push | Contact email, required by Web Push spec |

**Dependency:** `pywebpush` added to project requirements.

### Frontend

**Service Worker: `frontend/public/sw.js`**
- Listens for `push` event, parses payload JSON `{title, body, icon, url}`
- Shows notification via `self.registration.showNotification()`
- Handles `notificationclick` — opens or focuses the target URL

**New hook: `frontend/src/hooks/usePushNotifications.ts`**
- Checks `Notification.permission` status
- Requests permission, subscribes via `pushManager.subscribe()` with VAPID public key
- Sends subscription to `POST /api/push/subscribe`
- Manages preference toggles via `PUT /api/push/preferences`
- Handles unsubscribe

**UI on `/notifications` page:**
- Push status indicator: Enabled (green) / Disabled (yellow) / Blocked (red)
- "Enable Push Notifications" button (if permission is "default")
- Per-event toggles:
  - NPC Loot Level 4+ (recommended for loot hunters)
  - War Started (critical for war coordination)
  - Stakeout Alert (player status changed)
  - OC Ready (organized crime slots filled)
- "Send Test" button to verify push works
- If permission denied: banner explaining how to re-enable in browser settings

**Graceful degradation:**
- If push not available or denied → events still create in-app notifications via existing system
- Banner on /notifications: "Enable push notifications to get alerts even when the app is closed"

**PageExplainer additions on /notifications:**
- What push notifications do and why they help gameplay
- Privacy: per-device subscription, no browsing data collected
- How to re-enable if accidentally denied (browser settings path)

### Next.js Static Export Consideration
Service Worker registration happens client-side in the browser. The `sw.js` file lives in `public/` and is served as a static asset. No SSR issues. The `navigator.serviceWorker.register('/sw.js')` call is made from the `usePushNotifications` hook (client-only).

---

## Testing Strategy

### Feature 1 (Circulation Chart)
- Backend: no new tests needed (API already tested)
- Frontend: build verification (`npm run build`)

### Feature 2 (Company Tracker)
- Backend: test catalog endpoint (mock Torn API response), test faction endpoint (mock member key iteration)
- Frontend: build verification

### Feature 3 (Push Notifications)
- Backend: test subscription CRUD, test preference filtering, test dispatch logic (mock pywebpush), test 410 cleanup
- Frontend: build verification

### All features
- Post-deploy Playwright sanity check per CLAUDE.md

---

## Implementation Order

1. Awards Circulation Chart (smallest, frontend-only)
2. Company Specials Tracker (new router + page)
3. Push Notifications (largest scope, new infra)

Each feature is independently deployable.
