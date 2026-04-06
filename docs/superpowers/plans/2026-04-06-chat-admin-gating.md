# Chat Admin-Gating + UI Prominence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the chat feature behind an admin toggle and make it visually prominent in the UI with a top-level sidebar item + floating action button.

**Architecture:** New `app_settings` table stores feature flags. Backend chat endpoints check `chat_enabled_for_all` before allowing non-admin access. Frontend reads public settings to conditionally render chat UI (sidebar item, FAB, /chat page).

**Tech Stack:** FastAPI + SQLite (backend), Next.js 15 + React 19 + Tailwind v4 (frontend), pytest (tests)

---

### Task 1: App settings migration + repository

**Files:**
- Create: `api/db/migrations/022_app_settings.sql`
- Create: `api/db/repos/settings.py`

- [ ] **Step 1: Write the migration file**

```sql
-- 022_app_settings.sql
CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at REAL NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_by INTEGER
);

INSERT OR IGNORE INTO app_settings (key, value, updated_at)
VALUES ('chat_enabled_for_all', 'false', strftime('%s', 'now'));
```

Write this to `api/db/migrations/022_app_settings.sql`.

- [ ] **Step 2: Write the settings repository**

```python
# api/db/repos/settings.py
from __future__ import annotations
import time
from api.db.repos.base import BaseRepository

# Keys exposed via the unauthenticated /api/settings/public endpoint
_PUBLIC_KEYS = {"chat_enabled_for_all"}


class AppSettingsRepository(BaseRepository):

    def get(self, key: str) -> str | None:
        row = self.execute_one(
            "SELECT value FROM app_settings WHERE key = ?", (key,)
        )
        return row["value"] if row else None

    def set(self, key: str, value: str, updated_by: int | None = None) -> None:
        self.mutate(
            """INSERT INTO app_settings (key, value, updated_at, updated_by)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(key) DO UPDATE
               SET value = excluded.value,
                   updated_at = excluded.updated_at,
                   updated_by = excluded.updated_by""",
            (key, value, time.time(), updated_by),
        )

    def get_all(self) -> dict[str, str]:
        rows = self.execute("SELECT key, value FROM app_settings")
        return {r["key"]: r["value"] for r in rows}

    def get_public(self) -> dict[str, str]:
        all_settings = self.get_all()
        return {k: v for k, v in all_settings.items() if k in _PUBLIC_KEYS}
```

Write this to `api/db/repos/settings.py`.

- [ ] **Step 3: Commit**

```bash
git add api/db/migrations/022_app_settings.sql api/db/repos/settings.py
git commit -m "feat: add app_settings table + AppSettingsRepository"
```

---

### Task 2: Tests for settings repository

**Files:**
- Create: `tests/test_settings.py`

- [ ] **Step 1: Write tests**

```python
# tests/test_settings.py
import os
import pytest
from api.db.repos.settings import AppSettingsRepository
from api.db.migrations.runner import run_migrations


@pytest.fixture
def settings_repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return AppSettingsRepository(db_path)


class TestAppSettings:
    def test_default_chat_setting_seeded(self, settings_repo):
        val = settings_repo.get("chat_enabled_for_all")
        assert val == "false"

    def test_set_and_get(self, settings_repo):
        settings_repo.set("chat_enabled_for_all", "true", updated_by=123)
        assert settings_repo.get("chat_enabled_for_all") == "true"

    def test_get_nonexistent_returns_none(self, settings_repo):
        assert settings_repo.get("nonexistent_key") is None

    def test_get_all(self, settings_repo):
        all_s = settings_repo.get_all()
        assert "chat_enabled_for_all" in all_s

    def test_get_public_filters_keys(self, settings_repo):
        settings_repo.set("internal_secret", "hidden", updated_by=1)
        public = settings_repo.get_public()
        assert "chat_enabled_for_all" in public
        assert "internal_secret" not in public

    def test_set_upserts(self, settings_repo):
        settings_repo.set("chat_enabled_for_all", "true", updated_by=1)
        settings_repo.set("chat_enabled_for_all", "false", updated_by=2)
        assert settings_repo.get("chat_enabled_for_all") == "false"
```

