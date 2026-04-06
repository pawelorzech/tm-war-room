# Profile, Settings, Avatars & Presence — Design Spec

**Date:** 2026-04-06  
**Status:** Approved

---

## Overview

Three interlocked features:

1. **Avatars** — fetch Torn profile images for faction members, cache on Backblaze B2 (`tmhubmedia`), display throughout the app (chat, team lists, sidebar, profile page).
2. **Profile/Settings page** (`/settings`) — unified page with full Torn profile, notification preferences, and app preferences. Replaces the settings section currently buried in `/notifications`.
3. **Hub presence** — heartbeat-based "online in hub" tracking replaces the WebSocket-only chat online counter.

---

## 1. Backblaze B2 Infrastructure

**Bucket:** `tmhubmedia` (public, no auth on read)

**Path convention:**
```
avatars/{player_id}.jpg
```

**Public base URL** stored as env var `B2_PUBLIC_URL` (e.g. `https://f005.backblazeb2.com/file/tmhubmedia`).  
Frontend builds avatar URLs as: `${B2_PUBLIC_URL}/avatars/${playerId}.jpg`

**New env vars:**

| Variable | Required | Purpose |
|---|---|---|
| `B2_APPLICATION_KEY_ID` | yes (for avatar sync) | B2 auth |
| `B2_APPLICATION_KEY` | yes (for avatar sync) | B2 auth |
| `B2_BUCKET_NAME` | no, default `tmhubmedia` | bucket name |
| `B2_PUBLIC_URL` | yes (for frontend) | public base URL |

**Backend module:** `api/b2_client.py` — thin wrapper around `b2sdk`. Exposes:
- `upload_bytes(remote_path: str, data: bytes, content_type: str) -> str` (returns public URL)
- `is_configured() -> bool` — returns False if env vars missing; all callers skip gracefully

Install: `b2sdk` added to `requirements.txt`.

---

## 2. Avatar Pipeline

### DB change

Migration `028_avatar_url.sql` — add column to `member_keys`:
```sql
ALTER TABLE member_keys ADD COLUMN avatar_url TEXT;
ALTER TABLE member_keys ADD COLUMN avatar_fetched_at INTEGER;
```

New methods on `KeyRepository`:
- `set_avatar(player_id, url, fetched_at)`
- `get_avatar_map() -> dict[int, str]` — returns `{player_id: url}` for all members that have one

### Scheduler job

New file `api/scheduler/jobs/refresh_avatars.py`:
- Runs every 12 hours
- Iterates all players in `member_keys`
- For each player, calls Torn API v1: `GET /user/{id}?selections=basic&key={faction_key}`
- Extracts `profile_image` URL
- Downloads image bytes via `httpx`
- Uploads to B2 as `avatars/{player_id}.jpg`
- Saves URL in `member_keys.avatar_url`
- Skips if `b2_client.is_configured()` is False
- Skips players fetched within last 11 hours (avoid re-fetch on restart)

Registered in scheduler engine alongside existing jobs.

### Backend endpoint

`GET /api/members/avatars` (existing `/api` router, requires `X-Player-Id`):
```json
{ "avatars": { "2362436": "https://...b2.com/file/tmhubmedia/avatars/2362436.jpg", ... } }
```

Used by frontend once on app load to hydrate avatar context.

---

## 3. Hub Presence (Heartbeat)

### DB change

Migration `029_presence.sql`:
```sql
CREATE TABLE IF NOT EXISTS player_presence (
  player_id INTEGER PRIMARY KEY,
  last_seen  INTEGER NOT NULL
);
```

### Backend

New endpoint `POST /api/heartbeat` (requires `X-Player-Id`):
- Upserts `last_seen = now()` in `player_presence`
- Returns `{"ok": true}`

`GET /api/chat/online` updated:
- Returns player IDs with `last_seen > now() - 120` from `player_presence`
- Falls back to empty list if table doesn't exist yet
- Chat WebSocket `ChatManager.get_online_players()` no longer used for this endpoint (but WS manager stays for typing indicators and message delivery)

### Frontend

`AppShell` (`ShellContent`): call `POST /api/heartbeat` on mount and every 30s for authenticated users. Fire-and-forget (no error handling needed).

No changes to `useChat` polling — `GET /api/chat/online` still polled every 30s, now returns hub-wide presence.

---

## 4. `/settings` Page

New page at `frontend/src/app/settings/page.tsx`.  
`/notifications` retains its notification inbox (list of received notifications) but removes the push settings section — those move to `/settings`.

### Sections

**Profile** (top):
- Large avatar (`<Avatar size="lg" />`) + player name + faction rank + level + days in faction
- Data source: fresh fetch from Torn API v1 `?selections=profile` using the player's own stored key via `GET /api/profile/me` (new endpoint)
- "View on Torn" external link

**Notifications** (second):
- Push subscription toggle + preferences (moved verbatim from `/notifications`)
- PDA channel settings

**App** (third):
- Theme toggle dark/light/system (calls existing `useTheme`)

### New backend endpoint

`GET /api/profile/me` (requires `X-Player-Id`):
- Fetches player's own API key from key store
- Calls Torn API v1 `GET /user/?selections=profile&key={player_key}`
- Returns: `{ player_id, name, level, faction: { position }, profile_image }`
- Cached 5 min in-memory (per player_id)

### Nav

- Add `/settings` to NAV_GROUPS under "Faction" group: `{ label: "Settings", href: "/settings", icon: "⚙️" }`
- Sidebar footer: clicking player name → `/settings` (add `<Link>` wrapper)

---

## 5. `<Avatar />` Component

`frontend/src/components/ui/Avatar.tsx`:

```tsx
<Avatar playerId={2362436} size="sm" />  // 24px
<Avatar playerId={2362436} size="md" />  // 32px
<Avatar playerId={2362436} size="lg" />  // 64px
```

- Reads URL from `AvatarContext` (populated by `useAvatars` hook on app load)
- If URL present: `<img src={url} />` with `onError` fallback
- Fallback: colored circle with 1–2 letter initials, color derived deterministically from `player_id % palette.length`
- `AvatarProvider` wraps `AppShell`, fetches `/api/members/avatars` once

### Where avatars appear

| Location | Size | Component |
|---|---|---|
| Chat messages | sm (24px) | `MessageBubble.tsx` — left of message content |
| Online players popover | sm (24px) | `ChatLayout.tsx` online list |
| `/team` member cards | md (32px) | `MemberCard.tsx` |
| `/team` member table | sm (24px) | `MemberTable.tsx` |
| `/stakeout` target rows | sm (24px) | stakeout page |
| Sidebar footer (own) | sm (24px) | `Sidebar.tsx` next to player name |
| `/settings` profile section | lg (64px) | settings page |

---

## 6. Error Handling & Graceful Degradation

- **B2 not configured** → avatar scheduler skips silently, `/api/members/avatars` returns `{}`, `<Avatar>` shows initials fallback everywhere. App fully functional.
- **Avatar 404** → `onError` on `<img>` triggers fallback to initials.
- **Heartbeat failure** → fire-and-forget, no UI impact.
- **Profile API failure** → `/settings` profile section shows skeleton + error message, rest of page still works.

---

## Out of Scope

- Avatars for non-member players (spy targets, bounty targets) — use initials fallback for now
- Avatar upload by users (custom avatars)
- Presence shown outside of chat (e.g. green dot on team page)
- B2 CDN / Cloudflare in front of bucket
