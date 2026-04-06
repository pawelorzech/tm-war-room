# Push Notifications — Unified System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dual-channel push notification system (Web Push + Torn PDA bridge) with admin panel for sending, templates, groups, history, and automatic PDA detection/polling.

**Architecture:** Unified `NotificationDispatcher` replaces direct `PushService` calls. Admin sends notification → dispatcher resolves targets → routes to WebPush (immediate) or PDA queue (polling). Frontend detects Torn PDA via `window.flutter_inappwebview` and uses `scheduleNotification` bridge.

**Tech Stack:** FastAPI, SQLite, pywebpush, Next.js 15, React 19, Tailwind v4, Torn PDA JS bridge

**Spec:** `docs/superpowers/specs/2026-04-06-push-notifications-design.md`

---

## File Structure

### Backend — New files
- `api/db/repos/notification_templates.py` — CRUD for notification templates
- `api/db/repos/notification_events.py` — CRUD for notification events + delivery log
- `api/db/repos/custom_groups.py` — CRUD for custom player groups
- `api/notification_dispatcher.py` — Unified dispatch service (replaces direct PushService calls)
- `api/routers/admin_push.py` — Admin push endpoints (templates, send, history, groups, stats)
- `api/db/migrations/024_notification_templates.sql` — Templates table + seeds
- `api/db/migrations/025_notification_events.sql` — Events + delivery_log tables
- `api/db/migrations/026_custom_groups.sql` — Groups + members tables
- `api/db/migrations/027_push_subscriptions_channel.sql` — Add channel column

### Backend — Modified files
- `api/main.py:137-179` — Initialize new repos, dispatcher, wire admin_push router
- `api/push_service.py` — No changes (becomes internal WebPush transport)
- `api/routers/push.py:9-60` — Add PDA register/poll/unregister endpoints
- `api/routers/chat.py:668-680` — Fix broken `send_to_player()` → use dispatcher
- `api/scheduler/jobs/refresh_data.py:33-38,75-77,281-289` — Migrate to dispatcher
- `api/admin.py` — No changes (new router in separate file)

### Frontend — New files
- `src/hooks/useTornPDA.ts` — PDA detection hook
- `src/hooks/usePDAPolling.ts` — PDA polling daemon hook
- `src/contexts/PDAContext.tsx` — React context for PDA state
- `src/components/admin/PushAdmin.tsx` — Main push admin tab (sub-sections)
- `src/components/admin/push/SendNotification.tsx` — Send form
- `src/components/admin/push/TemplateManager.tsx` — Template CRUD
- `src/components/admin/push/GroupManager.tsx` — Group CRUD
- `src/components/admin/push/PushHistory.tsx` — History view

### Frontend — Modified files
- `src/app/admin/page.tsx:11,21-27,46-51` — Add "Push" tab
- `src/app/notifications/page.tsx:88-154` — Adapt for PDA detection
- `src/hooks/usePushNotifications.ts:6,8-14,16-21` — Remove oc_ready
- `src/components/layout/AppShell.tsx:47-52` — Add PDA context provider
- `src/lib/api-client.ts:126-132` — Add PDA + admin push API functions

### Tests — New files
- `tests/test_notification_dispatcher.py`
- `tests/test_notification_templates_repo.py`
- `tests/test_notification_events_repo.py`
- `tests/test_custom_groups_repo.py`
- `tests/test_admin_push_routes.py`
- `tests/test_pda_endpoints.py`

---

## Task 1: Database Migrations

**Files:**
- Create: `api/db/migrations/024_notification_templates.sql`
- Create: `api/db/migrations/025_notification_events.sql`
- Create: `api/db/migrations/026_custom_groups.sql`
- Create: `api/db/migrations/027_push_subscriptions_channel.sql`

- [ ] **Step 1: Create notification_templates migration**

```sql
-- api/db/migrations/024_notification_templates.sql
CREATE TABLE IF NOT EXISTS notification_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    title_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    icon TEXT,
    url_template TEXT,
    variables TEXT NOT NULL DEFAULT '[]',
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Seed default templates
INSERT OR IGNORE INTO notification_templates (id, name, title_template, body_template, icon, url_template, variables, created_by, created_at, updated_at)
VALUES
    (1, 'War Alert', '⚔️ {{title}}', '{{message}}', NULL, '/wars', '["title", "message"]', 0, datetime('now'), datetime('now')),
    (2, 'Maintenance', '🔧 Maintenance: {{title}}', '{{message}}', NULL, '/dashboard', '["title", "message"]', 0, datetime('now'), datetime('now')),
    (3, 'Chain Alert', '🔗 {{title}}', '{{message}}', NULL, '/chain', '["title", "message"]', 0, datetime('now'), datetime('now')),
    (4, 'Custom', '{{title}}', '{{message}}', NULL, '{{url}}', '["title", "message", "url"]', 0, datetime('now'), datetime('now'));
```

- [ ] **Step 2: Create notification_events + delivery_log migration**

```sql
-- api/db/migrations/025_notification_events.sql
CREATE TABLE IF NOT EXISTS notification_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT,
    icon TEXT,
    target_type TEXT NOT NULL,
    target_value TEXT,
    sent_by TEXT NOT NULL,
    variables_used TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES notification_events(id),
    player_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TEXT NOT NULL,
    delivered_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_delivery_player_status ON delivery_log(player_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_event ON delivery_log(event_id);
```

- [ ] **Step 3: Create custom_groups migration**

```sql
-- api/db/migrations/026_custom_groups.sql
CREATE TABLE IF NOT EXISTS custom_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES custom_groups(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL,
    added_at TEXT NOT NULL,
    UNIQUE(group_id, player_id)
);
```

- [ ] **Step 4: Create push_subscriptions channel migration**

```sql
-- api/db/migrations/027_push_subscriptions_channel.sql
ALTER TABLE push_subscriptions ADD COLUMN channel TEXT NOT NULL DEFAULT 'webpush';
```

- [ ] **Step 5: Verify migrations run**

Run: `uv run pytest tests/test_push_repo.py -v`
Expected: PASS (existing tests still work — migration adds column with default)

- [ ] **Step 6: Commit**

```bash
git add api/db/migrations/024_notification_templates.sql api/db/migrations/025_notification_events.sql api/db/migrations/026_custom_groups.sql api/db/migrations/027_push_subscriptions_channel.sql
git commit -m "feat: database migrations for push notification system"
```

---

## Task 2: Notification Templates Repository

**Files:**
- Create: `api/db/repos/notification_templates.py`
- Create: `tests/test_notification_templates_repo.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_notification_templates_repo.py
import json
import os
import pytest
from api.db.migrations.runner import run_migrations
from api.db.repos.notification_templates import NotificationTemplateRepository


@pytest.fixture
def tmpl_repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return NotificationTemplateRepository(db_path=db_path)


def test_seeded_templates_exist(tmpl_repo):
    templates = tmpl_repo.get_all()
    assert len(templates) >= 4
    names = {t["name"] for t in templates}
    assert {"War Alert", "Maintenance", "Chain Alert", "Custom"} <= names


def test_create_template(tmpl_repo):
    tid = tmpl_repo.create(
        name="Test Template",
        title_template="Hello {{name}}",
        body_template="Welcome {{name}} to {{place}}",
        url_template="/test",
        icon=None,
        created_by=123,
    )
    assert tid > 0
    t = tmpl_repo.get_by_id(tid)
    assert t["name"] == "Test Template"
    assert t["title_template"] == "Hello {{name}}"
    variables = json.loads(t["variables"])
    assert set(variables) == {"name", "place"}


def test_update_template(tmpl_repo):
    tid = tmpl_repo.create(
        name="Old Name",
        title_template="{{a}}",
        body_template="{{b}}",
        url_template=None,
        icon=None,
        created_by=123,
    )
    tmpl_repo.update(tid, name="New Name", title_template="{{x}}", body_template="{{y}}")
    t = tmpl_repo.get_by_id(tid)
    assert t["name"] == "New Name"
    variables = json.loads(t["variables"])
    assert set(variables) == {"x", "y"}


def test_delete_template(tmpl_repo):
    tid = tmpl_repo.create(
        name="To Delete", title_template="t", body_template="b",
        url_template=None, icon=None, created_by=123,
    )
    tmpl_repo.delete(tid)
    assert tmpl_repo.get_by_id(tid) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_notification_templates_repo.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.db.repos.notification_templates'`

- [ ] **Step 3: Implement the repository**

```python
# api/db/repos/notification_templates.py
from __future__ import annotations
import json
import re
from datetime import datetime, timezone
from api.db.repos.base import BaseRepository


def _extract_variables(*templates: str | None) -> list[str]:
    """Extract {{var}} placeholders from template strings."""
    found: set[str] = set()
    for t in templates:
        if t:
            found.update(re.findall(r"\{\{(\w+)\}\}", t))
    return sorted(found)


class NotificationTemplateRepository(BaseRepository):
    def get_all(self) -> list[dict]:
        rows = self.execute("SELECT * FROM notification_templates ORDER BY id")
        return [dict(r) for r in rows]

    def get_by_id(self, template_id: int) -> dict | None:
        row = self.execute_one(
            "SELECT * FROM notification_templates WHERE id = ?", (template_id,)
        )
        return dict(row) if row else None

    def create(
        self,
        name: str,
        title_template: str,
        body_template: str,
        url_template: str | None,
        icon: str | None,
        created_by: int,
    ) -> int:
        now = datetime.now(timezone.utc).isoformat()
        variables = json.dumps(
            _extract_variables(title_template, body_template, url_template)
        )
        return self.mutate(
            """INSERT INTO notification_templates
               (name, title_template, body_template, icon, url_template, variables, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (name, title_template, body_template, icon, url_template, variables, created_by, now, now),
        )

    def update(self, template_id: int, **fields) -> None:
        now = datetime.now(timezone.utc).isoformat()
        current = self.get_by_id(template_id)
        if not current:
            return
        name = fields.get("name", current["name"])
        title_t = fields.get("title_template", current["title_template"])
        body_t = fields.get("body_template", current["body_template"])
        url_t = fields.get("url_template", current["url_template"])
        icon = fields.get("icon", current["icon"])
        variables = json.dumps(_extract_variables(title_t, body_t, url_t))
        self.mutate(
            """UPDATE notification_templates
               SET name=?, title_template=?, body_template=?, url_template=?, icon=?, variables=?, updated_at=?
               WHERE id=?""",
            (name, title_t, body_t, url_t, icon, variables, now, template_id),
        )

    def delete(self, template_id: int) -> None:
        self.mutate("DELETE FROM notification_templates WHERE id = ?", (template_id,))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_notification_templates_repo.py -v`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add api/db/repos/notification_templates.py tests/test_notification_templates_repo.py