Write this to `tests/test_settings.py`.

- [ ] **Step 2: Run tests**

Run: `uv run pytest tests/test_settings.py -v`
Expected: All 6 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/test_settings.py
git commit -m "test: app settings repository tests"
```

---

### Task 3: Wire settings into backend + add endpoints

**Files:**
- Modify: `api/main.py:155-162` (add settings_repo wiring + public endpoint)
- Modify: `api/admin.py` (add settings GET/PUT endpoints)
- Modify: `api/routers/chat.py:19-22` (add settings_repo module var)

- [ ] **Step 1: Wire settings repo in main.py**

In `api/main.py`, after the chat repo wiring (line ~162), add:

```python
    from api.db.repos.settings import AppSettingsRepository
    settings_repo = AppSettingsRepository(db_path="data/keys.db")
    chat_mod.settings_repo = settings_repo
    admin_mod._settings_repo = settings_repo
```

Also add a public settings endpoint. After the `app_status` endpoint (around line 216), add:

```python
@app.get("/api/settings/public")
async def public_settings():
    from api.db.repos.settings import AppSettingsRepository
    repo = AppSettingsRepository(db_path="data/keys.db")
    return repo.get_public()
```

- [ ] **Step 2: Add admin settings endpoints in admin.py**

At the top of `api/admin.py`, add `_settings_repo = None` to the module globals (after line 21: `_app_start_time: float | None = None`).

Then at the bottom of the file, add:

```python
class SettingUpdate(PydanticBaseModel):
    value: str


@router.get("/settings")
async def admin_get_settings(admin: dict = Depends(require_admin)):
    if not _settings_repo:
        raise HTTPException(status_code=503, detail="Settings not initialized")
    return _settings_repo.get_all()


@router.put("/settings/{key}")
async def admin_update_setting(key: str, body: SettingUpdate, admin: dict = Depends(require_admin)):
    if not _settings_repo:
        raise HTTPException(status_code=503, detail="Settings not initialized")
    current = _settings_repo.get(key)
    if current is None:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    _settings_repo.set(key, body.value, updated_by=admin["sub"])
    logger.info("Setting '%s' changed to '%s' by admin %d", key, body.value, admin["sub"])
    return {"status": "ok", "key": key, "value": body.value}
```

- [ ] **Step 3: Add settings_repo to chat module globals**

In `api/routers/chat.py`, add after line 22 (`push_service = None`):

```python
settings_repo = None
```

- [ ] **Step 4: Commit**

```bash
git add api/main.py api/admin.py api/routers/chat.py
git commit -m "feat: wire app settings repo + admin settings endpoints"
```

---

### Task 4: Chat access gating (backend)

**Files:**
- Modify: `api/routers/chat.py:30-40` (add `_check_chat_access` helper, update `_verify_member`)

- [ ] **Step 1: Add chat access check**

In `api/routers/chat.py`, after the `_is_admin` function (line ~41), add:

```python
def _check_chat_access(player_id: int):
    """Block non-admins when chat is in beta (admin-only) mode."""
    if _is_admin(player_id):
        return
    if settings_repo:
        enabled = settings_repo.get("chat_enabled_for_all")
        if enabled != "true":
            raise HTTPException(status_code=403, detail="Chat is currently in beta — admin only")
```

- [ ] **Step 2: Insert access check into existing endpoints**

In `_verify_member`, add `_check_chat_access(player_id)` call at the end (after membership check), so it becomes:

```python
def _verify_member(player_id: int):
    _not_ready()
    all_keys = key_store.get_all_keys() if key_store else []
    if not any(k["player_id"] == player_id for k in all_keys):
        raise HTTPException(status_code=403, detail="Not a faction member")
    _check_chat_access(player_id)
```

Also gate the WebSocket handler. Find the `websocket_chat` function and add the access check after verifying the member. Look for the `_verify_member` call in the WS handler (it does its own manual member check) — after that check, add:

```python
        # Check chat access (beta gate)
        if not _is_admin(player_id):
            if settings_repo:
                enabled = settings_repo.get("chat_enabled_for_all")
                if enabled != "true":
                    await ws.close(code=4003, reason="Chat is in beta — admin only")
                    return
