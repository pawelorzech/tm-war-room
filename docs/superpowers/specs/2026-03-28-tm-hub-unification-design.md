# TM Hub — Unification Design Spec

**Date:** 2026-03-28
**Author:** Bombel [2362436]
**Status:** Approved

## Goal

Merge `tm-war-room` (FastAPI + vanilla JS) and `tm-training-guide` (Next.js + React) into a single platform called **TM Hub** at `hub.tri.ovh`. All existing functionality preserved, unified under a new UI shell with sidebar navigation, role-based access, and an admin announcement system.

This is Phase 1. Future phases will add YATA and TornStats features.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend framework | Next.js 15 + React 19 + TypeScript | Training Guide already uses it; component reuse; scalable for future tools |
| Backend | FastAPI (existing) | Works well, no reason to change |
| Repo strategy | Monorepo | One developer, one deploy target, simplifies everything |
| Migration approach | Shell + clean rewrite | Not big bang, not iframe hack — rewrite War Room to React component by component |
| Navigation | Sidebar (desktop fixed, mobile drawer) | Scales for growing number of tools |
| Styling | Tailwind CSS v4, dark default | Already in Training Guide, good DX |
| Auth | Torn API key only, no user+password | API key is identity — no need for dual auth |
| Branding | TM Hub, `hub.tri.ovh` | Neutral name that accommodates all tools |

## Architecture

### Monorepo Structure

```
tm-war-room/
├── api/                        ← FastAPI backend (renamed from app/)
│   ├── main.py                 (routes + static file serving)
│   ├── config.py               (env vars, superadmin ID)
│   ├── auth.py                 (JWT, rate limiting)
│   ├── db.py                   (KeyStore + AdminRoles + Announcements)
│   ├── models.py               (Pydantic models)
│   ├── torn_client.py          (Torn/TornStats/YATA API client)
│   ├── threat.py               (threat scoring)
│   ├── admin.py                (admin routes)
│   └── analytics.py            (request logging)
├── frontend/                   ← Next.js 15 app
│   ├── src/
│   │   ├── app/                (App Router)
│   │   │   ├── layout.tsx      (root: AuthGate + Sidebar shell)
│   │   │   ├── page.tsx        (redirect → /war)
│   │   │   ├── war/
│   │   │   │   └── page.tsx    (War Room: Our Team + Enemy tabs)
│   │   │   ├── training/
│   │   │   │   └── page.tsx    (Training Guide: calculator + sections)
│   │   │   ├── inbox/
│   │   │   │   └── page.tsx    (Announcements inbox)
│   │   │   └── admin/
│   │   │       └── page.tsx    (Admin panel)
│   │   ├── components/
│   │   │   ├── layout/         (Sidebar, MobileDrawer, AuthGate, WarBanner, AnnouncementCarousel)
│   │   │   ├── war/            (MemberTable, EnemyTable, MemberCard, EnemyCard, ChainStatus, ...)
│   │   │   ├── training/       (from tm-training-guide, adapted)
│   │   │   ├── admin/          (Analytics, KeyManagement, AnnouncementEditor, ManageAdmins)
│   │   │   └── inbox/          (AnnouncementList, AnnouncementItem)
│   │   ├── hooks/
│   │   │   ├── useApi.ts       (fetch wrapper, auto X-Player-Id header)
│   │   │   ├── useAuth.ts      (API key state, login/logout, role check)
│   │   │   ├── useTheme.ts     (dark/light toggle)
│   │   │   ├── useAnnouncements.ts
│   │   │   └── ...             (useCalculator, useTornApi from training-guide)
│   │   ├── lib/
│   │   │   ├── api-client.ts   (typed API client)
│   │   │   ├── constants.ts    (game data from training-guide)
│   │   │   ├── formulas.ts     (gym calculations from training-guide)
│   │   │   └── format.ts       (number formatting)
│   │   └── types/
│   │       ├── war.ts          (FactionMember, WarStatus, EnemyData, ...)
│   │       ├── training.ts     (CalculatorState, Recommendation, ...)
│   │       └── admin.ts        (Announcement, AdminRole, ...)
│   ├── package.json
│   ├── next.config.ts          (static export: output: 'export')
│   ├── tailwind.config.ts
│   └── tsconfig.json
├── Dockerfile                  (multi-stage: build frontend + serve with FastAPI)
├── pyproject.toml
├── docker-compose.yml
└── tests/                      (pytest for API)
```

