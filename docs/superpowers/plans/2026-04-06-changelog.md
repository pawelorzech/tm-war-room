# Changelog & Version Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a changelog page, version tracking with semver, and a per-player "new version" notification (banner + nav badge) to TM Hub.

**Architecture:** Changelog data lives in a frontend TS file (`CURRENT_VERSION` + entries array). Dismissal tracking uses a new SQLite table + two lightweight API endpoints. Frontend gets a `useVersionNotice` hook consumed by AppShell (banner), Sidebar (badge), and BottomNavBar (badge). The changelog page is a new Next.js route at `/changelog`.

**Tech Stack:** FastAPI (backend), Next.js 15 / React 19 / Tailwind v4 (frontend), SQLite (dismissals)

---

### Task 1: Changelog Data File

**Files:**
- Create: `frontend/src/data/changelog.ts`

- [ ] **Step 1: Create changelog data file**

```ts
// frontend/src/data/changelog.ts

export interface ChangelogChange {
  type: "feat" | "fix" | "improve";
  text: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: ChangelogChange[];
}

export const CURRENT_VERSION = "1.1.0";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.1.0",
    date: "2026-04-06",
    title: "Real gym energy tracking & Changelog",
    changes: [
      { type: "fix", text: "Energy spent now uses real Torn API gym data instead of bogus estimates" },
      { type: "feat", text: "Changelog page with full update history" },
      { type: "feat", text: "New version notification banner — shows once per player per version" },
      { type: "improve", text: "Footer now shows clickable version linking to changelog" },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-03-28",
    title: "TM Hub Launch",
    changes: [
      { type: "feat", text: "Dashboard with faction overview and member stats" },
      { type: "feat", text: "War room with enemy tracking and threat levels" },
      { type: "feat", text: "Training guide with gym calculator and stat growth tracking" },
      { type: "feat", text: "Chain tracker, market prices, NPC loot timers" },
      { type: "feat", text: "Spy central, bounty board, target lists" },
      { type: "feat", text: "Awards tracker with circulation history" },
      { type: "feat", text: "Stocks portfolio, travel planner, company specials" },
      { type: "feat", text: "OC planner, revive tracker, stakeout system" },
      { type: "feat", text: "Push notifications, announcement system" },
      { type: "feat", text: "Admin panel with member management" },
    ],
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/data/changelog.ts
git commit -m "feat: add changelog data file with version history"
```

---

### Task 2: Backend — Dismissal Migration & Repository

**Files:**
- Create: `api/db/migrations/020_version_dismissals.sql`
- Create: `api/db/repos/version_dismissals.py`

- [ ] **Step 1: Write the test**

Create `tests/test_version.py`:

```python
import os
import sqlite3
import pytest
from api.db.repos.version_dismissals import VersionDismissalRepository

@pytest.fixture
def repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS version_dismissals (
            player_id INTEGER NOT NULL,
            version TEXT NOT NULL,
            dismissed_at TEXT NOT NULL,
            UNIQUE(player_id, version)
        )
    """)
    conn.commit()
    conn.close()
    return VersionDismissalRepository(db_path)


def test_not_dismissed_by_default(repo):
    assert repo.is_dismissed(player_id=123, version="1.1.0") is False


def test_dismiss_and_check(repo):
    repo.dismiss(player_id=123, version="1.1.0")
    assert repo.is_dismissed(player_id=123, version="1.1.0") is True


def test_dismiss_idempotent(repo):
    repo.dismiss(player_id=123, version="1.1.0")
    repo.dismiss(player_id=123, version="1.1.0")  # no error
    assert repo.is_dismissed(player_id=123, version="1.1.0") is True


def test_dismiss_scoped_to_player(repo):
    repo.dismiss(player_id=123, version="1.1.0")
    assert repo.is_dismissed(player_id=456, version="1.1.0") is False


def test_dismiss_scoped_to_version(repo):
    repo.dismiss(player_id=123, version="1.0.0")
    assert repo.is_dismissed(player_id=123, version="1.1.0") is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_version.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.db.repos.version_dismissals'`

- [ ] **Step 3: Create migration file**

```sql
-- api/db/migrations/020_version_dismissals.sql
CREATE TABLE IF NOT EXISTS version_dismissals (
    player_id INTEGER NOT NULL,
    version TEXT NOT NULL,
    dismissed_at TEXT NOT NULL,
    UNIQUE(player_id, version)
);
```