git commit -m "feat: notification templates repository with CRUD and variable extraction"
```

---

## Task 3: Notification Events & Delivery Log Repository

**Files:**
- Create: `api/db/repos/notification_events.py`
- Create: `tests/test_notification_events_repo.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_notification_events_repo.py
import os
import pytest
from api.db.migrations.runner import run_migrations
from api.db.repos.notification_events import NotificationEventRepository


@pytest.fixture
def event_repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return NotificationEventRepository(db_path=db_path)


def test_create_event(event_repo):
    eid = event_repo.create_event(
        template_id=None, title="Test", body="Body",
        url="/test", icon=None,
        target_type="all", target_value=None,
        sent_by="system", variables_used={},
    )
    assert eid > 0
    ev = event_repo.get_event(eid)
    assert ev["title"] == "Test"
    assert ev["target_type"] == "all"


def test_create_delivery_and_get_pending(event_repo):
    eid = event_repo.create_event(
        template_id=None, title="T", body="B", url="/t", icon=None,
        target_type="player", target_value="123",
        sent_by="system", variables_used={},
    )
    event_repo.create_delivery(eid, player_id=123, channel="pda")
    event_repo.create_delivery(eid, player_id=456, channel="webpush")

    pending = event_repo.get_pending_pda(player_id=123)
    assert len(pending) == 1
    assert pending[0]["title"] == "T"
    assert pending[0]["event_id"] == eid


def test_mark_delivered(event_repo):
    eid = event_repo.create_event(
        template_id=None, title="T", body="B", url=None, icon=None,
        target_type="all", target_value=None,
        sent_by="system", variables_used={},
    )
    did = event_repo.create_delivery(eid, player_id=123, channel="pda")
    event_repo.mark_delivered(did)

    pending = event_repo.get_pending_pda(player_id=123)
    assert len(pending) == 0


def test_mark_failed(event_repo):
    eid = event_repo.create_event(
        template_id=None, title="T", body="B", url=None, icon=None,
        target_type="all", target_value=None,
        sent_by="system", variables_used={},
    )
    did = event_repo.create_delivery(eid, player_id=123, channel="webpush")
    event_repo.mark_failed(did, "410 Gone")

    deliveries = event_repo.get_deliveries_for_event(eid)
    assert deliveries[0]["status"] == "failed"
    assert deliveries[0]["error_message"] == "410 Gone"


def test_list_events_paginated(event_repo):
    for i in range(5):
        event_repo.create_event(
            template_id=None, title=f"Event {i}", body="B", url=None, icon=None,
            target_type="all", target_value=None,
            sent_by="system", variables_used={},
        )
    page = event_repo.list_events(limit=3, offset=0)
    assert len(page) == 3
    # Most recent first
    assert page[0]["title"] == "Event 4"


def test_event_stats(event_repo):
    eid = event_repo.create_event(
        template_id=None, title="T", body="B", url=None, icon=None,
        target_type="all", target_value=None,
        sent_by="system", variables_used={},
    )
    d1 = event_repo.create_delivery(eid, 100, "webpush")
    d2 = event_repo.create_delivery(eid, 200, "pda")
    d3 = event_repo.create_delivery(eid, 300, "webpush")
    event_repo.mark_delivered(d1)
    event_repo.mark_failed(d3, "error")

    stats = event_repo.get_event_stats(eid)
    assert stats["delivered"] == 1
    assert stats["pending"] == 1
    assert stats["failed"] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_notification_events_repo.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement the repository**

```python
# api/db/repos/notification_events.py
from __future__ import annotations
import json
from datetime import datetime, timezone
from api.db.repos.base import BaseRepository


class NotificationEventRepository(BaseRepository):
    def create_event(
        self,
        template_id: int | None,
        title: str,
        body: str,
        url: str | None,
        icon: str | None,
        target_type: str,
        target_value: str | None,
        sent_by: str,
        variables_used: dict,
    ) -> int:
        now = datetime.now(timezone.utc).isoformat()
        return self.mutate(
            """INSERT INTO notification_events
               (template_id, title, body, url, icon, target_type, target_value, sent_by, variables_used, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (template_id, title, body, url, icon, target_type, target_value,
             sent_by, json.dumps(variables_used), now),
        )

    def get_event(self, event_id: int) -> dict | None:
        row = self.execute_one("SELECT * FROM notification_events WHERE id = ?", (event_id,))
        return dict(row) if row else None

    def list_events(self, limit: int = 20, offset: int = 0) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM notification_events ORDER BY id DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
        return [dict(r) for r in rows]

    def create_delivery(self, event_id: int, player_id: int, channel: str) -> int:
        now = datetime.now(timezone.utc).isoformat()
        return self.mutate(
            """INSERT INTO delivery_log (event_id, player_id, channel, status, created_at)
               VALUES (?, ?, ?, 'pending', ?)""",
            (event_id, player_id, channel, now),
        )

    def mark_delivered(self, delivery_id: int) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.mutate(
            "UPDATE delivery_log SET status = 'delivered', delivered_at = ? WHERE id = ?",
            (now, delivery_id),
        )

    def mark_failed(self, delivery_id: int, error: str) -> None:
        self.mutate(
            "UPDATE delivery_log SET status = 'failed', error_message = ? WHERE id = ?",
            (error, delivery_id),
        )

    def get_pending_pda(self, player_id: int) -> list[dict]:
        """Get pending PDA deliveries with event data, last 24h."""
        rows = self.execute(
            """SELECT d.id as delivery_id, e.id as event_id, e.title, e.body, e.url, e.icon, e.created_at
               FROM delivery_log d
               JOIN notification_events e ON d.event_id = e.id
               WHERE d.player_id = ? AND d.channel = 'pda' AND d.status = 'pending'
                 AND d.created_at >= datetime('now', '-1 day')
               ORDER BY d.created_at ASC""",
            (player_id,),
        )
        return [dict(r) for r in rows]

    def get_deliveries_for_event(self, event_id: int) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM delivery_log WHERE event_id = ? ORDER BY id",
            (event_id,),
        )
        return [dict(r) for r in rows]

    def get_event_stats(self, event_id: int) -> dict:
        rows = self.execute(
            """SELECT status, COUNT(*) as cnt FROM delivery_log
               WHERE event_id = ? GROUP BY status""",
            (event_id,),
        )
        stats = {"delivered": 0, "pending": 0, "failed": 0, "expired": 0}
        for r in rows:
            stats[r["status"]] = r["cnt"]
        return stats

    def get_subscription_stats(self) -> dict:
        """Count subscriptions per channel."""
        rows = self.execute(
            "SELECT channel, COUNT(*) as cnt FROM push_subscriptions GROUP BY channel"
        )
        return {r["channel"]: r["cnt"] for r in rows}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_notification_events_repo.py -v`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add api/db/repos/notification_events.py tests/test_notification_events_repo.py
git commit -m "feat: notification events and delivery log repository"
```

---

## Task 4: Custom Groups Repository

**Files:**
- Create: `api/db/repos/custom_groups.py`
- Create: `tests/test_custom_groups_repo.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_custom_groups_repo.py
import os
import pytest
from api.db.migrations.runner import run_migrations
from api.db.repos.custom_groups import CustomGroupRepository


@pytest.fixture
def group_repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return CustomGroupRepository(db_path=db_path)


def test_create_group(group_repo):
    gid = group_repo.create("War Team", "Active war participants", created_by=123)
    assert gid > 0
    g = group_repo.get_by_id(gid)
    assert g["name"] == "War Team"


def test_add_and_list_members(group_repo):
    gid = group_repo.create("Team A", None, created_by=123)
    group_repo.add_member(gid, 100)
    group_repo.add_member(gid, 200)
    members = group_repo.get_members(gid)
    assert {m["player_id"] for m in members} == {100, 200}


def test_remove_member(group_repo):
    gid = group_repo.create("Team B", None, created_by=123)
    group_repo.add_member(gid, 100)
    group_repo.remove_member(gid, 100)
    assert group_repo.get_members(gid) == []


def test_list_groups_with_counts(group_repo):
    g1 = group_repo.create("G1", None, created_by=123)
    g2 = group_repo.create("G2", None, created_by=123)
    group_repo.add_member(g1, 100)
    group_repo.add_member(g1, 200)
    group_repo.add_member(g2, 300)

    groups = group_repo.list_all()
    counts = {g["name"]: g["member_count"] for g in groups}
    assert counts["G1"] == 2
    assert counts["G2"] == 1


def test_delete_group_cascades(group_repo):
    gid = group_repo.create("Temp", None, created_by=123)
    group_repo.add_member(gid, 100)
    group_repo.delete(gid)
    assert group_repo.get_by_id(gid) is None


def test_update_group(group_repo):
    gid = group_repo.create("Old", "old desc", created_by=123)
    group_repo.update(gid, name="New", description="new desc")
    g = group_repo.get_by_id(gid)
    assert g["name"] == "New"
    assert g["description"] == "new desc"


def test_duplicate_member_ignored(group_repo):
    gid = group_repo.create("Dups", None, created_by=123)
    group_repo.add_member(gid, 100)
    group_repo.add_member(gid, 100)  # should not raise
    members = group_repo.get_members(gid)
    assert len(members) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_custom_groups_repo.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement the repository**

