# Push Notifications — Unified System Design

**Date**: 2026-04-06
**Status**: Approved
**Approach**: Unified Push Service (Web Push + Torn PDA bridge)

## Overview

Dual-channel push notification system for TM Hub. Admin panel for sending notifications to specific players, groups, or all subscribers. Automatic detection and routing: Web Push for browsers, native `scheduleNotification` bridge for Torn PDA.

## Architecture

### Unified NotificationDispatcher

Central service replacing direct `PushService` calls. Single entry point for all notification sources (admin panel, scheduler jobs, chat mentions).

```
Admin panel / Scheduler / Chat trigger
          |
   NotificationDispatcher
          |
  notification_events table
    (persists every dispatch)
          |
  Target resolution
    (resolves group/role/preference → player_ids)
          |
  delivery_log table
    (per player, per event)
          |
    +----------+----------+
    |                     |
 WebPush              PDA Queue
 (immediate,          (pending in delivery_log,
  pywebpush)           picked up by PDA polling)
```

### Channel routing per player

- Player has `push_subscriptions` row with `channel = webpush` → send via `pywebpush` immediately
- Player has `push_subscriptions` row with `channel = pda` → insert `delivery_log` with `status = pending`, wait for PDA poll
- Player has both → send via both (user controls preferences per channel)
- Player has neither → skip, no delivery_log entry

### Existing PushService

Becomes internal WebPush transport. `NotificationDispatcher` calls it for `webpush` channel deliveries. Existing scheduler triggers (loot, war, stakeout) migrate to use `NotificationDispatcher`.

## Database

### New tables

#### `notification_templates`

Admin-created notification templates with variable support.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | auto |
| name | TEXT NOT NULL | e.g. "War Alert" |
| title_template | TEXT NOT NULL | supports `{{var}}` |
| body_template | TEXT NOT NULL | supports `{{var}}` |
| icon | TEXT | optional |
| url_template | TEXT | optional, supports `{{var}}` |
| variables | TEXT (JSON) | list of variable names, e.g. `["war_target"]` |
| created_by | INTEGER | player_id |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

Seed with predefined templates on migration: "War Alert", "Maintenance", "Chain Alert", "Custom".

#### `notification_events`

Every sent notification (admin or system).

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | auto |
| template_id | INTEGER | nullable (null = no template) |
| title | TEXT NOT NULL | resolved (variables substituted) |
| body | TEXT NOT NULL | resolved |
| url | TEXT | optional |
| icon | TEXT | optional |
| target_type | TEXT NOT NULL | enum: player, all, role, group, preference |
| target_value | TEXT | player_id / "admin" / group_id / preference key |
| sent_by | TEXT NOT NULL | player_id or "system" |
| variables_used | TEXT (JSON) | for audit trail |
| created_at | TEXT | ISO timestamp |

#### `delivery_log`

Per-player per-event delivery tracking.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | auto |
| event_id | INTEGER NOT NULL | FK → notification_events |
| player_id | INTEGER NOT NULL | recipient |
| channel | TEXT NOT NULL | "webpush" or "pda" |
| status | TEXT NOT NULL | pending / delivered / failed / expired |
| error_message | TEXT | nullable, failure reason |
| created_at | TEXT | ISO timestamp |
| delivered_at | TEXT | nullable |

Index on `(player_id, status)` for PDA polling. Index on `event_id` for history detail view.

#### `custom_groups`

Admin-created player groups.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | auto |
| name | TEXT NOT NULL UNIQUE | e.g. "War Team" |
| description | TEXT | optional |
| created_by | INTEGER | player_id |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

#### `custom_group_members`

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | auto |
| group_id | INTEGER NOT NULL | FK → custom_groups |
| player_id | INTEGER NOT NULL | |
| added_at | TEXT | ISO timestamp |

Unique constraint on `(group_id, player_id)`.

### Modified table

#### `push_subscriptions` — add `channel` column and relax constraints

Current schema has `endpoint`, `p256dh`, `auth` as `NOT NULL`. PDA subscriptions don't use these fields. SQLite doesn't support `ALTER COLUMN`, so migration 025 will:

1. Add `channel TEXT NOT NULL DEFAULT 'webpush'` column
2. For PDA registrations: use sentinel values (`endpoint = 'pda:{player_id}'`, `p256dh = ''`, `auth = ''`) to satisfy NOT NULL constraints without schema rebuild
3. PDA endpoint sentinel also provides uniqueness per player for the UNIQUE constraint on `endpoint`

### Migrations

- `021_notification_templates.sql`
- `022_notification_events.sql`
- `023_delivery_log.sql`
- `024_custom_groups.sql`
- `025_push_subscriptions_channel.sql`

## API Endpoints

### Admin endpoints (JWT auth, admin/superadmin)

#### Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/push/templates` | List all templates |
| POST | `/api/admin/push/templates` | Create template |
| PUT | `/api/admin/push/templates/{id}` | Update template |
| DELETE | `/api/admin/push/templates/{id}` | Delete template |

#### Send notifications

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/push/send` | Send notification |
| POST | `/api/admin/push/test` | Send test to self |

Send payload:
```json
{
  "template_id": 1,
  "title": "War started!",
  "body": "Faction {{war_target}} declared war on TM",
  "url": "/wars",
  "target_type": "group",
  "target_value": "war-team",
  "variables": {"war_target": "Faction X"}
}
```

Variable resolution: `{{var}}` in title/body/url gets replaced from `variables` dict. If `template_id` is provided and title/body are empty, use template values. If title/body provided, they override template.

#### History

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/push/history` | Paginated event list |
| GET | `/api/admin/push/history/{event_id}` | Event detail + delivery log |

