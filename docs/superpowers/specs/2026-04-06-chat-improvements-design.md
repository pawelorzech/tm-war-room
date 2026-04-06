# Chat System Improvements — Design Spec

**Date**: 2026-04-06
**Scope**: 6 features across chat, dashboard, command palette, push notifications

---

## 1. Traveling Chat — Header with Travelers List

The `#traveling` channel gets a special header widget showing who is currently traveling.

### Backend

New endpoint `GET /api/chat/traveling` returning members with travel/abroad status from cached team data (same source as dashboard overview).

Response:
```json
{
  "travelers": [
    {"player_id": 123, "name": "PlayerA", "destination": "Mexico", "time_left": "2h 15m"},
    {"player_id": 456, "name": "PlayerB", "destination": "Switzerland", "time_left": "1h 03m"}
  ]
}
```

### Frontend

In `ChatLayout.tsx`, when `activeChannel.name === "traveling"`, render a compact strip below the channel header — horizontally scrollable row of small chips: `PlayerName -> Mexico (2h)`. If nobody is traveling, show "No members traveling right now."

### Migration

Seed `#traveling` channel via migration if it doesn't exist:
```sql
INSERT OR IGNORE INTO chat_channels (name, description, type, position, admin_only, created_at, created_by)
VALUES ('traveling', 'Travel coordination & updates', 'chat', 5, 0, strftime('%s','now'), 0);
```

---

## 2. Dashboard — Unread Chat Banner

### Frontend

At the top of `DashboardPage` (above the war alert), fetch `api.chatUnread()`. If `total > 0`, render a clickable info banner:

> 💬 **3 unread messages** in #war-room, #general

- Links to `/chat?channel={first_channel_with_unreads}`
- Styled as a blue/green info bar, less urgent than the red war alert
- Dismissible per session via `sessionStorage` flag (reappears on page refresh)

### Data source

Reuses `api.chatUnread()` which returns `{channels: Record<number, number>, total: number}`. The dashboard already loads on a 30s interval; the unread fetch can piggyback on that cycle.

Channel names for the banner come from a separate `api.chatChannels()` call (or a lightweight channel-names-only endpoint).

---

## 3. Cmd+K — Chat Channels in Command Palette

### Frontend

Extend `CommandPalette.tsx` to include chat channels as searchable items:

- On open, fetch channels + unread counts (lightweight, already cached by AppShell polling)
- Add channel items with:
  - `group: "Chat"`
  - `icon`: from `CHANNEL_ICONS` mapping
  - `href`: `/chat?channel={id}`
  - `unread`: count for sorting

### Sorting behavior

- **Empty query**: Channels with unread > 0 appear at the very top of the entire results list (ahead of page results), sorted by unread count descending. Other channels appear in their normal position within the "Chat" group.
- **With query**: All items (pages + channels) are filtered by fuzzy match. Unread channels still sort first within matches.

### Unread badge

Each channel result shows the unread count badge (same style as `ChannelList`) when unread > 0.

---

## 4. Push Notification — People Picker

### Frontend

Replace the plain "Player ID" `<input>` (in `SendNotification.tsx` when `targetType === 'player'`) with a searchable combobox:

- Fetch members list via `adminFetch` (endpoint: `/api/admin/push/groups` or `api.listKeys()`)
- Dropdown shows `PlayerName [ID]` for each member
- Typing filters by:
  - **Name**: fuzzy match (all query chars in order)
  - **ID**: prefix match on numeric input
- Selecting a member sets `targetValue` to their `player_id` (string)
- Raw ID typing still works for players not in the member list (e.g., allies)

No backend changes — the API already accepts `player_id` as `target_value`.

---

## 5. Leadership Channel — Admin-Only Visibility

### Problem

`list_channels` returns ALL channels regardless of `admin_only`. The flag only blocks posting, not visibility. Additionally, `announcements` is seeded with `admin_only=1` but should be visible to all members (only write-restricted).

### Migration

```sql
-- Fix announcements: visible to all, write-restricted to admins
UPDATE chat_channels SET admin_only = 0, write_restricted = 1 WHERE name = 'announcements';

-- Seed leadership channel (admin-only visibility)
INSERT OR IGNORE INTO chat_channels (name, description, type, position, admin_only, created_at, created_by)
VALUES ('leadership', 'Leadership discussion', 'chat', 0, 1, strftime('%s','now'), 0);
```

### Backend

In `list_channels` (`api/routers/chat.py`), filter admin-only channels for non-admin users:

```python
@router.get("/channels")
async def list_channels(x_player_id: int = Header()):
    _verify_member(x_player_id)
    channels = chat_repo.get_channels()
    if not _is_admin(x_player_id):
        channels = [ch for ch in channels if not ch["admin_only"]]
    unread = chat_repo.get_unread_counts(x_player_id)
    for ch in channels:
        ch["unread"] = unread.get(ch["id"], 0)
    return {"channels": channels}
```

Also filter in `get_unread` endpoint so non-admins don't get phantom unread counts for hidden channels.

---

## 6. Real-time Messages — Optimistic Rendering

### Problem

When sending via WebSocket, the sender doesn't see their message until the server echoes it back via broadcast. There's a perceptible round-trip delay.

### Fix: Optimistic updates in `useChat.ts`

1. **On send**: When `sendMessage` fires via WS, immediately append a temporary message to `messages` state:
   ```typescript
   const tempMsg: Message = {
     id: -Date.now(),  // negative temp ID
     channel_id: activeChannelRef.current,
     thread_id: null,
     player_id: myPlayerId,
     player_name: myPlayerName,
     content,
     bot_id: null,
     mentions,
     pinned: 0,
     deleted: 0,
     created_at: Math.floor(Date.now() / 1000),
     edited_at: null,
     _optimistic: true,  // flag for UI styling
   };
   ```

2. **On echo**: When `handleWSMessage` receives a `"message"` type for the current channel, check if it matches an optimistic message (same `player_id + content` within a 10s window). If yes, replace the optimistic message with the server-confirmed one. If no match, append normally.

3. **Timeout**: If the echo never arrives within 5 seconds, mark the optimistic message as failed. Show a subtle retry icon.

4. **For other users**: No change — they already receive messages in real-time via WS broadcast.

### Additional: Store player name for optimistic messages

`useChat` needs access to the current player's name. This can come from the `members` list already loaded in `ChatLayout`, passed down or stored in a ref.

---

## Files Affected

| Feature | Backend | Frontend |
|---------|---------|----------|
| 1. Traveling header | `api/routers/chat.py` (new endpoint), migration | `ChatLayout.tsx`, new `TravelingHeader` component |
| 2. Dashboard unread | — | `dashboard/page.tsx` |
| 3. Cmd+K channels | — | `CommandPalette.tsx`, `api-client.ts` |
| 4. People picker | — | `SendNotification.tsx`, new `PlayerPicker` component |
| 5. Leadership visibility | `api/routers/chat.py` (filter), migration | — (automatic via API) |
| 6. Optimistic messages | — | `useChat.ts` |

### Migrations

One new migration file (`028_chat_improvements.sql`) covering:
- Seed `#traveling` channel
- Fix `announcements` to `admin_only=0, write_restricted=1`
- Seed `#leadership` channel with `admin_only=1`