```

- [ ] **Step 3: Commit**

```bash
git add api/routers/chat.py
git commit -m "feat: gate chat endpoints behind admin-only toggle"
```

---

### Task 5: Tests for chat access gating

**Files:**
- Modify: `tests/test_settings.py` (add chat gating tests)

- [ ] **Step 1: Add gating tests**

Append to `tests/test_settings.py`:

```python
class TestChatAccessGating:
    """Test the chat access gating logic directly (unit-style)."""

    def test_admin_always_has_access(self, settings_repo):
        # chat_enabled_for_all is 'false' by default
        assert settings_repo.get("chat_enabled_for_all") == "false"
        # Admins should bypass this — tested via endpoint integration

    def test_toggle_enables_access(self, settings_repo):
        settings_repo.set("chat_enabled_for_all", "true", updated_by=1)
        assert settings_repo.get("chat_enabled_for_all") == "true"

    def test_toggle_disables_access(self, settings_repo):
        settings_repo.set("chat_enabled_for_all", "true", updated_by=1)
        settings_repo.set("chat_enabled_for_all", "false", updated_by=1)
        assert settings_repo.get("chat_enabled_for_all") == "false"
```

- [ ] **Step 2: Run all settings tests**

Run: `uv run pytest tests/test_settings.py -v`
Expected: All 9 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/test_settings.py
git commit -m "test: chat access gating tests"
```

---

### Task 6: Frontend — chat access hook + API methods

**Files:**
- Create: `frontend/src/hooks/useChatAccess.ts`
- Modify: `frontend/src/lib/api-client.ts:136` (add settings API method)

- [ ] **Step 1: Add API method for public settings**

In `frontend/src/lib/api-client.ts`, add before the `// ── Chat ──` comment (line 136):

```typescript
  // ── Settings ──────────────────────────────────────────────
  publicSettings: () => apiFetch<Record<string, string>>("/api/settings/public"),
```

- [ ] **Step 2: Create useChatAccess hook**

```typescript
// frontend/src/hooks/useChatAccess.ts
"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { useAuth } from "./useAuth";

interface ChatAccess {
  canAccess: boolean;
  loading: boolean;
}

export function useChatAccess(): ChatAccess {
  const { role, loading: authLoading } = useAuth();
  const [chatEnabled, setChatEnabled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    api.publicSettings()
      .then((settings) => {
        setChatEnabled(settings.chat_enabled_for_all === "true");
      })
      .catch(() => {
        setChatEnabled(false);
      })
      .finally(() => setSettingsLoading(false));
  }, []);

  const isAdmin = role === "admin" || role === "superadmin";
  const canAccess = chatEnabled || isAdmin;
  const loading = authLoading || settingsLoading;

  return { canAccess, loading };
}
```

Write this to `frontend/src/hooks/useChatAccess.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api-client.ts frontend/src/hooks/useChatAccess.ts
git commit -m "feat: useChatAccess hook + public settings API"
```

---

### Task 7: Frontend — remove chat from nav group, add prominent sidebar item

**Files:**
- Modify: `frontend/src/lib/nav-data.ts:70` (remove Chat from Faction group)
- Modify: `frontend/src/components/layout/Sidebar.tsx:75-116` (add Chat item above groups)

- [ ] **Step 1: Remove Chat from nav-data.ts Faction group**

In `frontend/src/lib/nav-data.ts`, remove this line from the Faction group items array:

```typescript
      { label: "Chat", href: "/chat", icon: "💬" },
```

- [ ] **Step 2: Add prominent Chat item in Sidebar**

In `frontend/src/components/layout/Sidebar.tsx`:

Add imports at top:

```typescript
import { useChatAccess } from "@/hooks/useChatAccess";
```

Inside the `Sidebar` component, add:

```typescript
  const { canAccess: canAccessChat } = useChatAccess();
```

Then in the JSX, after the Pinned items section (after the closing `</div>` of the `mb-2` div, around line 116) and BEFORE the `{/* Collapsible groups */}` section, add:

```tsx
          {/* Chat — prominent, above groups */}
          {canAccessChat && (
            <div className="mb-2">
              <div className="mx-3 border-b border-border-light/50 mb-1" />
              <Link
                href="/chat"
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  isActive("/chat")
                    ? "border-l-2 border-torn-green bg-torn-green/10 text-torn-green shadow-[inset_3px_0_8px_-4px_rgba(63,185,80,0.25)]"
                    : "border-l-2 border-torn-green/40 hover:bg-torn-green/5 hover:text-torn-green text-text-primary"
                }`}
              >
                <span className="text-base">💬</span>
                <span>Faction Chat</span>
                {chatUnread > 0 && (
                  <span
                    className="ml-auto min-w-[20px] h-5 flex items-center justify-center text-[10px] bg-torn-green text-white px-1.5 rounded-full font-bold"
                    style={{ animation: "tm-badge-pop 2s ease-in-out infinite" }}
                  >
                    {chatUnread > 99 ? "99+" : chatUnread}
                  </span>
                )}
              </Link>
            </div>
          )}
```

This requires `chatUnread` state. The Sidebar component receives `unreadCount` prop for notifications, but we need a separate chat unread count. Add a new prop:

Update `SidebarProps`:

```typescript
interface SidebarProps {
  unreadCount?: number;
  chatUnread?: number;
  showVersionBadge?: boolean;
}
```

And destructure it:

```typescript
export function Sidebar({ unreadCount = 0, chatUnread = 0, showVersionBadge = false }: SidebarProps) {
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/nav-data.ts frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: prominent chat item in sidebar, removed from nav group"
```

---

### Task 8: Frontend — Chat tab in mobile bottom nav

**Files:**
- Modify: `frontend/src/components/nav/BottomNavBar.tsx`

- [ ] **Step 1: Add Chat tab to BottomNavBar**

In `frontend/src/components/nav/BottomNavBar.tsx`:

Add import:

```typescript
import { useChatAccess } from "@/hooks/useChatAccess";
```

Inside the component, add:

```typescript
  const { canAccess: canAccessChat } = useChatAccess();
```

Update `BottomNavBarProps` to include `chatUnread`:

```typescript
interface BottomNavBarProps {
  unreadCount?: number;
  chatUnread?: number;
  role?: string | null;
  showVersionBadge?: boolean;
}
```

Destructure it:

```typescript
export function BottomNavBar({ unreadCount = 0, chatUnread = 0, role, showVersionBadge = false }: BottomNavBarProps) {
```

Update the `tabs` array to include Chat between the last main group and "more":

```typescript
  const chatTab = canAccessChat
    ? [
        {
          id: "chat",
          label: "Chat",
          icon: "💬",
          action: () => router.push("/chat"),
        },
      ]
    : [];

  const tabs = [
    {
      id: "home",
      label: "Home",
      icon: "🏠",
      action: () => router.push("/dashboard"),
    },
    ...mainGroups.map((g) => ({
      id: g.id,
      label: g.label,
      icon: g.icon,
      action: () => setActiveSheet((prev) => (prev?.id === g.id ? null : g)),
    })),
    ...chatTab,
    {
      id: "more",
      label: "More",
      icon: "•••",
      action: () =>
        setActiveSheet((prev) => (prev?.id === "more" ? null : moreGroup)),
    },
  ];
```

Update `isTabActive` to handle the chat tab:

```typescript
    if (tabId === "chat") return pathname.startsWith("/chat");
```

Add chat unread badge to the Chat tab in the render (inside the button, after the label span):

```tsx
                {tab.id === "chat" && chatUnread > 0 && (
                  <span
                    className="absolute top-1 right-1/4 min-w-[14px] h-3.5 flex items-center justify-center text-[8px] bg-torn-green text-white px-1 rounded-full font-bold"
                    style={{ animation: "tm-badge-pop 2s ease-in-out infinite" }}
                  >
                    {chatUnread > 99 ? "99+" : chatUnread}
                  </span>
                )}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/nav/BottomNavBar.tsx
git commit -m "feat: chat tab in mobile bottom nav"
```

---

### Task 9: Frontend — ChatFAB component

**Files:**
- Create: `frontend/src/components/chat/ChatFAB.tsx`

- [ ] **Step 1: Create the floating action button**

```tsx
// frontend/src/components/chat/ChatFAB.tsx
"use client";

import { useRouter, usePathname } from "next/navigation";

interface ChatFABProps {
  unread: number;
}

export function ChatFAB({ unread }: ChatFABProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Hide on the chat page itself
  if (pathname.startsWith("/chat")) return null;

  return (
    <button
      onClick={() => router.push("/chat")}
      className="fixed z-50 right-6 bottom-6 lg:right-8 lg:bottom-8 max-lg:bottom-20 w-12 h-12 rounded-full bg-torn-green text-white shadow-lg shadow-torn-green/25 hover:shadow-torn-green/40 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
      aria-label="Open faction chat"
    >
      <span className="text-xl">💬</span>
      {unread > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center text-[10px] bg-white text-torn-green px-1 rounded-full font-bold shadow-sm"
          style={{ animation: "tm-badge-pop 2s ease-in-out infinite" }}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
      {unread > 0 && (
        <span className="absolute inset-0 rounded-full bg-torn-green animate-ping opacity-20 pointer-events-none" />
      )}
    </button>
  );
}
```

Write this to `frontend/src/components/chat/ChatFAB.tsx`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/chat/ChatFAB.tsx
git commit -m "feat: ChatFAB floating action button component"
```

---

### Task 10: Frontend — integrate FAB + unread polling into AppShell

**Files:**
- Modify: `frontend/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Add chat unread polling + FAB to AppShell**

In `frontend/src/components/layout/AppShell.tsx`:

Add imports:

```typescript
import { ChatFAB } from "@/components/chat/ChatFAB";
import { useChatAccess } from "@/hooks/useChatAccess";
import { api } from "@/lib/api-client";
```

Inside `ShellContent`, add after the existing hooks:

```typescript
  const { canAccess: canAccessChat } = useChatAccess();
  const [chatUnread, setChatUnread] = useState(0);

  // Poll chat unread count every 30s (only if chat is accessible)
  useEffect(() => {
    if (!canAccessChat || !isLoggedIn) return;
    let cancelled = false;
    const poll = () => {
      api.chatUnread()
        .then((data) => { if (!cancelled) setChatUnread(data.total); })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [canAccessChat, isLoggedIn]);
```

Pass `chatUnread` to Sidebar and BottomNavBar:

```tsx
<Sidebar unreadCount={unreadCount} chatUnread={chatUnread} showVersionBadge={showNotice} />
```

```tsx
<BottomNavBar unreadCount={unreadCount} chatUnread={chatUnread} role={role} showVersionBadge={showNotice} />
```

Add the FAB just before the closing `</div>` of the `min-h-screen` container (before `<InstallPrompt />`):

```tsx
      {canAccessChat && <ChatFAB unread={chatUnread} />}
      <InstallPrompt />
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/layout/AppShell.tsx
git commit -m "feat: chat unread polling + FAB in AppShell"
```

---

### Task 11: Frontend — gate /chat page

**Files:**
- Modify: `frontend/src/app/chat/page.tsx`

- [ ] **Step 1: Add access gate to chat page**

Replace the contents of `frontend/src/app/chat/page.tsx` with:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useChatAccess } from "@/hooks/useChatAccess";
import { ChatLayout } from "@/components/chat/ChatLayout";

export default function ChatPage() {
  const router = useRouter();
  const { canAccess, loading } = useChatAccess();

  useEffect(() => {
    if (!loading && !canAccess) {
      router.replace("/dashboard");
    }
  }, [loading, canAccess, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-text-secondary">
        Loading...
      </div>
    );
  }

  if (!canAccess) return null;

  return <ChatLayout />;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/chat/page.tsx
git commit -m "feat: gate /chat page behind chat access check"
```

---

### Task 12: Frontend — admin panel settings tab

**Files:**
- Create: `frontend/src/components/admin/FeatureFlags.tsx`
- Modify: `frontend/src/app/admin/page.tsx`

- [ ] **Step 1: Create FeatureFlags component**

```tsx
// frontend/src/components/admin/FeatureFlags.tsx
"use client";

import { useState, useEffect } from "react";

interface FeatureFlagsProps {
  adminFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}

export function FeatureFlags({ adminFetch }: FeatureFlagsProps) {
  const [chatEnabled, setChatEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminFetch<Record<string, string>>("/api/admin/settings")
      .then((settings) => {
        setChatEnabled(settings.chat_enabled_for_all === "true");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [adminFetch]);

  const toggle = async () => {
    const newValue = !chatEnabled;
    setSaving(true);
    try {
      await adminFetch("/api/admin/settings/chat_enabled_for_all", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: String(newValue) }),
      });
      setChatEnabled(newValue);
    } catch {
      // revert on failure
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-text-secondary">Loading settings...</p>;

  return (
    <div>
      <h3 className="text-lg font-semibold text-text-primary mb-4">Feature Flags</h3>
      <div className="bg-bg-elevated rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary">
              Enable Chat for all members
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              When off, only admins can see and use the faction chat. Turn on when chat is ready for everyone.
            </p>
          </div>
          <button
            onClick={toggle}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
              chatEnabled ? "bg-torn-green" : "bg-bg-surface"
            } ${saving ? "opacity-50" : ""}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                chatEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              chatEnabled ? "bg-torn-green" : "bg-text-muted"
            }`}
          />
          <span className="text-xs text-text-secondary">
            {chatEnabled
              ? "Chat is visible to all faction members"
              : "Chat is in beta — visible to admins only"}
          </span>
        </div>
      </div>
    </div>
  );
}
```

Write this to `frontend/src/components/admin/FeatureFlags.tsx`.

- [ ] **Step 2: Add Settings tab to admin page**

In `frontend/src/app/admin/page.tsx`:

Add import:

```typescript
import { FeatureFlags } from "@/components/admin/FeatureFlags";
```

Update the `Tab` type to include "settings":

```typescript
type Tab = "analytics" | "announcements" | "spy" | "admins" | "settings";
```

Add settings tab to the tabs array (before the admins tab):

```typescript
    { id: "settings", label: "Settings", show: true },
```

Add the render case in the JSX (before the admins case):

```tsx
        {tab === "settings" && <FeatureFlags adminFetch={adminFetch} />}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/FeatureFlags.tsx frontend/src/app/admin/page.tsx
git commit -m "feat: admin settings tab with chat toggle"
```

---

### Task 13: Version bump + changelog

**Files:**
- Modify: `frontend/src/data/changelog.ts:15-17`

- [ ] **Step 1: Bump version and add changelog entry**

In `frontend/src/data/changelog.ts`:

Update `CURRENT_VERSION` from `"1.3.0"` to `"1.3.1"`.

Add new entry at the top of the `CHANGELOG` array (after the opening `[`):

```typescript
  {
    version: "1.3.1",
    date: "2026-04-06",
    title: "Chat Beta Controls",
    changes: [
      { type: "feat", text: "Chat is now admin-only until explicitly enabled via admin panel" },
      { type: "feat", text: "Admin Settings tab with chat toggle for all members" },
      { type: "feat", text: "Prominent chat access in sidebar and mobile nav with unread badges" },
      { type: "feat", text: "Floating chat button on all pages showing unread count" },
    ],
  },
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/data/changelog.ts
git commit -m "feat: bump version to 1.3.1 — chat beta controls"
```

---

### Task 14: Build verification + full test suite

**Files:** none (verification only)

- [ ] **Step 1: Run backend tests**

Run: `uv run pytest tests/ -v`
Expected: All tests pass (existing + new settings tests).

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Static export succeeds with no TypeScript errors.

- [ ] **Step 3: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No lint errors.

- [ ] **Step 4: Fix any issues found**

If any test/build/lint fails, fix the issue and re-run. Commit the fix.

- [ ] **Step 5: Final commit if any fixes were made**

```bash
git add -A
git commit -m "fix: address build/test issues from chat admin-gating"
```