- [ ] **Step 4: Create repository**

```python
# api/db/repos/version_dismissals.py
from __future__ import annotations
from datetime import datetime, timezone
from api.db.repos.base import BaseRepository


class VersionDismissalRepository(BaseRepository):
    def is_dismissed(self, player_id: int, version: str) -> bool:
        row = self.execute_one(
            "SELECT 1 FROM version_dismissals WHERE player_id = ? AND version = ?",
            (player_id, version),
        )
        return row is not None

    def dismiss(self, player_id: int, version: str) -> None:
        self.mutate(
            """INSERT INTO version_dismissals (player_id, version, dismissed_at)
               VALUES (?, ?, ?)
               ON CONFLICT(player_id, version) DO NOTHING""",
            (player_id, version, datetime.now(timezone.utc).isoformat()),
        )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_version.py -v`
Expected: 5 passed

- [ ] **Step 6: Commit**

```bash
git add api/db/migrations/020_version_dismissals.sql api/db/repos/version_dismissals.py tests/test_version.py
git commit -m "feat: version dismissal repository with migration and tests"
```

---

### Task 3: Backend — Version Router

**Files:**
- Create: `api/routers/version.py`
- Modify: `api/main.py:55-60` (import) and `api/main.py:168-185` (include_router) and `api/main.py:82-84` (lifespan wiring)

- [ ] **Step 1: Write the route tests**

Add to `tests/test_version.py`:

```python
import pytest
from unittest.mock import MagicMock
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI
from api.routers.version import router as version_router
import api.routers.version as version_mod


@pytest.fixture
def version_app(repo):
    version_mod.dismissal_repo = repo
    app = FastAPI()
    app.include_router(version_router)
    return app


@pytest.mark.asyncio
async def test_version_status_not_dismissed(version_app):
    async with AsyncClient(transport=ASGITransport(app=version_app), base_url="http://test") as ac:
        resp = await ac.get("/api/version/status", params={"v": "1.1.0"}, headers={"X-Player-Id": "123"})
    assert resp.status_code == 200
    assert resp.json() == {"dismissed": False}


@pytest.mark.asyncio
async def test_version_dismiss_and_check(version_app):
    async with AsyncClient(transport=ASGITransport(app=version_app), base_url="http://test") as ac:
        resp = await ac.post("/api/version/dismiss", json={"version": "1.1.0"}, headers={"X-Player-Id": "123"})
        assert resp.status_code == 200
        resp2 = await ac.get("/api/version/status", params={"v": "1.1.0"}, headers={"X-Player-Id": "123"})
    assert resp2.json() == {"dismissed": True}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_version.py::test_version_status_not_dismissed -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.routers.version'`

- [ ] **Step 3: Create the router**

```python
# api/routers/version.py
from __future__ import annotations
from fastapi import APIRouter, Header, Query
from pydantic import BaseModel
from api.db.repos.version_dismissals import VersionDismissalRepository

router = APIRouter(prefix="/api/version", tags=["version"])
dismissal_repo: VersionDismissalRepository | None = None  # Set by main.py


class DismissRequest(BaseModel):
    version: str


@router.get("/status")
async def version_status(v: str = Query(), x_player_id: int = Header()):
    if not dismissal_repo:
        return {"dismissed": False}
    return {"dismissed": dismissal_repo.is_dismissed(x_player_id, v)}


@router.post("/dismiss")
async def version_dismiss(req: DismissRequest, x_player_id: int = Header()):
    if dismissal_repo:
        dismissal_repo.dismiss(x_player_id, req.version)
    return {"ok": True}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_version.py -v`
Expected: 7 passed

- [ ] **Step 5: Wire router into main.py**

In `api/main.py`, add the import block (after the push import around line 58-59):

```python
from api.routers.version import router as version_router
import api.routers.version as version_mod
```

In the lifespan function (after `push_mod.push_service = push_service` around line 146), add:

```python
from api.db.repos.version_dismissals import VersionDismissalRepository
version_mod.dismissal_repo = VersionDismissalRepository(db_path="data/keys.db")
```

In the router includes block (after `app.include_router(push_router)` at line 185), add:

```python
app.include_router(version_router)
```

- [ ] **Step 6: Run full backend tests**

Run: `uv run pytest tests/ -v`
Expected: All pass (228+ tests)

- [ ] **Step 7: Commit**

```bash
git add api/routers/version.py api/main.py tests/test_version.py
git commit -m "feat: version status/dismiss API endpoints"
```

---

### Task 4: Frontend — API Client + useVersionNotice Hook

**Files:**
- Modify: `frontend/src/lib/api-client.ts:127-133` (add version API methods)
- Create: `frontend/src/hooks/useVersionNotice.ts`

- [ ] **Step 1: Add API methods to api-client.ts**

After the `pushUnsubscribe` method (around line 132), add:

```ts
  versionStatus: (v: string) => apiFetch<{ dismissed: boolean }>(`/api/version/status?v=${encodeURIComponent(v)}`),
  versionDismiss: (version: string) =>
    apiFetch<{ ok: boolean }>('/api/version/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version }) }),
```

- [ ] **Step 2: Create the useVersionNotice hook**

```ts
// frontend/src/hooks/useVersionNotice.ts
"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { CURRENT_VERSION, CHANGELOG } from "@/data/changelog";
import type { ChangelogEntry } from "@/data/changelog";

export function useVersionNotice() {
  const [showNotice, setShowNotice] = useState(false);
  const latestEntry: ChangelogEntry | undefined = CHANGELOG[0];

  useEffect(() => {
    api.versionStatus(CURRENT_VERSION)
      .then((res) => {
        if (!res.dismissed) setShowNotice(true);
      })
      .catch(() => {});
  }, []);

  const dismiss = useCallback(async () => {
    setShowNotice(false);
    try {
      await api.versionDismiss(CURRENT_VERSION);
    } catch {}
  }, []);

  return {
    showNotice,
    currentVersion: CURRENT_VERSION,
    latestEntry,
    dismiss,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api-client.ts frontend/src/hooks/useVersionNotice.ts
git commit -m "feat: useVersionNotice hook + version API client methods"
```

---

### Task 5: Frontend — Changelog Page

**Files:**
- Create: `frontend/src/app/changelog/page.tsx`

- [ ] **Step 1: Create the changelog page**