History response includes: delivered/failed/pending counts per event, per channel breakdown.

#### Groups

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/push/groups` | List groups with member counts |
| POST | `/api/admin/push/groups` | Create group |
| PUT | `/api/admin/push/groups/{id}` | Update name/desc, add/remove members |
| DELETE | `/api/admin/push/groups/{id}` | Delete group |

#### Stats

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/push/stats` | Subscription counts per channel, delivery rates |

### Player endpoints

#### Existing (unchanged)

- `GET /api/push/vapid-key`
- `POST /api/push/subscribe`
- `PUT /api/push/preferences`
- `DELETE /api/push/unsubscribe`

#### New — PDA channel

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/push/pda/register` | Register as PDA subscriber |
| GET | `/api/push/pda/poll` | Get pending notifications (marks as delivered) |
| DELETE | `/api/push/pda/unregister` | Unregister PDA channel |

`pda/poll` returns events from last 24h with `status = pending` for this player. Response marks them as `delivered`. Returns array of `{event_id, title, body, url, icon, created_at}`.

## Frontend — Admin Panel

New tab **"Push Notifications"** in `/admin` page.

### Sub-sections

#### Send Notification

- Template dropdown (or "Custom")
- Auto-fill title/body/url from template with `{{variable}}` placeholders visible
- Dynamic variable inputs rendered from template's variable list
- Target picker (radio group):
  - Specific player → search/autocomplete by player name
  - All subscribers
  - Role → dropdown (admin/member)
  - Group → dropdown of custom groups
  - By preference → dropdown (loot_level4, war_start, stakeout_change)
- Preview panel: rendered notification with variables substituted
- "Send" button with confirmation dialog ("Send to X recipients?")
- "Send test to me" button (no confirmation needed)

#### Templates

- Table: name, title preview, variables list, edit/delete actions
- Create/edit modal: name, title template, body template, url template, icon
- Variables auto-detected from `{{...}}` syntax in templates

#### Groups

- Table: group name, description, member count, edit/delete actions
- Create/edit: name, description, multi-select member picker from faction member list

#### History

- Table: date, title, target description, sent by, delivery stats (delivered/failed/pending)
- Click row → detail view: full notification content + delivery log per player with status and channel

## Frontend — Torn PDA Integration

### Detection: `useTornPDA()` hook

```typescript
function useTornPDA() {
  const [isPDA, setIsPDA] = useState(false);
  const [bridge, setBridge] = useState(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.flutter_inappwebview) {
      window.flutter_inappwebview.callHandler('isTornPDA')
        .then((result) => {
          if (result?.isTornPDA) {
            setIsPDA(true);
            setBridge(window.flutter_inappwebview);
          }
        })
        .catch(() => {});
    }
  }, []);

  return { isPDA, bridge };
}
```

Called in `AppShell.tsx`, provided via React context.

### PDA auto-registration

When `isPDA === true` and user is authenticated:
1. Call `POST /api/push/pda/register` automatically
2. Skip Web Push subscription flow entirely
3. Show PDA-specific UI in notifications page

### Polling daemon: `usePDAPolling()` hook

When `isPDA === true`:
- `setInterval` every **15 seconds**
- Calls `GET /api/push/pda/poll`
- For each event received:
  ```typescript
  bridge.callHandler('scheduleNotification', {
    title: event.title,
    id: event.event_id % 10000,  // PDA requires 0-9999
    timestamp: Date.now() + 1000, // must be future
    subtitle: event.body,
    urlCallback: `https://hub.tri.ovh${event.url}`,
  });
  ```
- Cleanup: `clearInterval` on unmount

### Catch-up on reopen

When hub tab reopens in PDA after being closed:
- First poll returns all pending events from last 24h
- If > 0 events: show in-app banner "You have X new notifications" → link to `/notifications`
- Events still trigger `scheduleNotification` for native notifications

### Notifications page adaptation

When `isPDA === true`:
- Hide Web Push enable/disable UI (not functional in WebView)
- Show status: "Connected via Torn PDA" with green badge
- Same preference checkboxes (same backend endpoint)
- Test button triggers `scheduleNotification` via bridge instead of Web Push

## Bug Fixes & Cleanup

### Bug: chat.py line 658

`push_service.send_to_player()` does not exist. Fix: route through `NotificationDispatcher` with appropriate event type. After refactor, chat mentions go through the unified system.

### Cleanup: OC Ready event type

Remove from frontend preference UI (`usePushNotifications.ts` and `notifications/page.tsx`). Not implemented in backend, no trigger exists. Re-add when OC alerts are built.

### Migration of existing subscriptions

Existing `push_subscriptions` rows get `channel = 'webpush'` via DEFAULT. No breaking change. Existing `PushService.dispatch()` and `dispatch_to_player()` calls migrate to `NotificationDispatcher`.

## Constraints & Limitations

- **PDA notifications require hub to be open**: `scheduleNotification` bridge only works while hub.tri.ovh is loaded in a PDA tab. When user navigates away, polling stops. Catch-up on reopen mitigates this but real-time alerts are only possible while the tab is active.
- **PDA notification ID range**: 0-9999 only. Using `event_id % 10000` — collision possible after 10k events but acceptable (old notifications expire).
- **No PDA background push**: Cannot send server-initiated push to PDA without modifying PDA source code. This is a known trade-off.
- **SQLite concurrency**: Delivery log writes during bulk sends (all subscribers) should use batch inserts. WAL mode handles concurrent reads from polling.