```python
# api/db/repos/custom_groups.py
from __future__ import annotations
from datetime import datetime, timezone
from api.db.repos.base import BaseRepository


class CustomGroupRepository(BaseRepository):
    def create(self, name: str, description: str | None, created_by: int) -> int:
        now = datetime.now(timezone.utc).isoformat()
        return self.mutate(
            """INSERT INTO custom_groups (name, description, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)""",
            (name, description, created_by, now, now),
        )

    def get_by_id(self, group_id: int) -> dict | None:
        row = self.execute_one("SELECT * FROM custom_groups WHERE id = ?", (group_id,))
        return dict(row) if row else None

    def list_all(self) -> list[dict]:
        rows = self.execute(
            """SELECT g.*, COUNT(m.id) as member_count
               FROM custom_groups g
               LEFT JOIN custom_group_members m ON g.id = m.group_id
               GROUP BY g.id ORDER BY g.name"""
        )
        return [dict(r) for r in rows]

    def update(self, group_id: int, name: str | None = None, description: str | None = None) -> None:
        now = datetime.now(timezone.utc).isoformat()
        current = self.get_by_id(group_id)
        if not current:
            return
        self.mutate(
            "UPDATE custom_groups SET name=?, description=?, updated_at=? WHERE id=?",
            (name or current["name"], description if description is not None else current["description"], now, group_id),
        )

    def delete(self, group_id: int) -> None:
        self.mutate("DELETE FROM custom_groups WHERE id = ?", (group_id,))

    def add_member(self, group_id: int, player_id: int) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.mutate(
            "INSERT OR IGNORE INTO custom_group_members (group_id, player_id, added_at) VALUES (?, ?, ?)",
            (group_id, player_id, now),
        )

    def remove_member(self, group_id: int, player_id: int) -> None:
        self.mutate(
            "DELETE FROM custom_group_members WHERE group_id = ? AND player_id = ?",
            (group_id, player_id),
        )

    def get_members(self, group_id: int) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM custom_group_members WHERE group_id = ? ORDER BY added_at",
            (group_id,),
        )
        return [dict(r) for r in rows]

    def get_player_ids(self, group_id: int) -> list[int]:
        rows = self.execute(
            "SELECT player_id FROM custom_group_members WHERE group_id = ?",
            (group_id,),
        )
        return [r["player_id"] for r in rows]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_custom_groups_repo.py -v`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add api/db/repos/custom_groups.py tests/test_custom_groups_repo.py
git commit -m "feat: custom groups repository for player group management"
```

---

## Task 5: NotificationDispatcher Service

**Files:**
- Create: `api/notification_dispatcher.py`
- Create: `tests/test_notification_dispatcher.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_notification_dispatcher.py
import json
import pytest
from unittest.mock import MagicMock, patch, call


def _make_dispatcher(**overrides):
    from api.notification_dispatcher import NotificationDispatcher
    defaults = dict(
        push_service=MagicMock(),
        push_repo=MagicMock(),
        event_repo=MagicMock(),
        group_repo=MagicMock(),
        key_store=MagicMock(),
    )
    defaults.update(overrides)
    return NotificationDispatcher(**defaults)


def test_resolve_variables():
    from api.notification_dispatcher import _resolve_template
    result = _resolve_template("Hello {{name}}, welcome to {{place}}", {"name": "Bombel", "place": "TM"})
    assert result == "Hello Bombel, welcome to TM"


def test_resolve_variables_missing_key():
    from api.notification_dispatcher import _resolve_template
    result = _resolve_template("Hello {{name}}", {})
    assert result == "Hello {{name}}"


def test_send_to_player():
    push_repo = MagicMock()
    push_repo.get_by_player.return_value = [
        {"player_id": 123, "endpoint": "https://push/a", "p256dh": "k", "auth": "a", "channel": "webpush"},
    ]
    event_repo = MagicMock()
    event_repo.create_event.return_value = 1
    event_repo.create_delivery.return_value = 10
    push_service = MagicMock()

    d = _make_dispatcher(push_service=push_service, push_repo=push_repo, event_repo=event_repo)
    d.send(
        title="Test", body="Body", url="/test",
        target_type="player", target_value="123",
        sent_by="system",
    )

    event_repo.create_event.assert_called_once()
    event_repo.create_delivery.assert_called_once_with(1, 123, "webpush")


def test_send_to_all():
    push_repo = MagicMock()
    push_repo.get_all_subscribers.return_value = [
        {"player_id": 100, "channel": "webpush"},
        {"player_id": 200, "channel": "pda"},
    ]
    event_repo = MagicMock()
    event_repo.create_event.return_value = 5
    event_repo.create_delivery.side_effect = [10, 11]
    push_service = MagicMock()

    d = _make_dispatcher(push_service=push_service, push_repo=push_repo, event_repo=event_repo)
    d.send(
        title="Broadcast", body="Hello all", url=None,
        target_type="all", target_value=None,
        sent_by="2362436",
    )

    assert event_repo.create_delivery.call_count == 2


def test_send_to_group():
    push_repo = MagicMock()
    push_repo.get_by_player.side_effect = [
        [{"player_id": 100, "channel": "webpush"}],
        [{"player_id": 200, "channel": "pda"}],
    ]
    group_repo = MagicMock()
    group_repo.get_player_ids.return_value = [100, 200]
    event_repo = MagicMock()
    event_repo.create_event.return_value = 3
    event_repo.create_delivery.side_effect = [10, 11]

    d = _make_dispatcher(push_repo=push_repo, group_repo=group_repo, event_repo=event_repo)
    d.send(
        title="Group msg", body="Body", url=None,
        target_type="group", target_value="1",
        sent_by="system",
    )

    group_repo.get_player_ids.assert_called_once_with(1)
    assert event_repo.create_delivery.call_count == 2


def test_webpush_delivery_marks_success():
    push_repo = MagicMock()
    push_repo.get_by_player.return_value = [
        {"player_id": 123, "endpoint": "https://push/a", "p256dh": "k", "auth": "a", "channel": "webpush"},
    ]
    event_repo = MagicMock()
    event_repo.create_event.return_value = 1
    event_repo.create_delivery.return_value = 10
    push_service = MagicMock()
    push_service.enabled = True

    d = _make_dispatcher(push_service=push_service, push_repo=push_repo, event_repo=event_repo)
    d.send(title="T", body="B", url=None, target_type="player", target_value="123", sent_by="system")

    # WebPush delivery should be attempted and marked delivered
    push_service._send_to_subs.assert_called_once()
    event_repo.mark_delivered.assert_called_once_with(10)


def test_pda_delivery_stays_pending():
    push_repo = MagicMock()
    push_repo.get_by_player.return_value = [
        {"player_id": 123, "channel": "pda"},
    ]
    event_repo = MagicMock()
    event_repo.create_event.return_value = 1
    event_repo.create_delivery.return_value = 10
    push_service = MagicMock()

    d = _make_dispatcher(push_service=push_service, push_repo=push_repo, event_repo=event_repo)
    d.send(title="T", body="B", url=None, target_type="player", target_value="123", sent_by="system")

    # PDA delivery stays pending — picked up by polling
    push_service._send_to_subs.assert_not_called()
    event_repo.mark_delivered.assert_not_called()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_notification_dispatcher.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement the dispatcher**

```python
# api/notification_dispatcher.py
from __future__ import annotations
import logging
import re

logger = logging.getLogger("tm-hub.dispatcher")


def _resolve_template(template: str, variables: dict) -> str:
    """Replace {{var}} placeholders with values from variables dict."""
    def replacer(match):
        key = match.group(1)
        return str(variables.get(key, match.group(0)))
    return re.sub(r"\{\{(\w+)\}\}", replacer, template)


class NotificationDispatcher:
    def __init__(self, push_service, push_repo, event_repo, group_repo, key_store):
        self._push_service = push_service
        self._push_repo = push_repo
        self._event_repo = event_repo
        self._group_repo = group_repo
        self._key_store = key_store

    def send(
        self,
        title: str,
        body: str,
        url: str | None = None,
        icon: str | None = None,
        target_type: str = "all",
        target_value: str | None = None,
        sent_by: str = "system",
        template_id: int | None = None,
        variables: dict | None = None,
    ) -> int:
        """Send notification. Returns event_id."""
        variables = variables or {}
        title = _resolve_template(title, variables)
        body = _resolve_template(body, variables)
        if url:
            url = _resolve_template(url, variables)

        event_id = self._event_repo.create_event(
            template_id=template_id, title=title, body=body,
            url=url, icon=icon, target_type=target_type,
            target_value=target_value, sent_by=sent_by,
            variables_used=variables,
        )

        player_ids = self._resolve_targets(target_type, target_value)
        for pid in player_ids:
            subs = self._push_repo.get_by_player(pid)
            if not subs:
                continue
            for sub in subs:
                channel = sub.get("channel", "webpush")
                delivery_id = self._event_repo.create_delivery(event_id, pid, channel)

                if channel == "webpush":
                    self._deliver_webpush(sub, title, body, url, delivery_id)
                # PDA deliveries stay pending — picked up by polling

        logger.info("Dispatched event %d (%s) to %d players", event_id, target_type, len(player_ids))
        return event_id

    def _resolve_targets(self, target_type: str, target_value: str | None) -> list[int]:
        if target_type == "player":
            return [int(target_value)] if target_value else []
        elif target_type == "all":
            subs = self._push_repo.get_all_subscribers()
            return list({s["player_id"] for s in subs})
        elif target_type == "group":
            return self._group_repo.get_player_ids(int(target_value)) if target_value else []
        elif target_type == "role":
            if target_value == "admin" and self._key_store:
                admins = self._key_store.get_admins()
                return [a["player_id"] for a in admins]
            elif target_value == "member" and self._key_store:
                keys = self._key_store.get_all_keys()
                return [k["player_id"] for k in keys]
            return []
        elif target_type == "preference":
            subs = self._push_repo.get_by_preference(target_value) if target_value else []
            return list({s["player_id"] for s in subs})
        return []

    def _deliver_webpush(self, sub: dict, title: str, body: str, url: str | None, delivery_id: int) -> None:
        if not self._push_service or not self._push_service.enabled:
            return
        try:
            self._push_service._send_to_subs([sub], title, body, url or "/notifications")
            self._event_repo.mark_delivered(delivery_id)
        except Exception as e:
            self._event_repo.mark_failed(delivery_id, str(e))
            logger.warning("WebPush delivery %d failed: %s", delivery_id, e)
```

- [ ] **Step 4: Add `get_all_subscribers` to PushRepository**

Add to `api/db/repos/push_repository.py` after the `get_by_player_and_preference` method (after line 54):

```python
    def get_all_subscribers(self) -> list[dict]:
        rows = self.execute("SELECT * FROM push_subscriptions")
        return [dict(r) for r in rows]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_notification_dispatcher.py -v`
Expected: PASS (all 7 tests)

- [ ] **Step 6: Run all existing push tests to verify no regressions**

