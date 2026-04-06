# Changelog & Version Notification — Design Spec

## Overview

Add a changelog page, version tracking, and a "new version" notification system to TM Hub. All user-facing text in English.

## Changelog Data

File: `frontend/src/data/changelog.ts`

Exports `CURRENT_VERSION` string + `CHANGELOG` array of entries:

```ts
interface ChangelogChange {
  type: "feat" | "fix" | "improve";
  text: string;
}

interface ChangelogEntry {
  version: string;       // semver e.g. "1.3.0"
  date: string;          // ISO date e.g. "2026-04-06"
  title: string;         // short summary
  changes: ChangelogChange[];
}
```

Types get colored badges: feat=green, fix=red, improve=blue.

## Changelog Page (`/changelog`)

- Listed in Guides nav group + footer link
- Card-per-version layout, newest first
- Latest version expanded by default, older collapsed
- Each change shows type badge + description
- Consistent styling with FAQ page

## Dismissal Tracking (Backend)

Migration `020_version_dismissals.sql`:
```sql
CREATE TABLE IF NOT EXISTS version_dismissals (
  player_id INTEGER NOT NULL,
  version TEXT NOT NULL,
  dismissed_at TEXT NOT NULL,
  UNIQUE(player_id, version)
);
```

New router `api/routers/version.py`:
- `GET /api/version/status?v={version}` — returns `{dismissed: bool}` using `X-Player-Id` header
- `POST /api/version/dismiss` with body `{version: "..."}` — inserts dismissal record

## Notification Banner

Rendered in AppShell, below AnnouncementCarousel, above page content.

> **New version v1.3.0!** Real gym energy data + Changelog page. [See what's new ->] [X]

- "See what's new" links to `/changelog` and dismisses
- X button dismisses via API
- Only shown when version is not yet dismissed for this player

## Nav Badge

Green "NEW" dot/badge next to "Changelog" link in:
- Sidebar (Guides group)
- BottomNavBar (Guides sheet)

Badge disappears after dismiss (banner close OR visiting changelog page).

## Frontend Hook: `useVersionNotice`

```ts
function useVersionNotice() → {
  showNotice: boolean;
  currentVersion: string;
  latestEntry: ChangelogEntry;
  dismiss: () => Promise<void>;
}
```

- On mount: calls `GET /api/version/status?v={CURRENT_VERSION}`
- `dismiss()`: calls `POST /api/version/dismiss`, sets `showNotice=false`
- Used by: AppShell (banner), Sidebar (badge), BottomNavBar (badge)

## Navigation Changes

- Add "Changelog" to Guides group in `nav-data.ts`
- Add version + changelog link in AppShell footer
- Footer shows clickable version linking to `/changelog`

## CLAUDE.md Workflow Addition

On each deploy with user-facing changes:
1. Bump `CURRENT_VERSION` in `frontend/src/data/changelog.ts`
2. Add new entry to `CHANGELOG` array
3. Semver rules: patch=bugfix, minor=new feature, major=breaking change

## Versioning

Start at current implied version. Looking at the footer which says "v1.0.0", we start changelog from v1.1.0 onwards. The first changelog entry will be a retroactive summary + the current changes.