### Build & Deploy

**Dockerfile (multi-stage):**

```
Stage 1 (frontend): node:20-alpine
  - npm ci
  - next build (static export → /out)

Stage 2 (backend): python:3.12-slim
  - pip install from pyproject.toml
  - COPY api/ → api/
  - COPY --from=stage1 /out → static/
  - CMD uvicorn api.main:app --host 0.0.0.0 --port 8000
```

**FastAPI serves everything:**
- `/api/*` → API endpoints
- `/*` → static Next.js export (with `index.html` fallback for SPA routing)

**Domains:**
- `hub.tri.ovh` → primary, new Coolify app (same server 109.199.102.222)
- `rw.tri.ovh` → 301 redirect to `hub.tri.ovh/war` (via Traefik redirect rule or small redirect service)
- `train.tri.ovh` → 301 redirect to `hub.tri.ovh/training` (same mechanism)
- Old Coolify apps for rw.tri.ovh and train.tri.ovh can be decommissioned after redirect verification

**Environment variables (unchanged):**
- `TORN_API_KEY`, `TORNSTATS_API_KEY`, `ENCRYPTION_KEY`, `JWT_SECRET`
- `FACTION_ID` (default: 11559), `CACHE_TTL` (default: 60)

## UI Design

### Sidebar Navigation

**Desktop:** Fixed 200px sidebar on the left.

Structure:
```
┌─────────────────────┐
│ TM Hub              │
│ The Masters [TM]    │
├─────────────────────┤
│ WAR                 │  ← section header
│ ⚔ War Room          │  ← active item highlighted with green left border
├─────────────────────┤
│ TRAINING            │
│ 💪 Training Guide   │
├─────────────────────┤
│ TOOLS (coming)      │  ← dimmed, future expansion
│ 🔍 Spy Central      │
│ 🔗 Chain Tracker    │
├─────────────────────┤
│                     │
│ 📨 Inbox (3)        │  ← announcement badge
├─────────────────────┤
│ [B] Bombel          │  ← user panel at bottom
│     [2362436]  ⚙    │
└─────────────────────┘
```

**Mobile:** Hamburger in top bar opens 260px drawer from the left. Overlay dims content behind. Close button (×) in drawer header. User panel + theme toggle + logout at drawer bottom.

### War Banner

Global banner above content area (not in sidebar). Visible when Ranked War is active.

- Active: green background, "⚔ RW ACTIVE vs [Enemy] — [Score] : [Score] (target: X)"
- Upcoming: yellow background, countdown
- No war: hidden entirely

### Announcement Carousel

Below war banner, above content. Shows active announcements.

- Single announcement: static banner (colored by type)
- Multiple: auto-rotate every 5-6 seconds, dots/arrows for manual navigation
- Alert type (red): always pinned at top, does not rotate, cannot be skipped
- Dismissed by member: hidden from carousel (localStorage), still in inbox
- Revoked by admin: removed from carousel immediately

### Sub-tabs

Inside each tool's content area. War Room has: Our Team | Enemy. Admin has: Analytics | Announcements | Manage Admins (superadmin only).

Training Guide uses its existing tabbed sections (Calculator, Getting Started, Gym Formula, ...).

### Theme