Run: `uv run pytest tests/test_push_service.py tests/test_push_repo.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add api/notification_dispatcher.py api/db/repos/push_repository.py tests/test_notification_dispatcher.py
git commit -m "feat: NotificationDispatcher — unified push routing for WebPush and PDA"
```

---

## Task 6: PDA Endpoints in Push Router

**Files:**
- Modify: `api/routers/push.py`
- Create: `tests/test_pda_endpoints.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_pda_endpoints.py
import os
import json
import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from api.db.migrations.runner import run_migrations
from api.db.repos.push_repository import PushRepository
from api.db.repos.notification_events import NotificationEventRepository


@pytest.fixture
def repos(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    push_repo = PushRepository(db_path=db_path)
    event_repo = NotificationEventRepository(db_path=db_path)
    return push_repo, event_repo


@pytest.fixture
def client(repos):
    from fastapi import FastAPI
    from api.routers import push as push_mod
    push_repo, event_repo = repos
    push_mod.push_repo = push_repo
    push_mod.event_repo = event_repo
    push_mod.push_service = MagicMock(enabled=True)
    push_mod.vapid_public_key = "test-key"

    app = FastAPI()
    app.include_router(push_mod.router)
    return TestClient(app)


def test_pda_register(client, repos):
    push_repo, _ = repos
    resp = client.post("/api/push/pda/register", headers={"X-Player-Id": "123"})
    assert resp.status_code == 200
    subs = push_repo.get_by_player(123)
    assert len(subs) == 1
    assert subs[0]["channel"] == "pda"
    assert subs[0]["endpoint"] == "pda:123"


def test_pda_register_idempotent(client, repos):
    push_repo, _ = repos
    client.post("/api/push/pda/register", headers={"X-Player-Id": "123"})
    client.post("/api/push/pda/register", headers={"X-Player-Id": "123"})
    subs = push_repo.get_by_player(123)
    assert len(subs) == 1


def test_pda_poll_empty(client):
    resp = client.get("/api/push/pda/poll", headers={"X-Player-Id": "123"})
    assert resp.status_code == 200
    assert resp.json()["events"] == []


def test_pda_poll_returns_pending(client, repos):
    _, event_repo = repos
    eid = event_repo.create_event(
        template_id=None, title="War!", body="Get ready", url="/wars", icon=None,
        target_type="all", target_value=None, sent_by="system", variables_used={},
    )
    event_repo.create_delivery(eid, player_id=123, channel="pda")

    resp = client.get("/api/push/pda/poll", headers={"X-Player-Id": "123"})
    data = resp.json()
    assert len(data["events"]) == 1
    assert data["events"][0]["title"] == "War!"

    # Second poll should be empty (marked delivered)
    resp2 = client.get("/api/push/pda/poll", headers={"X-Player-Id": "123"})
    assert resp2.json()["events"] == []


def test_pda_unregister(client, repos):
    push_repo, _ = repos
    client.post("/api/push/pda/register", headers={"X-Player-Id": "123"})
    resp = client.delete("/api/push/pda/unregister", headers={"X-Player-Id": "123"})
    assert resp.status_code == 200
    assert push_repo.get_by_player(123) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_pda_endpoints.py -v`
Expected: FAIL — missing `event_repo` attribute on push module and missing endpoints

- [ ] **Step 3: Add PDA endpoints to push router**

Add to `api/routers/push.py`. First add the module-level variable at the top (after line 11):

```python
event_repo = None  # Set by main.py — NotificationEventRepository
```

Then add these endpoints after the existing `unsubscribe` endpoint:

```python
# ── PDA Channel ─────────────────────────────────────────────
@router.post("/api/push/pda/register")
async def pda_register(x_player_id: int = Header()):
    """Register PDA as notification channel for this player."""
    sentinel_endpoint = f"pda:{x_player_id}"
    push_repo.save(
        player_id=x_player_id,
        endpoint=sentinel_endpoint,
        p256dh="",
        auth="",
        preferences={"loot_level4": True, "war_start": True, "stakeout_change": True},
    )
    # Set channel to pda (save() defaults to webpush)
    push_repo.mutate(
        "UPDATE push_subscriptions SET channel = 'pda' WHERE endpoint = ?",
        (sentinel_endpoint,),
    )
    return {"status": "ok"}


@router.get("/api/push/pda/poll")
async def pda_poll(x_player_id: int = Header()):
    """Get pending notifications for this PDA player. Marks them as delivered."""
    if not event_repo:
        return {"events": []}
    pending = event_repo.get_pending_pda(x_player_id)
    for p in pending:
        event_repo.mark_delivered(p["delivery_id"])
    return {
        "events": [
            {
                "event_id": p["event_id"],
                "title": p["title"],
                "body": p["body"],
                "url": p["url"],
                "icon": p["icon"],
                "created_at": p["created_at"],
            }
            for p in pending
        ]
    }


@router.delete("/api/push/pda/unregister")
async def pda_unregister(x_player_id: int = Header()):
    """Unregister PDA channel for this player."""
    push_repo.delete_by_endpoint(f"pda:{x_player_id}")
    return {"status": "ok"}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_pda_endpoints.py -v`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Run all push tests**

Run: `uv run pytest tests/test_push_repo.py tests/test_push_service.py tests/test_pda_endpoints.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add api/routers/push.py tests/test_pda_endpoints.py
git commit -m "feat: PDA register/poll/unregister endpoints for Torn PDA push channel"
```

---

## Task 7: Admin Push Router

**Files:**
- Create: `api/routers/admin_push.py`
- Create: `tests/test_admin_push_routes.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_admin_push_routes.py
import os
import json
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from api.db.migrations.runner import run_migrations
from api.db.repos.notification_templates import NotificationTemplateRepository
from api.db.repos.notification_events import NotificationEventRepository
from api.db.repos.custom_groups import CustomGroupRepository
from api.db.repos.push_repository import PushRepository


@pytest.fixture
def repos(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return {
        "template_repo": NotificationTemplateRepository(db_path=db_path),
        "event_repo": NotificationEventRepository(db_path=db_path),
        "group_repo": CustomGroupRepository(db_path=db_path),
        "push_repo": PushRepository(db_path=db_path),
    }


@pytest.fixture
def client(repos):
    from fastapi import FastAPI
    from api.routers import admin_push as admin_push_mod

    admin_push_mod.template_repo = repos["template_repo"]
    admin_push_mod.event_repo = repos["event_repo"]
    admin_push_mod.group_repo = repos["group_repo"]

    dispatcher = MagicMock()
    dispatcher.send.return_value = 1
    admin_push_mod.dispatcher = dispatcher

    # Mock auth — patch require_admin to return a fake admin
    app = FastAPI()

    from api.routers.admin_push import router
    app.include_router(router)

    with patch("api.routers.admin_push.require_admin", return_value={"sub": 2362436, "role": "superadmin"}):
        yield TestClient(app)


def test_list_templates(client):
    resp = client.get("/api/admin/push/templates")
    assert resp.status_code == 200
    assert len(resp.json()["templates"]) >= 4  # seeded templates


def test_create_template(client):
    resp = client.post("/api/admin/push/templates", json={
        "name": "New Template",
        "title_template": "Hello {{name}}",
        "body_template": "Welcome {{name}}",
        "url_template": "/welcome",
    })
    assert resp.status_code == 200
    assert resp.json()["id"] > 0


def test_send_notification(client):
    resp = client.post("/api/admin/push/send", json={
        "title": "Test notification",
        "body": "Test body",
        "url": "/test",
        "target_type": "all",
    })
    assert resp.status_code == 200
    assert resp.json()["event_id"] == 1


def test_send_test_to_self(client):
    resp = client.post("/api/admin/push/test")
    assert resp.status_code == 200


def test_list_history(client, repos):
    repos["event_repo"].create_event(
        template_id=None, title="T", body="B", url=None, icon=None,
        target_type="all", target_value=None, sent_by="system", variables_used={},
    )
    resp = client.get("/api/admin/push/history")
    assert resp.status_code == 200
    assert len(resp.json()["events"]) >= 1


def test_create_group(client):
    resp = client.post("/api/admin/push/groups", json={
        "name": "War Team",
        "description": "Active war fighters",
        "member_ids": [100, 200],
    })
    assert resp.status_code == 200
    assert resp.json()["id"] > 0


def test_list_groups(client):
    resp = client.get("/api/admin/push/groups")
    assert resp.status_code == 200
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_admin_push_routes.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement the admin push router**

```python
# api/routers/admin_push.py
from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from api.admin import require_admin

logger = logging.getLogger("tm-hub.admin-push")

router = APIRouter(prefix="/api/admin/push", tags=["admin-push"])

# Set by main.py during startup
template_repo = None
event_repo = None
group_repo = None
dispatcher = None


# ── Pydantic models ─────────────────────────────────────────

class TemplateCreate(BaseModel):
    name: str
    title_template: str
    body_template: str
    url_template: str | None = None
    icon: str | None = None


class TemplateUpdate(BaseModel):
    name: str | None = None
    title_template: str | None = None
    body_template: str | None = None
    url_template: str | None = None
    icon: str | None = None


class SendNotification(BaseModel):
    template_id: int | None = None
    title: str | None = None
    body: str | None = None
    url: str | None = None
    icon: str | None = None
    target_type: str = "all"
    target_value: str | None = None
    variables: dict | None = None


class GroupCreate(BaseModel):
    name: str
    description: str | None = None
    member_ids: list[int] = []


class GroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    add_members: list[int] = []
    remove_members: list[int] = []


# ── Templates ────────────────────────────────────────────────

@router.get("/templates")
async def list_templates(admin: dict = Depends(require_admin)):
    return {"templates": template_repo.get_all()}


@router.post("/templates")
async def create_template(body: TemplateCreate, admin: dict = Depends(require_admin)):
    tid = template_repo.create(
        name=body.name,
        title_template=body.title_template,
        body_template=body.body_template,
        url_template=body.url_template,
        icon=body.icon,
        created_by=admin["sub"],
    )
    return {"id": tid}


@router.put("/templates/{template_id}")
async def update_template(template_id: int, body: TemplateUpdate, admin: dict = Depends(require_admin)):
    if not template_repo.get_by_id(template_id):
        raise HTTPException(status_code=404, detail="Template not found")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    template_repo.update(template_id, **fields)
    return {"status": "ok"}