```tsx
// frontend/src/app/changelog/page.tsx
'use client';

import { useState } from 'react';
import { CHANGELOG, CURRENT_VERSION } from '@/data/changelog';
import type { ChangelogEntry, ChangelogChange } from '@/data/changelog';
import { useVersionNotice } from '@/hooks/useVersionNotice';

const TYPE_STYLES: Record<ChangelogChange['type'], { label: string; color: string }> = {
  feat: { label: 'NEW', color: 'bg-torn-green/20 text-torn-green' },
  fix: { label: 'FIX', color: 'bg-red-500/20 text-red-400' },
  improve: { label: 'IMPROVED', color: 'bg-blue-500/20 text-blue-400' },
};

function VersionCard({ entry, defaultOpen }: { entry: ChangelogEntry; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const isLatest = entry.version === CURRENT_VERSION;

  return (
    <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-bg-elevated/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-text-primary">v{entry.version}</span>
          {isLatest && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-torn-green/20 text-torn-green px-2 py-0.5 rounded-full">
              Latest
            </span>
          )}
          <span className="text-sm text-text-secondary">{entry.title}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-text-muted">{entry.date}</span>
          <span className="text-text-muted text-xs">{open ? '▾' : '▸'}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-border-light">
          {entry.changes.map((change, i) => {
            const style = TYPE_STYLES[change.type];
            return (
              <div key={i} className="flex items-start gap-2 pt-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${style.color}`}>
                  {style.label}
                </span>
                <span className="text-sm text-text-secondary">{change.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ChangelogPage() {
  const { dismiss, showNotice } = useVersionNotice();

  // Auto-dismiss on visiting changelog
  if (showNotice) {
    dismiss();
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Changelog</h1>
        <p className="text-sm text-text-muted mt-1">
          All updates and improvements to TM Hub. Current version: <span className="text-torn-green font-semibold">v{CURRENT_VERSION}</span>
        </p>
      </div>

      <div className="space-y-3">
        {CHANGELOG.map((entry, i) => (
          <VersionCard key={entry.version} entry={entry} defaultOpen={i === 0} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build frontend to verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds, `/changelog` in route list

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/changelog/page.tsx
git commit -m "feat: changelog page with version cards"
```

---

### Task 6: Frontend — Version Banner in AppShell

**Files:**
- Modify: `frontend/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Add version banner and update footer**

In `AppShell.tsx`, add the import for `useVersionNotice` (after the existing imports around line 11):

```ts
import { useVersionNotice } from "@/hooks/useVersionNotice";
```

Inside `ShellContent`, add the hook call (after the existing `useAnnouncements` call at line 15):

```ts
const { showNotice, currentVersion, latestEntry, dismiss: dismissVersion } = useVersionNotice();
```

After the `<AnnouncementCarousel>` line (line 68), add the version banner:

```tsx
{showNotice && latestEntry && (
  <div className="mx-4 mt-2 flex items-center gap-3 bg-torn-green/10 border border-torn-green/30 rounded-lg px-4 py-2.5 text-sm">
    <span className="text-torn-green font-bold shrink-0">New version v{currentVersion}!</span>
    <span className="text-text-secondary truncate">{latestEntry.title}</span>
    <a
      href="/changelog"
      onClick={dismissVersion}
      className="text-torn-green hover:underline font-medium shrink-0 ml-auto"
    >
      See what&apos;s new &rarr;
    </a>
    <button
      onClick={dismissVersion}
      className="text-text-muted hover:text-text-primary transition-colors shrink-0"
      aria-label="Dismiss"
    >
      ✕
    </button>
  </div>
)}
```

Replace the footer (lines 72-93) with version-aware footer:

```tsx
<footer className="px-4 py-3 text-text-muted text-[10px] text-center border-t border-border">
  TM Hub{" "}
  <a href="/changelog" className="text-torn-green hover:underline">
    v{currentVersion}
  </a>
  {" "}— by{" "}
  <a
    href="https://www.torn.com/profiles.php?XID=2362436"
    target="_blank"
    className="text-torn-green hover:underline"
  >
    Bombel [2362436]
  </a>
  {role && role !== "member" && (
    <>
      {" · "}
      <a
        href="https://analityka.tri.ovh"
        target="_blank"
        className="text-torn-blue hover:underline"
      >
        Analytics
      </a>
    </>
  )}
</footer>
```

- [ ] **Step 2: Build frontend to verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/AppShell.tsx
git commit -m "feat: version notification banner + clickable version in footer"
```

---

### Task 7: Frontend — Nav Badge for Changelog

**Files:**
- Modify: `frontend/src/lib/nav-data.ts:86-90` (add Changelog to Resources group)
- Modify: `frontend/src/components/layout/Sidebar.tsx` (pass showNotice)
- Modify: `frontend/src/components/nav/CollapsibleGroup.tsx` (render badge)
- Modify: `frontend/src/components/nav/BottomNavBar.tsx` (badge on More tab)
- Modify: `frontend/src/components/layout/AppShell.tsx` (pass showNotice to nav)

- [ ] **Step 1: Add Changelog to nav-data.ts**

In `frontend/src/lib/nav-data.ts`, add a Changelog entry to the `resources` group (after the FAQ item at line 88):

```ts
      { label: "Changelog", href: "/changelog", icon: "📋" },
```

- [ ] **Step 2: Add showVersionBadge prop to Sidebar**

In `frontend/src/components/layout/Sidebar.tsx`, update the interface (line 17-19):

```ts
interface SidebarProps {
  unreadCount?: number;
  showVersionBadge?: boolean;
}
```

Update the function signature (line 27):

```ts
export function Sidebar({ unreadCount = 0, showVersionBadge = false }: SidebarProps) {
```

Pass `showVersionBadge` to `CollapsibleGroup` (in the NAV_GROUPS.map around line 118-127):

```tsx
{NAV_GROUPS.map((group) => (
  <CollapsibleGroup
    key={group.id}
    group={group}
    isPinned={isPinned}
    isFull={isFull}
    onPin={pin}
    onUnpin={unpin}
    showVersionBadge={group.id === "resources" && showVersionBadge}
  />
))}
```

- [ ] **Step 3: Add badge rendering to CollapsibleGroup**

In `frontend/src/components/nav/CollapsibleGroup.tsx`, add `showVersionBadge` to the interface (line 10-16):

```ts
interface CollapsibleGroupProps {
  group: NavGroup;
  isPinned: (href: string) => boolean;
  isFull: () => boolean;
  onPin: (href: string) => void;
  onUnpin: (href: string) => void;
  showVersionBadge?: boolean;
}
```

Update the destructured props (line 24-30):

```ts
export function CollapsibleGroup({
  group,
  isPinned,
  isFull,
  onPin,
  onUnpin,
  showVersionBadge = false,
}: CollapsibleGroupProps) {
```

Inside the item `<Link>`, after the `<span className="flex-1">{item.label}</span>` (line 82), add:

```tsx
{showVersionBadge && item.href === "/changelog" && (
  <span className="text-[9px] font-bold uppercase bg-torn-green/20 text-torn-green px-1.5 py-0.5 rounded-full">
    NEW
  </span>
)}
```

- [ ] **Step 4: Pass showVersionBadge from AppShell to Sidebar and BottomNavBar**

In `frontend/src/components/layout/AppShell.tsx`, update the Sidebar call (line 26-27):

```tsx
<Sidebar unreadCount={unreadCount} showVersionBadge={showNotice} />
```

Update the BottomNavBar call (line 64):

```tsx
<BottomNavBar unreadCount={unreadCount} role={role} showVersionBadge={showNotice} />
```

- [ ] **Step 5: Add badge to BottomNavBar "More" sheet items**

In `frontend/src/components/nav/BottomNavBar.tsx`, update the interface (line 10-13):

```ts
interface BottomNavBarProps {
  unreadCount?: number;
  role?: string | null;
  showVersionBadge?: boolean;
}
```

Update function signature (line 15):

```ts
export function BottomNavBar({ unreadCount = 0, role, showVersionBadge = false }: BottomNavBarProps) {
```

Pass `showVersionBadge` through to the `BottomSheet` component. In `BottomNavBar.tsx`, update the BottomSheet call (line 108):

```tsx
<BottomSheet group={activeSheet} onClose={() => setActiveSheet(null)} showVersionBadge={showVersionBadge} />
```

Then in `frontend/src/components/nav/BottomSheet.tsx`, add the prop to the interface (line 9-12):

```ts
interface BottomSheetProps {
  group: NavGroup | null;
  onClose: () => void;
  showVersionBadge?: boolean;
}
```

Update the function signature (line 14):

```ts
export function BottomSheet({ group, onClose, showVersionBadge = false }: BottomSheetProps) {
```

Inside the item rendering (after `<span>{item.label}</span>` at line 81), add:

```tsx
{showVersionBadge && item.href === "/changelog" && (
  <span className="text-[9px] font-bold uppercase bg-torn-green/20 text-torn-green px-1.5 py-0.5 rounded-full ml-auto">
    NEW
  </span>
)}
```

- [ ] **Step 6: Build frontend to verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/nav-data.ts frontend/src/components/layout/Sidebar.tsx frontend/src/components/nav/CollapsibleGroup.tsx frontend/src/components/nav/BottomNavBar.tsx frontend/src/components/nav/BottomSheet.tsx frontend/src/components/layout/AppShell.tsx
git commit -m "feat: Changelog in nav with NEW badge for unseen versions"
```

---

### Task 8: Update CLAUDE.md with Versioning Workflow

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add versioning section to CLAUDE.md**

After the existing `## Workflow` section (after line 83), add:

```markdown
## Versioning

TM Hub uses semantic versioning. The source of truth is `frontend/src/data/changelog.ts`.

On each deploy with user-facing changes:
1. Bump `CURRENT_VERSION` in `frontend/src/data/changelog.ts`
2. Add a new entry at the **top** of the `CHANGELOG` array with version, date, title, and changes
3. Version rules: patch (1.0.X) = bugfix, minor (1.X.0) = new feature, major (X.0.0) = breaking change
4. Change types: `feat` = new feature, `fix` = bugfix, `improve` = enhancement to existing feature
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add versioning workflow to CLAUDE.md"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run full backend tests**

Run: `uv run pytest tests/ -v`
Expected: All pass

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds, `/changelog` in route list

- [ ] **Step 3: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No errors
