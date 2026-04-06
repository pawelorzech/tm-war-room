# Revive Monitor Bot — Design Spec

**Date:** 2026-04-06
**Status:** Approved

## Problem

During faction wars, members with revives enabled (revive_setting != "No one") are a liability — enemies can revive and repeatedly kill them for points. The faction needs an automated system that detects these members and warns them to disable revives.

## Solution

A chat bot ("Revive Monitor") that periodically posts to a dedicated "revives" channel, mentioning members who have revives enabled. Mentions trigger push notifications via the existing notification system.

## Architecture

### New module: `api/bots/revive_monitor.py`

Single `run()` function:

1. Fetch faction members via `torn_client.fetch_members()` (uses existing cache)
2. Filter members where `revive_setting != "No one"` (catches "Friends & faction", "Everyone", "Unknown"). "Unknown" is treated as a risk — better to warn than miss someone.
3. Check `war_active` from `refresh_data.py`
4. Format message based on context:
   - **War active:** Urgent tone — "UWAGA! Trwa wojna! Następujący gracze mają włączone revives — wyłączcie je natychmiast: @Player1, @Player2..."
   - **Peacetime:** Gentle reminder — "Przypomnienie: poniżsi gracze mają włączone revives. Warto wyłączyć przed kolejną wojną: @Player1, @Player2..."
   - **Empty list:** "Wszystko OK — nikt nie ma włączonych revives."
5. Post via `chat_repo.create_message()` as bot with `mentions` list (player IDs)
6. Existing `_notify_mentions()` handles push notifications automatically

### Scheduler job: `api/scheduler/jobs/revive_check.py`

- Registered in `engine.py` with **10-minute interval**
- Internal throttle logic:
  - If `war_active` → always post
  - If peacetime → post only if ≥60 minutes since last post (skip otherwise)
- Imports `war_active` from `refresh_data.py`

### Auto-provisioning (in `api/main.py` lifespan)

On startup:
1. Check if bot "Revive Monitor" exists in `chat_repo` — create if not, store token
2. Check if channel "revives" exists — create if not
3. Set bot's `allowed_channels` to the revives channel ID

### Admin panel — "Boty" tab

**Backend:** `POST /api/admin/bots/{bot_id}/trigger` in `api/admin.py`
- Admin-only endpoint
- Calls `revive_monitor.run()` immediately (bypasses throttle)
- Returns result: number of members found, message sent status

**Frontend:** New tab in `frontend/src/app/admin/page.tsx`
- List of bots: name, status (active/inactive), last post time, channel
- "Trigger teraz" button per bot — calls trigger endpoint
- Toggle to activate/deactivate bot (scheduler skips inactive bots)

## Data flow

```
Scheduler (10 min) ──┐
                      ├──▶ revive_monitor.run()
Admin "Trigger" ──────┘        │
                               ├─ torn_client.fetch_members()
                               ├─ filter: revive_setting != "No one"
                               ├─ format message (war vs peace tone)
                               └─ chat_repo.create_message(bot, mentions)
                                      ├─ WebSocket broadcast → live chat
                                      └─ _notify_mentions() → push
```

## Files

### New files
- `api/bots/__init__.py`
- `api/bots/revive_monitor.py` — bot logic
- `api/scheduler/jobs/revive_check.py` — scheduler job
- `tests/test_revive_monitor.py` — unit tests

### Modified files
- `api/scheduler/engine.py` — register revive_check job (10 min interval)
- `api/admin.py` — add `POST /api/admin/bots/{bot_id}/trigger` endpoint
- `api/main.py` — auto-provision bot + channel in lifespan
- `frontend/src/app/admin/page.tsx` — add "Boty" tab

## Message format

### War mode (urgent)
```
⚠️ **UWAGA! Trwa wojna!**

Następujący gracze mają włączone revives — wyłączcie je natychmiast!
Wróg może was wskrzeszać i zabijać dla punktów.

• @Player1 (revive_setting: Everyone)
• @Player2 (revive_setting: Friends & faction)

👉 Torn → Settings → Revive → "No one"
```

### Peace mode (gentle)
```
📋 Przypomnienie o revives

Poniżsi gracze mają włączone revives. Warto wyłączyć przed kolejną wojną:

• @Player1 (Everyone)
• @Player2 (Friends & faction)

👉 Torn → Settings → Revive → "No one"
```

### All clear
```
✅ Wszystko OK — nikt nie ma włączonych revives.
```

## Testing

`tests/test_revive_monitor.py`:
- Filter logic: members with various `revive_setting` values
- War mode vs peace mode message formatting
- Throttle logic: skips in peacetime within 60 min window
- Empty list produces "all clear" message
- Manual trigger bypasses throttle
- Bot creation and channel provisioning