@router.delete("/templates/{template_id}")
async def delete_template(template_id: int, admin: dict = Depends(require_admin)):
    if not template_repo.get_by_id(template_id):
        raise HTTPException(status_code=404, detail="Template not found")
    template_repo.delete(template_id)
    return {"status": "ok"}


# ── Send ─────────────────────────────────────────────────────

@router.post("/send")
async def send_notification(body: SendNotification, admin: dict = Depends(require_admin)):
    title = body.title or ""
    body_text = body.body or ""

    # If template_id provided and title/body empty, load from template
    if body.template_id and not title and not body_text:
        tmpl = template_repo.get_by_id(body.template_id)
        if not tmpl:
            raise HTTPException(status_code=404, detail="Template not found")
        title = tmpl["title_template"]
        body_text = tmpl["body_template"]
        if not body.url and tmpl.get("url_template"):
            body.url = tmpl["url_template"]

    if not title or not body_text:
        raise HTTPException(status_code=400, detail="Title and body are required")

    if body.target_type not in ("player", "all", "role", "group", "preference"):
        raise HTTPException(status_code=400, detail="Invalid target_type")

    event_id = dispatcher.send(
        title=title,
        body=body_text,
        url=body.url,
        icon=body.icon,
        target_type=body.target_type,
        target_value=body.target_value,
        sent_by=str(admin["sub"]),
        template_id=body.template_id,
        variables=body.variables,
    )
    logger.info("Admin %d sent push event %d to %s:%s", admin["sub"], event_id, body.target_type, body.target_value)
    return {"event_id": event_id}


@router.post("/test")
async def send_test(admin: dict = Depends(require_admin)):
    """Send a test notification to the admin themselves."""
    event_id = dispatcher.send(
        title="TM Hub Test Notification",
        body="If you see this, push notifications are working!",
        url="/notifications",
        target_type="player",
        target_value=str(admin["sub"]),
        sent_by=str(admin["sub"]),
    )
    return {"event_id": event_id}


# ── History ──────────────────────────────────────────────────

@router.get("/history")
async def list_history(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin: dict = Depends(require_admin),
):
    events = event_repo.list_events(limit=limit, offset=offset)
    return {"events": events}


@router.get("/history/{event_id}")
async def get_history_detail(event_id: int, admin: dict = Depends(require_admin)):
    event = event_repo.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    deliveries = event_repo.get_deliveries_for_event(event_id)
    stats = event_repo.get_event_stats(event_id)
    return {"event": event, "deliveries": deliveries, "stats": stats}


# ── Groups ───────────────────────────────────────────────────

@router.get("/groups")
async def list_groups(admin: dict = Depends(require_admin)):
    return {"groups": group_repo.list_all()}


@router.post("/groups")
async def create_group(body: GroupCreate, admin: dict = Depends(require_admin)):
    gid = group_repo.create(body.name, body.description, created_by=admin["sub"])
    for pid in body.member_ids:
        group_repo.add_member(gid, pid)
    return {"id": gid}