- Tailwind CSS v4 with custom tokens (`torn-green` #3fb950 as accent)
- Dark mode default
- Simple toggle (dark/light), no gradient slider
- System preference detection on first visit

### Design Quality

All UI components built using `frontend-design` agent for production-grade, delightful interfaces. Mobile is first-class — not a responsive afterthought.

## Auth

### Flow

1. User opens `hub.tri.ovh` → `<AuthGate>` checks localStorage for player ID
2. No player ID → login screen: "Enter your Torn API key"
3. `POST /api/keys` → validates key against Torn API, checks faction membership
4. Success → player ID + name saved to localStorage, app renders
5. Every API call includes `X-Player-Id` header, backend verifies registered key exists

### Roles

| Role | Assignment | Permissions |
|------|-----------|-------------|
| **Superadmin** | Hardcoded: player ID 2362436 in `config.py` | Everything + promote/demote admins |
| **Admin** | Promoted by superadmin | Announcements (create/revoke) + analytics + key management |
| **Member** | Automatic on API key registration | All tools, inbox (read-only) |

**Implementation:**
- `SUPERADMIN_ID = 2362436` in `config.py`
- New SQLite table `admin_roles`:
  ```sql
  CREATE TABLE admin_roles (
      player_id INTEGER PRIMARY KEY,
      granted_by INTEGER NOT NULL,
      granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```
- Role resolution: if `player_id == SUPERADMIN_ID` → superadmin, elif in `admin_roles` → admin, else → member
- API endpoints check role via dependency injection

**Admin panel visibility:**
- Members: no Admin tab in sidebar
- Admins: Admin tab visible, "Manage Admins" section hidden
- Superadmin: Admin tab visible, "Manage Admins" section visible

## Announcement System

### Data Model

```sql
CREATE TABLE announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('alert', 'warning', 'info', 'success')),
    message TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    revoked_at TIMESTAMP,
    revoked_by INTEGER,
    revoke_reason TEXT
);
```

### Announcement Types

| Type | Color | Behavior |
|------|-------|----------|
| **Alert** | Red, pulsing border | Pinned top of carousel, cannot be dismissed by member |
| **Warning** | Yellow/amber | Normal carousel, dismissable |
| **Info** | Blue | Normal carousel, dismissable |
| **Success** | Green | Normal carousel, dismissable |

### States

- **Active**: `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now)`
- **Expired**: `expires_at <= now AND revoked_at IS NULL`
- **Revoked**: `revoked_at IS NOT NULL`

### Display

**Carousel (global, below war banner):**
- Shows only active announcements
- Alert type always first, non-rotating
- Other types rotate every 5-6 seconds
- Dots + arrows for manual navigation
- Members can dismiss non-alert announcements (localStorage, hides from carousel only)

**Inbox (sidebar item: 📨 Inbox):**
- Full list of all announcements
- Active: normal display, full color
- Expired: dimmed, labeled "expired"
- Revoked: strikethrough text, labeled "revoked" + optional reason
- Badge on sidebar shows count of active, non-dismissed announcements

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/announcements` | member | Active announcements (for carousel) |
| `GET` | `/api/announcements/all` | member | All announcements including expired/revoked (for inbox) |
| `POST` | `/api/announcements` | admin | Create announcement (type, message, optional expires_at) |
| `PATCH` | `/api/announcements/:id/revoke` | admin | Revoke with optional reason |

### Admin Panel — Announcements Section

- Create form: textarea + type selector (alert/warning/info/success) + optional expiry datetime
- Active list with "Revoke" button (opens small dialog for optional reason)
- History: all announcements sorted by created_at desc, with state badges

### Admin Panel — Manage Admins (Superadmin Only)

- List of current admins: player name, ID, granted date, "Demote" button
- "Promote" form: enter player ID (must be registered member)
- Only visible to superadmin (player ID 2362436)

## Migration Plan (High Level)

Order of work:

1. **Scaffold** — Next.js project in `frontend/`, Tailwind setup, basic routing
2. **Shell** — Sidebar, AuthGate, theme toggle, mobile drawer
3. **War Room rewrite** — Our Team tab, Enemy tab, War Banner, Chain Status, sort/filter
4. **Training Guide integration** — Copy components, adapt to new layout/hooks
5. **Announcement system** — Backend tables + API, carousel, inbox, admin UI
6. **Role system** — Admin roles table, promote/demote UI, permission checks
7. **Admin panel** — Migrate analytics, add announcement management, manage admins
8. **Deploy** — Multi-stage Dockerfile, Coolify setup, domain redirects
9. **Polish** — Frontend-design agent pass for delightful UI, mobile testing

## Out of Scope

- YATA features (Phase 2)
- TornStats features (Phase 3)
- Chain tracker, Spy Central (future)
- WebSocket/push notifications
- User+password auth
- Automated tests for frontend (can add later)
- i18n / localization (English only for now)
- Email or external notifications
