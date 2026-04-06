# Chat Admin-Gating + UI Prominence

**Date:** 2026-04-06
**Status:** Approved

## Problem

Chat feature is deployed but not working reliably. It needs to be admin-only until validated, with a simple toggle for the superadmin to enable it for all members. Additionally, chat is buried in the Faction nav group — it should be a first-class, highly visible feature.

## Design

### 1. App Settings (backend)

New migration `022_app_settings.sql`:

```sql
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at REAL NOT NULL,
    updated_by INTEGER
);

INSERT OR IGNORE INTO app_settings (key, value, updated_at)
VALUES ('chat_enabled_for_all', 'false', strftime('%s', 'now'));
```

New `AppSettingsRepository` in `api/db/repos/settings.py`:
- `get(key) -> str | None`
- `set(key, value, updated_by)`
- `get_all() -> dict[str, str]`
- `get_public() -> dict[str, str]` — returns only whitelisted keys (initially just `chat_enabled_for_all`)

### 2. Settings endpoints

In `api/admin.py` (reuse existing admin auth):
- `GET /api/admin/settings` — returns all settings (admin-only)
- `PUT /api/admin/settings/{key}` — update a setting (admin-only), body: `{ "value": "true" }`

New public endpoint in a lightweight router or in `api/main.py`:
- `GET /api/settings/public` — returns public settings dict, no auth required. Cached in-memory with short TTL to avoid DB hits on every page load.

### 3. Chat access gating

In `api/routers/chat.py`:
- Add helper `_check_chat_access(player_id)` that reads `chat_enabled_for_all` setting
- If `false` and player is not admin → raise `HTTPException(403, "Chat is currently in beta — admin only")`
- Call this helper at the top of every REST endpoint and the WebSocket handler
- The `GET /api/chat/channels` endpoint already exists — frontend uses this as the entry point, so gating it gates the whole UI

### 4. Admin panel toggle (frontend)

New tab "Settings" in `/admin` page (visible to admins + superadmin):
- Section: "Feature Flags"
- Toggle row: "Enable Chat for all members"
  - Description: "When off, only admins can see and use the faction chat"
  - Current state indicator (on/off)
  - Uses `PUT /api/admin/settings/chat_enabled_for_all` with admin JWT

### 5. Sidebar prominence (desktop)

In `Sidebar.tsx`:
- Remove Chat from `NAV_GROUPS` Faction group in `nav-data.ts`
- Add a dedicated Chat link **above** all collapsible groups, below the Pinned section
- Visual treatment: green left border always visible (not just on active), slightly larger font, 💬 icon
- Unread badge: green pill with count (matches existing badge style but more prominent)
- Separator line below Chat, before collapsible groups
- Conditionally rendered: only show if user is admin (when gated) or always (when enabled)

### 6. Bottom nav (mobile)

In `BottomNavBar.tsx`:
- Add Chat as a dedicated tab with 💬 icon
- Position: between Faction and More (5th of 6 tabs), or replace current layout to be: Home | Warfare | Economy | Faction | Chat | More
- Unread badge on the tab
- Conditionally rendered same as sidebar

### 7. Floating Action Button (FAB)

New component `ChatFAB.tsx` in `frontend/src/components/chat/`:
- Fixed position: bottom-right, `right-6 bottom-6` on desktop, `right-4 bottom-20` on mobile (above bottom nav)
- Green circle (torn-green) with chat icon
- Unread badge: red/green pill overlapping top-right
- Subtle pulse animation when unread > 0
- Click → `router.push('/chat')`
- **Hidden on `/chat` page** (check pathname)
- **Hidden when chat not accessible** (admin gate check)

Rendered in `AppShell.tsx` so it appears on all pages.

### 8. Chat access hook (frontend)

New hook or extension of existing hook: `useChatAccess()`:
- Fetches `GET /api/settings/public` on mount (with SWR-like caching)
- Returns `{ chatEnabled: boolean, canAccessChat: boolean }` where `canAccessChat = chatEnabled || role !== 'member'`
- Used by: Sidebar, BottomNavBar, ChatFAB, and `/chat` page
- `/chat` page: if `!canAccessChat` → redirect to `/dashboard`

### 9. Unread counts

The FAB and nav items need unread counts without mounting the full chat. The existing `GET /api/chat/unread` endpoint returns `{ channels: {...}, total: number }`. 

- Poll this endpoint every 30s from `AppShell` level (only if `canAccessChat`)
- Pass `total` to Sidebar, BottomNavBar, and ChatFAB
- Stop polling on `/chat` page (the chat hook handles its own state there)

## Files to create

| File | Purpose |
|------|---------|
| `api/db/migrations/022_app_settings.sql` | Settings table + seed |
| `api/db/repos/settings.py` | AppSettingsRepository |
| `frontend/src/components/chat/ChatFAB.tsx` | Floating action button |
| `frontend/src/hooks/useChatAccess.ts` | Chat visibility hook |

## Files to modify

| File | Change |
|------|--------|
| `api/main.py` | Wire settings repo, add `/api/settings/public` endpoint |
| `api/admin.py` | Add settings endpoints |
| `api/routers/chat.py` | Add `_check_chat_access` gating |
| `api/db/repos/__init__.py` | Export AppSettingsRepository (if exists) |
| `frontend/src/lib/nav-data.ts` | Remove Chat from Faction group |
| `frontend/src/components/layout/Sidebar.tsx` | Add prominent Chat item |
| `frontend/src/components/nav/BottomNavBar.tsx` | Add Chat tab |
| `frontend/src/components/layout/AppShell.tsx` | Render ChatFAB, poll unread |
| `frontend/src/app/chat/page.tsx` | Gate access with redirect |
| `frontend/src/app/admin/page.tsx` | Add Settings tab |
| `frontend/src/lib/api-client.ts` | Add settings API methods |
| `frontend/src/data/changelog.ts` | Version bump + entry |

## Out of scope

- Fixing chat functionality bugs (separate task after gating is in place)
- Per-channel admin_only granularity (already exists in DB, not changing)
- Chat notifications/sounds
- Chat in a slide-over panel (full page only for now)