@router.put("/groups/{group_id}")
async def update_group(group_id: int, body: GroupUpdate, admin: dict = Depends(require_admin)):
    if not group_repo.get_by_id(group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    if body.name or body.description is not None:
        group_repo.update(group_id, name=body.name, description=body.description)
    for pid in body.add_members:
        group_repo.add_member(group_id, pid)
    for pid in body.remove_members:
        group_repo.remove_member(group_id, pid)
    return {"status": "ok"}


@router.delete("/groups/{group_id}")
async def delete_group(group_id: int, admin: dict = Depends(require_admin)):
    if not group_repo.get_by_id(group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    group_repo.delete(group_id)
    return {"status": "ok"}


# ── Stats ────────────────────────────────────────────────────

@router.get("/stats")
async def push_stats(admin: dict = Depends(require_admin)):
    sub_stats = event_repo.get_subscription_stats()
    return {"subscriptions": sub_stats}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_admin_push_routes.py -v`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add api/routers/admin_push.py tests/test_admin_push_routes.py
git commit -m "feat: admin push router — templates, send, history, groups, stats"
```

---

## Task 8: Wire Everything in main.py + Fix Chat Bug

**Files:**
- Modify: `api/main.py:137-179`
- Modify: `api/routers/chat.py:668-680`

- [ ] **Step 1: Wire new repos, dispatcher, and router in main.py**

After the existing push_service initialization block (line 150: `push_mod.push_service = push_service`), add:

```python
    from api.db.repos.notification_templates import NotificationTemplateRepository
    from api.db.repos.notification_events import NotificationEventRepository
    from api.db.repos.custom_groups import CustomGroupRepository
    from api.notification_dispatcher import NotificationDispatcher

    template_repo = NotificationTemplateRepository(db_path="data/keys.db")
    event_repo = NotificationEventRepository(db_path="data/keys.db")
    group_repo = CustomGroupRepository(db_path="data/keys.db")
    push_mod.event_repo = event_repo

    notification_dispatcher = NotificationDispatcher(
        push_service=push_service,
        push_repo=push_repo,
        event_repo=event_repo,
        group_repo=group_repo,
        key_store=key_store,
    )

    from api.routers import admin_push as admin_push_mod
    admin_push_mod.template_repo = template_repo
    admin_push_mod.event_repo = event_repo
    admin_push_mod.group_repo = group_repo
    admin_push_mod.dispatcher = notification_dispatcher
    chat_mod.notification_dispatcher = notification_dispatcher
```

Then in the router includes section (after `app.include_router(admin_router)` on line 189), add:

```python
from api.routers.admin_push import router as admin_push_router
app.include_router(admin_push_router)
```

- [ ] **Step 2: Fix the broken chat push call**

In `api/routers/chat.py`, find the `_notify_mentions` function. The broken call at line 677 is:

```python
            push_service.send_to_player(
                pid, title=f"@{sender_name} mentioned you",
                body=preview, url=f"/chat?channel={channel_id}",
            )
```

Add a module-level variable at the top of `chat.py` (near the other module vars around line 22):

```python
notification_dispatcher = None  # Set by main.py
```

Replace the broken call in `_notify_mentions` with:

```python
            if notification_dispatcher:
                notification_dispatcher.send(
                    title=f"@{sender_name} mentioned you",
                    body=preview,
                    url=f"/chat?channel={channel_id}",
                    target_type="player",
                    target_value=str(pid),
                    sent_by="system",
                )
            elif push_service:
                push_service.dispatch_to_player(
                    pid, "chat_mention",
                    f"@{sender_name} mentioned you",
                    preview, f"/chat?channel={channel_id}",
                )
```

- [ ] **Step 3: Run full test suite**

Run: `uv run pytest tests/ -v`
Expected: PASS (all tests)

- [ ] **Step 4: Commit**

```bash
git add api/main.py api/routers/chat.py
git commit -m "feat: wire NotificationDispatcher in main.py, fix chat mention push bug"
```

---

## Task 9: Remove OC Ready Event from Frontend

**Files:**
- Modify: `frontend/src/hooks/usePushNotifications.ts:6,8-21`

- [ ] **Step 1: Remove oc_ready from type and defaults**

In `frontend/src/hooks/usePushNotifications.ts`:

Change line 6 from:
```typescript
export type PushEvent = 'loot_level4' | 'war_start' | 'stakeout_change' | 'oc_ready';
```
to:
```typescript
export type PushEvent = 'loot_level4' | 'war_start' | 'stakeout_change';
```

Change lines 8-21 from:
```typescript
export interface PushPreferences {
  loot_level4: boolean;
  war_start: boolean;
  stakeout_change: boolean;
  oc_ready: boolean;
  [key: string]: boolean;
}

const DEFAULT_PREFERENCES: PushPreferences = {
  loot_level4: true,
  war_start: true,
  stakeout_change: true,
  oc_ready: true,
};
```
to:
```typescript
export interface PushPreferences {
  loot_level4: boolean;
  war_start: boolean;
  stakeout_change: boolean;
  [key: string]: boolean;
}

const DEFAULT_PREFERENCES: PushPreferences = {
  loot_level4: true,
  war_start: true,
  stakeout_change: true,
};
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/usePushNotifications.ts
git commit -m "fix: remove unused oc_ready event from push preferences"
```

---

## Task 10: PDA Detection Hook & Context

**Files:**
- Create: `frontend/src/hooks/useTornPDA.ts`
- Create: `frontend/src/contexts/PDAContext.tsx`

- [ ] **Step 1: Create the PDA detection hook**

```typescript
// frontend/src/hooks/useTornPDA.ts
'use client';

import { useState, useEffect } from 'react';

interface TornPDABridge {
  callHandler: (name: string, ...args: unknown[]) => Promise<unknown>;
}

interface TornPDAState {
  isPDA: boolean;
  bridge: TornPDABridge | null;
}

declare global {
  interface Window {
    flutter_inappwebview?: TornPDABridge;
  }
}

export function useTornPDA(): TornPDAState {
  const [state, setState] = useState<TornPDAState>({ isPDA: false, bridge: null });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.flutter_inappwebview) return;

    window.flutter_inappwebview.callHandler('isTornPDA')
      .then((result: unknown) => {
        const r = result as { isTornPDA?: boolean } | null;
        if (r?.isTornPDA) {
          setState({ isPDA: true, bridge: window.flutter_inappwebview! });
        }
      })
      .catch(() => {});
  }, []);

  return state;
}
```

- [ ] **Step 2: Create the PDA context provider**

```typescript
// frontend/src/contexts/PDAContext.tsx
'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useTornPDA } from '@/hooks/useTornPDA';

interface TornPDABridge {
  callHandler: (name: string, ...args: unknown[]) => Promise<unknown>;
}

interface PDAContextValue {
  isPDA: boolean;
  bridge: TornPDABridge | null;
}

const PDAContext = createContext<PDAContextValue>({ isPDA: false, bridge: null });

export function PDAProvider({ children }: { children: ReactNode }) {
  const pda = useTornPDA();
  return <PDAContext.Provider value={pda}>{children}</PDAContext.Provider>;
}

export function usePDA(): PDAContextValue {
  return useContext(PDAContext);
}
```

- [ ] **Step 3: Wrap AppShell with PDAProvider**

In `frontend/src/components/layout/AppShell.tsx`, add import at the top:

```typescript
import { PDAProvider } from '@/contexts/PDAContext';
```

Wrap the return JSX with `<PDAProvider>...</PDAProvider>` as the outermost element inside the component's return.

- [ ] **Step 4: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useTornPDA.ts frontend/src/contexts/PDAContext.tsx frontend/src/components/layout/AppShell.tsx
git commit -m "feat: Torn PDA detection hook and context provider"
```

---

## Task 11: PDA Polling Hook

**Files:**
- Create: `frontend/src/hooks/usePDAPolling.ts`
- Modify: `frontend/src/lib/api-client.ts`

- [ ] **Step 1: Add PDA API functions to api-client**

Add after the `pushUnsubscribe` line (line 132) in `frontend/src/lib/api-client.ts`:

```typescript
  // ── PDA Push ─────────────────────────────────────────────
  pdaRegister: () =>
    apiFetch<{ status: string }>('/api/push/pda/register', { method: 'POST' }),
  pdaPoll: () =>
    apiFetch<{ events: { event_id: number; title: string; body: string; url: string | null; icon: string | null; created_at: string }[] }>('/api/push/pda/poll'),
  pdaUnregister: () =>
    apiFetch<{ status: string }>('/api/push/pda/unregister', { method: 'DELETE' }),
```

- [ ] **Step 2: Create the PDA polling hook**

```typescript
// frontend/src/hooks/usePDAPolling.ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { usePDA } from '@/contexts/PDAContext';

const POLL_INTERVAL = 15_000; // 15 seconds

export function usePDAPolling() {
  const { isPDA, bridge } = usePDA();
  const [registered, setRegistered] = useState(false);
  const [missedCount, setMissedCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-register on PDA detection
  useEffect(() => {
    if (!isPDA) return;
    api.pdaRegister()
      .then(() => setRegistered(true))
      .catch(() => {});
  }, [isPDA]);

  // Start polling when registered
  useEffect(() => {
    if (!isPDA || !registered || !bridge) return;

    const poll = async () => {
      try {
        const data = await api.pdaPoll();
        if (data.events.length > 0) {
          setMissedCount(data.events.length);
          for (const event of data.events) {
            bridge.callHandler('scheduleNotification', {
              title: event.title,
              id: event.event_id % 10000,
              timestamp: Date.now() + 1000,
              subtitle: event.body,
              urlCallback: event.url ? `https://hub.tri.ovh${event.url}` : 'https://hub.tri.ovh/notifications',
            });
          }
        }
      } catch {
        // silent — network errors are expected
      }
    };

    // Initial poll (catch-up)
    poll();

    intervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPDA, registered, bridge]);

  return { isPDA, registered, missedCount };
}
```

- [ ] **Step 3: Activate PDA polling in AppShell**

In `frontend/src/components/layout/AppShell.tsx`, add import:

```typescript
import { usePDAPolling } from '@/hooks/usePDAPolling';
```

Inside the component, add the hook call (after other hooks):

```typescript
  usePDAPolling();
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/usePDAPolling.ts frontend/src/lib/api-client.ts frontend/src/components/layout/AppShell.tsx
git commit -m "feat: PDA polling daemon with scheduleNotification bridge"
```

---

## Task 12: Adapt Notifications Page for PDA

**Files:**
- Modify: `frontend/src/app/notifications/page.tsx`

- [ ] **Step 1: Add PDA detection to notifications page**

At the top of `frontend/src/app/notifications/page.tsx`, add import:

```typescript
import { usePDA } from '@/contexts/PDAContext';
```

Inside the `NotificationsPage` component, after the `push` hook call (line 44), add:

```typescript
  const { isPDA } = usePDA();
```

- [ ] **Step 2: Replace the Push Settings section with PDA-aware version**

Replace the entire push settings card (lines 88-154) with:

```tsx
        {/* Push Notification Settings */}
        <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Push Notifications</h2>
              <p className="text-[10px] text-text-muted mt-0.5">
                {isPDA ? 'Native notifications via Torn PDA.' : 'Get alerts even when the app is closed.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isPDA ? (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-green/15 text-torn-green font-medium">Connected via PDA</span>
              ) : push.permission === 'granted' && push.subscribed ? (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-green/15 text-torn-green font-medium">Enabled</span>
              ) : push.permission === 'denied' ? (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-red/15 text-torn-red font-medium">Blocked</span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-yellow/15 text-torn-yellow font-medium">Disabled</span>
              )}
            </div>
          </div>

          {isPDA ? (
            <div className="space-y-2">
              <p className="text-[10px] text-text-muted uppercase">Notify me about:</p>
              {[
                { key: 'loot_level4' as const, label: 'NPC Loot Level 4+', desc: 'When an NPC reaches loot level 4 or higher' },
                { key: 'war_start' as const, label: 'War Started', desc: 'When a ranked war begins' },
                { key: 'stakeout_change' as const, label: 'Stakeout Alert', desc: 'When a stakeout target changes status' },
              ].map(({ key, label, desc }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={push.preferences[key]}
                    onChange={() => push.updatePreferences({ ...push.preferences, [key]: !push.preferences[key] })}
                    className="w-4 h-4 rounded border-text-secondary/30 text-torn-green focus:ring-torn-green/50" />
                  <div>
                    <p className="text-xs font-medium text-text-primary group-hover:text-torn-green transition-colors">{label}</p>
                    <p className="text-[10px] text-text-muted">{desc}</p>
                  </div>
                </label>
              ))}
              <div className="pt-2 border-t border-border-light">
                <p className="text-[10px] text-text-muted">Notifications are delivered as native PDA alerts while the hub is open in a tab.</p>
              </div>
            </div>
          ) : !push.supported ? (
            <p className="text-xs text-text-muted">Push notifications are not supported in this browser.</p>
          ) : push.permission === 'denied' ? (
            <div className="bg-torn-red/5 border border-torn-red/20 rounded-lg p-3 text-xs text-text-secondary">
              <p className="font-medium text-torn-red mb-1">Notifications blocked</p>
              <p>You previously denied notification permission. To re-enable: click the lock icon in your browser&apos;s address bar &rarr; Notifications &rarr; Allow.</p>
            </div>
          ) : !push.subscribed ? (
            <button onClick={push.subscribe}
              className="px-4 py-2 text-sm rounded-lg bg-torn-green/15 text-torn-green font-medium hover:bg-torn-green/25 transition-colors">
              Enable Push Notifications
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] text-text-muted uppercase">Notify me about:</p>
              {[
                { key: 'loot_level4' as const, label: 'NPC Loot Level 4+', desc: 'When an NPC reaches loot level 4 or higher' },
                { key: 'war_start' as const, label: 'War Started', desc: 'When a ranked war begins' },
                { key: 'stakeout_change' as const, label: 'Stakeout Alert', desc: 'When a stakeout target changes status' },
              ].map(({ key, label, desc }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={push.preferences[key]}
                    onChange={() => push.updatePreferences({ ...push.preferences, [key]: !push.preferences[key] })}
                    className="w-4 h-4 rounded border-text-secondary/30 text-torn-green focus:ring-torn-green/50" />
                  <div>
                    <p className="text-xs font-medium text-text-primary group-hover:text-torn-green transition-colors">{label}</p>
                    <p className="text-[10px] text-text-muted">{desc}</p>
                  </div>
                </label>
              ))}
              <div className="flex gap-2 pt-2 border-t border-border-light">
                <button onClick={push.sendTest}
                  className="px-3 py-1 text-[10px] rounded text-text-secondary hover:text-text-primary border border-text-secondary/20 hover:border-text-secondary/40 transition-colors">
                  Send Test
                </button>
                <button onClick={push.unsubscribe}
                  className="px-3 py-1 text-[10px] rounded text-danger hover:text-danger/80 border border-danger/20 hover:border-danger/40 transition-colors">
                  Disable Push
                </button>
              </div>
            </div>
          )}
        </div>
```

- [ ] **Step 3: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/notifications/page.tsx
git commit -m "feat: adapt notifications page for Torn PDA detection"
```

---

## Task 13: Admin Push Panel — Tab + Send + Templates

**Files:**
- Modify: `frontend/src/app/admin/page.tsx`
- Create: `frontend/src/components/admin/PushAdmin.tsx`
- Create: `frontend/src/components/admin/push/SendNotification.tsx`
- Create: `frontend/src/components/admin/push/TemplateManager.tsx`
- Modify: `frontend/src/lib/api-client.ts` (add admin push API functions)

- [ ] **Step 1: Add admin push API functions to api-client**

Add at the end of the `api` object in `frontend/src/lib/api-client.ts`, before the closing `}`:

```typescript
  // ── Admin Push (use with adminFetch from useAdminSession) ──
  // These are called via adminFetch, not api.* — defined here as type reference only
```

Note: Admin push endpoints use `adminFetch` from `useAdminSession` hook (same pattern as existing admin components like `FeatureFlags`). No changes needed to api-client — the `adminFetch` function in each component handles the auth header.

- [ ] **Step 2: Add Push tab to admin page**

In `frontend/src/app/admin/page.tsx`:

Line 9, add import:
```typescript
import { PushAdmin } from "@/components/admin/PushAdmin";
```

Line 11, change type:
```typescript
type Tab = "analytics" | "announcements" | "spy" | "admins" | "settings" | "push";
```

After the settings entry in the tabs array (line 25), add:
```typescript
    { id: "push", label: "Push Notifications", show: true },
```

After line 50 (`{tab === "settings" && <FeatureFlags adminFetch={adminFetch} />}`), add:
```typescript
        {tab === "push" && <PushAdmin adminFetch={adminFetch} />}
```

- [ ] **Step 3: Create PushAdmin component (tab container)**

```typescript
// frontend/src/components/admin/PushAdmin.tsx
'use client';

import { useState } from 'react';
import { SendNotification } from './push/SendNotification';
import { TemplateManager } from './push/TemplateManager';
import { GroupManager } from './push/GroupManager';
import { PushHistory } from './push/PushHistory';

type SubTab = 'send' | 'templates' | 'groups' | 'history';

interface PushAdminProps {
  adminFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}

export function PushAdmin({ adminFetch }: PushAdminProps) {
  const [subTab, setSubTab] = useState<SubTab>('send');

  const subTabs: { id: SubTab; label: string }[] = [
    { id: 'send', label: 'Send' },
    { id: 'templates', label: 'Templates' },
    { id: 'groups', label: 'Groups' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div>
      <div className="flex gap-3 mb-4">
        {subTabs.map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              subTab === t.id
                ? 'bg-torn-green/15 text-torn-green'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {subTab === 'send' && <SendNotification adminFetch={adminFetch} />}
      {subTab === 'templates' && <TemplateManager adminFetch={adminFetch} />}
      {subTab === 'groups' && <GroupManager adminFetch={adminFetch} />}
      {subTab === 'history' && <PushHistory adminFetch={adminFetch} />}
    </div>
  );
}
```

- [ ] **Step 4: Create SendNotification component**

```typescript
// frontend/src/components/admin/push/SendNotification.tsx
'use client';

import { useState, useEffect } from 'react';

interface Template {
  id: number;
  name: string;
  title_template: string;
  body_template: string;
  url_template: string | null;
  variables: string; // JSON array
}

interface SendNotificationProps {
  adminFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}

export function SendNotification({ adminFetch }: SendNotificationProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [targetType, setTargetType] = useState<string>('all');
  const [targetValue, setTargetValue] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    adminFetch<{ templates: Template[] }>('/api/admin/push/templates').then(d => setTemplates(d.templates)).catch(() => {});
    adminFetch<{ groups: { id: number; name: string }[] }>('/api/admin/push/groups').then(d => setGroups(d.groups)).catch(() => {});
  }, [adminFetch]);

  const handleTemplateChange = (id: string) => {
    const tid = id === '' ? null : Number(id);
    setSelectedTemplate(tid);
    if (tid) {
      const tmpl = templates.find(t => t.id === tid);
      if (tmpl) {
        setTitle(tmpl.title_template);
        setBody(tmpl.body_template);
        setUrl(tmpl.url_template || '');
        const vars = JSON.parse(tmpl.variables) as string[];
        setVariables(Object.fromEntries(vars.map(v => [v, variables[v] || ''])));
      }
    }
  };

  const resolvePreview = (text: string) =>
    text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const resp = await adminFetch<{ event_id: number }>('/api/admin/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplate,
          title, body, url: url || undefined,
          target_type: targetType,
          target_value: targetValue || undefined,
          variables,
        }),
      });
      setResult(`Sent! Event #${resp.event_id}`);
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setSending(false);
    }
  };

  const handleTestSend = async () => {
    setSending(true);
    setResult(null);
    try {
      await adminFetch('/api/admin/push/test', { method: 'POST' });
      setResult('Test notification sent to you!');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setSending(false);
    }
  };

  const detectedVars = [...new Set([...(title + body + url).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-text-primary">Send Notification</h3>

      {/* Template selector */}
      <div>
        <label className="text-xs text-text-muted block mb-1">Template</label>
        <select value={selectedTemplate ?? ''} onChange={e => handleTemplateChange(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary">
          <option value="">Custom (no template)</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {/* Title & Body */}
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="text-xs text-text-muted block mb-1">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary"
            placeholder="Notification title..." />
        </div>
        <div>
          <label className="text-xs text-text-muted block mb-1">Body</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={3}
            className="w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary resize-none"
            placeholder="Notification body..." />
        </div>
        <div>
          <label className="text-xs text-text-muted block mb-1">URL (optional)</label>
          <input value={url} onChange={e => setUrl(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary"
            placeholder="/wars, /chain, etc." />
        </div>
      </div>

      {/* Variables */}
      {detectedVars.length > 0 && (
        <div className="bg-bg-elevated rounded-lg border border-border p-3 space-y-2">
          <p className="text-xs text-text-muted font-medium">Variables</p>
          {detectedVars.map(v => (
            <div key={v} className="flex items-center gap-2">
              <span className="text-xs text-text-secondary font-mono w-32">{`{{${v}}}`}</span>
              <input value={variables[v] || ''} onChange={e => setVariables(prev => ({ ...prev, [v]: e.target.value }))}
                className="flex-1 px-2 py-1 text-xs bg-bg-card border border-border rounded text-text-primary"
                placeholder={`Value for ${v}`} />
            </div>
          ))}
        </div>
      )}

      {/* Target */}
      <div>
        <label className="text-xs text-text-muted block mb-1">Send to</label>
        <div className="space-y-2">
          {[
            { value: 'all', label: 'All subscribers' },
            { value: 'player', label: 'Specific player' },
            { value: 'role', label: 'By role' },
            { value: 'group', label: 'By group' },
            { value: 'preference', label: 'By preference' },
          ].map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="target" value={value} checked={targetType === value}
                onChange={e => { setTargetType(e.target.value); setTargetValue(''); }}
                className="text-torn-green focus:ring-torn-green/50" />
              <span className="text-sm text-text-primary">{label}</span>
            </label>
          ))}
        </div>

        {targetType === 'player' && (
          <input value={targetValue} onChange={e => setTargetValue(e.target.value)}
            className="mt-2 w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary"
            placeholder="Player ID" />
        )}
        {targetType === 'role' && (
          <select value={targetValue} onChange={e => setTargetValue(e.target.value)}
            className="mt-2 w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary">
            <option value="">Select role...</option>
            <option value="admin">Admins</option>
            <option value="member">All members</option>
          </select>
        )}
        {targetType === 'group' && (
          <select value={targetValue} onChange={e => setTargetValue(e.target.value)}
            className="mt-2 w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary">
            <option value="">Select group...</option>
            {groups.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
          </select>
        )}
        {targetType === 'preference' && (
          <select value={targetValue} onChange={e => setTargetValue(e.target.value)}
            className="mt-2 w-full px-3 py-2 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary">
            <option value="">Select preference...</option>
            <option value="loot_level4">Loot Level 4+</option>
            <option value="war_start">War Started</option>
            <option value="stakeout_change">Stakeout Alert</option>
          </select>
        )}
      </div>

      {/* Preview */}
      {(title || body) && (
        <div className="bg-bg-elevated rounded-lg border border-border p-3">
          <p className="text-[10px] text-text-muted uppercase mb-2">Preview</p>
          <p className="text-sm font-medium text-text-primary">{resolvePreview(title)}</p>
          <p className="text-xs text-text-secondary mt-1">{resolvePreview(body)}</p>
          {url && <p className="text-[10px] text-torn-blue mt-1">{resolvePreview(url)}</p>}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={handleSend} disabled={sending || !title.trim() || !body.trim()}
          className="px-4 py-2 text-sm rounded-lg bg-torn-green/15 text-torn-green font-medium hover:bg-torn-green/25 transition-colors disabled:opacity-50">
          {sending ? 'Sending...' : 'Send Notification'}
        </button>
        <button onClick={handleTestSend} disabled={sending}
          className="px-4 py-2 text-sm rounded-lg text-text-secondary border border-text-secondary/20 hover:border-text-secondary/40 transition-colors disabled:opacity-50">
          Send Test to Me
        </button>
      </div>

      {result && (
        <p className={`text-xs ${result.startsWith('Error') ? 'text-torn-red' : 'text-torn-green'}`}>{result}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create TemplateManager component**

```typescript
// frontend/src/components/admin/push/TemplateManager.tsx
'use client';

import { useState, useEffect } from 'react';

interface Template {
  id: number;
  name: string;
  title_template: string;
  body_template: string;
  url_template: string | null;
  variables: string;
  created_at: string;
}

interface TemplateManagerProps {
  adminFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}

export function TemplateManager({ adminFetch }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', title_template: '', body_template: '', url_template: '' });

  const load = () => {
    adminFetch<{ templates: Template[] }>('/api/admin/push/templates').then(d => setTemplates(d.templates)).catch(() => {});
  };

  useEffect(() => { load(); }, [adminFetch]);

  const handleSave = async () => {
    if (editing) {
      await adminFetch(`/api/admin/push/templates/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    } else {
      await adminFetch('/api/admin/push/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    }
    setEditing(null);
    setCreating(false);
    setForm({ name: '', title_template: '', body_template: '', url_template: '' });
    load();
  };

  const handleDelete = async (id: number) => {
    await adminFetch(`/api/admin/push/templates/${id}`, { method: 'DELETE' });
    load();
  };

  const startEdit = (t: Template) => {
    setEditing(t);
    setCreating(true);
    setForm({ name: t.name, title_template: t.title_template, body_template: t.body_template, url_template: t.url_template || '' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">Templates</h3>
        {!creating && (
          <button onClick={() => { setCreating(true); setEditing(null); setForm({ name: '', title_template: '', body_template: '', url_template: '' }); }}
            className="px-3 py-1.5 text-xs rounded-lg bg-torn-green/15 text-torn-green font-medium hover:bg-torn-green/25 transition-colors">
            + New Template
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-bg-elevated rounded-lg border border-border p-4 space-y-3">
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded-lg text-text-primary" placeholder="Template name" />
          <input value={form.title_template} onChange={e => setForm(p => ({ ...p, title_template: e.target.value }))}
            className="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded-lg text-text-primary" placeholder="Title template (use {{var}})" />
          <textarea value={form.body_template} onChange={e => setForm(p => ({ ...p, body_template: e.target.value }))} rows={2}
            className="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded-lg text-text-primary resize-none" placeholder="Body template" />
          <input value={form.url_template} onChange={e => setForm(p => ({ ...p, url_template: e.target.value }))}
            className="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded-lg text-text-primary" placeholder="URL template (optional)" />
          <div className="flex gap-2">
            <button onClick={handleSave} className="px-3 py-1.5 text-xs rounded-lg bg-torn-green/15 text-torn-green font-medium">
              {editing ? 'Update' : 'Create'}
            </button>
            <button onClick={() => { setCreating(false); setEditing(null); }}
              className="px-3 py-1.5 text-xs rounded-lg text-text-secondary border border-text-secondary/20">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {templates.map(t => (
          <div key={t.id} className="bg-bg-elevated rounded-lg border border-border p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">{t.name}</p>
              <p className="text-xs text-text-muted mt-0.5">{t.title_template}</p>
              {t.variables && t.variables !== '[]' && (
                <p className="text-[10px] text-text-muted mt-0.5">Variables: {JSON.parse(t.variables).join(', ')}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(t)} className="text-xs text-text-secondary hover:text-text-primary">Edit</button>
              <button onClick={() => handleDelete(t.id)} className="text-xs text-danger hover:text-danger/80">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds (GroupManager and PushHistory will be created in the next task — create empty stubs for now)

Create minimal stubs:

```typescript
// frontend/src/components/admin/push/GroupManager.tsx
'use client';
export function GroupManager({ adminFetch }: { adminFetch: <T>(path: string, init?: RequestInit) => Promise<T> }) {
  return <p className="text-text-muted">Groups — coming next...</p>;
}
```

```typescript
// frontend/src/components/admin/push/PushHistory.tsx
'use client';
export function PushHistory({ adminFetch }: { adminFetch: <T>(path: string, init?: RequestInit) => Promise<T> }) {
  return <p className="text-text-muted">History — coming next...</p>;
}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/admin/page.tsx frontend/src/components/admin/PushAdmin.tsx frontend/src/components/admin/push/SendNotification.tsx frontend/src/components/admin/push/TemplateManager.tsx frontend/src/components/admin/push/GroupManager.tsx frontend/src/components/admin/push/PushHistory.tsx
git commit -m "feat: admin push panel — Send + Templates UI with tab navigation"
```

---

## Task 14: Admin Push Panel — Groups + History

**Files:**
- Modify: `frontend/src/components/admin/push/GroupManager.tsx`
- Modify: `frontend/src/components/admin/push/PushHistory.tsx`

- [ ] **Step 1: Implement GroupManager component**

Replace the stub in `frontend/src/components/admin/push/GroupManager.tsx`:

```typescript
// frontend/src/components/admin/push/GroupManager.tsx
'use client';

import { useState, useEffect } from 'react';

interface Group {
  id: number;
  name: string;
  description: string | null;
  member_count: number;
}

interface GroupManagerProps {
  adminFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}

export function GroupManager({ adminFetch }: GroupManagerProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', memberIds: '' });

  const load = () => {
    adminFetch<{ groups: Group[] }>('/api/admin/push/groups').then(d => setGroups(d.groups)).catch(() => {});
  };

  useEffect(() => { load(); }, [adminFetch]);

  const handleCreate = async () => {
    const ids = form.memberIds.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    await adminFetch('/api/admin/push/groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, description: form.description || null, member_ids: ids }),
    });
    setCreating(false);
    setForm({ name: '', description: '', memberIds: '' });
    load();
  };

  const handleDelete = async (id: number) => {
    await adminFetch(`/api/admin/push/groups/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">Custom Groups</h3>
        {!creating && (
          <button onClick={() => setCreating(true)}
            className="px-3 py-1.5 text-xs rounded-lg bg-torn-green/15 text-torn-green font-medium hover:bg-torn-green/25 transition-colors">
            + New Group
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-bg-elevated rounded-lg border border-border p-4 space-y-3">
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded-lg text-text-primary" placeholder="Group name" />
          <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            className="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded-lg text-text-primary" placeholder="Description (optional)" />
          <input value={form.memberIds} onChange={e => setForm(p => ({ ...p, memberIds: e.target.value }))}
            className="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded-lg text-text-primary"
            placeholder="Player IDs (comma-separated, e.g. 123, 456, 789)" />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!form.name.trim()}
              className="px-3 py-1.5 text-xs rounded-lg bg-torn-green/15 text-torn-green font-medium disabled:opacity-50">Create</button>
            <button onClick={() => setCreating(false)}
              className="px-3 py-1.5 text-xs rounded-lg text-text-secondary border border-text-secondary/20">Cancel</button>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-text-muted">No groups yet. Create one to target specific players.</p>
      ) : (
        <div className="space-y-2">
          {groups.map(g => (
            <div key={g.id} className="bg-bg-elevated rounded-lg border border-border p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">{g.name}</p>
                {g.description && <p className="text-xs text-text-muted mt-0.5">{g.description}</p>}
                <p className="text-[10px] text-text-muted mt-0.5">{g.member_count} member{g.member_count !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => handleDelete(g.id)} className="text-xs text-danger hover:text-danger/80">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement PushHistory component**

Replace the stub in `frontend/src/components/admin/push/PushHistory.tsx`:

```typescript
// frontend/src/components/admin/push/PushHistory.tsx
'use client';

import { useState, useEffect } from 'react';

interface Event {
  id: number;
  title: string;
  body: string;
  url: string | null;
  target_type: string;
  target_value: string | null;
  sent_by: string;
  created_at: string;
}

interface Delivery {
  id: number;
  player_id: number;
  channel: string;
  status: string;
  error_message: string | null;
  delivered_at: string | null;
}

interface EventDetail {
  event: Event;
  deliveries: Delivery[];
  stats: { delivered: number; pending: number; failed: number };
}

interface PushHistoryProps {
  adminFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}

export function PushHistory({ adminFetch }: PushHistoryProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch<{ events: Event[] }>('/api/admin/push/history')
      .then(d => setEvents(d.events))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [adminFetch]);

  const viewDetail = async (eventId: number) => {
    const d = await adminFetch<EventDetail>(`/api/admin/push/history/${eventId}`);
    setDetail(d);
  };

  if (loading) return <p className="text-text-secondary">Loading history...</p>;

  if (detail) {
    return (
      <div className="space-y-4">
        <button onClick={() => setDetail(null)} className="text-xs text-torn-blue hover:underline">&larr; Back to history</button>
        <div className="bg-bg-elevated rounded-lg border border-border p-4">
          <h4 className="text-sm font-semibold text-text-primary">{detail.event.title}</h4>
          <p className="text-xs text-text-secondary mt-1">{detail.event.body}</p>
          <div className="flex gap-4 mt-3 text-[10px] text-text-muted">
            <span>Target: {detail.event.target_type}{detail.event.target_value ? `:${detail.event.target_value}` : ''}</span>
            <span>Sent by: {detail.event.sent_by}</span>
            <span>{detail.event.created_at}</span>
          </div>
          <div className="flex gap-4 mt-2">
            <span className="text-xs text-torn-green">{detail.stats.delivered} delivered</span>
            <span className="text-xs text-torn-yellow">{detail.stats.pending} pending</span>
            <span className="text-xs text-torn-red">{detail.stats.failed} failed</span>
          </div>
        </div>

        <div className="space-y-1">
          {detail.deliveries.map(d => (
            <div key={d.id} className="flex items-center gap-3 bg-bg-elevated rounded border border-border px-3 py-2 text-xs">
              <span className="text-text-primary font-mono">{d.player_id}</span>
              <span className="text-text-muted">{d.channel}</span>
              <span className={d.status === 'delivered' ? 'text-torn-green' : d.status === 'failed' ? 'text-torn-red' : 'text-torn-yellow'}>
                {d.status}
              </span>
              {d.error_message && <span className="text-torn-red text-[10px]">{d.error_message}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-text-primary">Notification History</h3>
      {events.length === 0 ? (
        <p className="text-sm text-text-muted">No notifications sent yet.</p>
      ) : (
        <div className="space-y-2">
          {events.map(e => (
            <button key={e.id} onClick={() => viewDetail(e.id)}
              className="w-full text-left bg-bg-elevated rounded-lg border border-border p-3 hover:border-text-secondary/40 transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-text-primary">{e.title}</p>
                <span className="text-[10px] text-text-muted">{e.created_at}</span>
              </div>
              <div className="flex gap-3 mt-1 text-[10px] text-text-muted">
                <span>{e.target_type}{e.target_value ? `:${e.target_value}` : ''}</span>
                <span>by {e.sent_by}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/push/GroupManager.tsx frontend/src/components/admin/push/PushHistory.tsx
git commit -m "feat: admin push panel — Groups + History UI"
```

---

## Task 15: Migrate Scheduler Triggers to Dispatcher (Optional)

This task migrates the existing scheduler triggers (loot, war, stakeout) from direct `PushService` calls to the new `NotificationDispatcher`. This is optional for the initial release — existing triggers still work through `PushService`.

**Files:**
- Modify: `api/scheduler/jobs/refresh_data.py`
- Modify: `api/scheduler/engine.py` (pass dispatcher to state)
- Modify: `api/main.py` (pass dispatcher to scheduler state)

- [ ] **Step 1: Pass dispatcher to scheduler state in main.py**

Add `notification_dispatcher` to the scheduler state dict (around line 178):

```python
        "notification_dispatcher": notification_dispatcher,
```

- [ ] **Step 2: Update loot push trigger in refresh_data.py**

In `_check_loot_push` (lines 22-39), add dispatcher support:

Replace:
```python
            push_service.dispatch(
                "loot_level4",
                f"{name} — Loot Level {level}!",
                f"{name} reached Level {level}. Time to attack for high-value loot!",
                "/loot",
            )
```
with:
```python
            dispatcher = state.get("notification_dispatcher") if 'state' in dir() else None
            if dispatcher:
                dispatcher.send(
                    title=f"{name} — Loot Level {level}!",
                    body=f"{name} reached Level {level}. Time to attack for high-value loot!",
                    url="/loot",
                    target_type="preference",
                    target_value="loot_level4",
                    sent_by="system",
                )
            elif push_service:
                push_service.dispatch(
                    "loot_level4",
                    f"{name} — Loot Level {level}!",
                    f"{name} reached Level {level}. Time to attack for high-value loot!",
                    "/loot",
                )
```

Note: The `_check_loot_push` function signature needs to accept `state` dict. Update its signature and callers accordingly. This is a straightforward refactor — pass the full `state` dict instead of just `push_service`.

- [ ] **Step 3: Run full test suite**

Run: `uv run pytest tests/ -v`
Expected: PASS

- [ ] **Step 4: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add api/scheduler/jobs/refresh_data.py api/main.py
git commit -m "feat: migrate scheduler push triggers to NotificationDispatcher"
```

---

## Task 16: Full Integration Test + Build Verification

- [ ] **Step 1: Run complete backend test suite**

Run: `uv run pytest tests/ -v`
Expected: ALL PASS

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No errors

- [ ] **Step 4: Final commit if any fixups needed**

Only if fixups were required.

- [ ] **Step 5: Bump version in changelog**

Add version 1.4.0 entry to `frontend/src/data/changelog.ts` with:
- `feat`: Push notification admin panel with send, templates, groups, history
- `feat`: Torn PDA native notification support via JS bridge
- `fix`: Chat mention push notifications now working
- `improve`: Removed unused OC Ready event type

- [ ] **Step 6: Commit changelog**

```bash
git add frontend/src/data/changelog.ts
git commit -m "feat: bump version to 1.4.0 — push notification system"
```
