# TM Hub Session 2 Handoff — 2026-03-29

## What was done

### New pages built
- **Dashboard** `/dashboard` — faction overview (online/hospital/traveling/attacks/NPC loot/war alert)
- **Faction Activity** `/activity` — member status filters (online/idle/offline/hospital/traveling/jail)
- **Stakeout** `/stakeout` — watch specific players, track status changes every 30s
- **Bounty Board** `/bounties` — active bounties from Torn API v2, sorted by reward
- **Notifications** `/notifications` — in-app notification center (stakeout changes, war events)
- **Stock Price Charts** — click any stock to see Chart.js price history

### Backend improvements
- **Stat estimator** (`api/stat_estimator.py`) — YATA-style stat estimation from personalstats
- **Historical data collection** — stock prices + activity snapshots stored in DB
- **Notification system** — DB + API + auto-creation from background scheduler
- **95 new tests** (202 total, all passing)

### Fixes
- Dashboard showing 0s (status was object not string — fixed normalization)
- Activity page same issue
- Travel page travelers section
- Stat growth "Player #ID" → "Username [ID]"
- Bounties: switched from v1 torn/bounties (empty) to v2 (100 bounties)
- War reports: added past ranked wars from torn/rankedwars
- Admin panel crash (useMemo hook order)
- OC player names resolved from member lookup

### Process improvements
- **CLAUDE.md**: added design philosophy + mandatory post-deploy sanity check
- **Memory**: saved design philosophy, testing requirements, next steps

## What needs to be done next

### Priority 1: Bounties threat level
User wants threat/difficulty rating for each bounty target. Need to fetch target's personalstats or check spy data, compute threat score, show on bounty board so player knows who they can beat.

### Priority 2: FAQ + Educational content
A research agent was dispatched (may have completed) to research Torn forums/Reddit for common player questions. Results need to be:
- Turned into FAQ content per page
- Added as richer PageExplainer content
- Every page should explain WHY the data matters, HOW game mechanics work, WHERE data comes from

### Priority 3: Data source attribution
Every page should show data sources (e.g., "Data from Torn API v2, cached 60s" or "Estimated from personalstats")

### Priority 4: Continue features
- Light mode + mobile polish
- War timeline replay
- Stock price charts (data accumulating)
- Company specials tracker
- Browser push notifications

## Architecture (current)

- **17 routers**: spy, stats, market, chain, awards, targets, loot, revives, stocks, travel, oc, wars, bounties, stakeout, notifications + legacy (admin, main)
- **15 SQL migrations** (001-015)
- **25+ frontend routes** (including dashboard, activity, stakeout, bounties, notifications, awards/detail)
- **202 pytest tests**
- **Background scheduler**: 30s cycle, war-aware adaptive polling, refreshes: members, attacks, wars, revives, stocks, awards, loot, OC, stakeouts, market items, stock history, activity snapshots
- **Historical data**: stock_history + member_activity_log tables
- **Notification system**: notifications table + auto-creation from scheduler

## Key env vars
TORN_API_KEY, TORNSTATS_API_KEY, ENCRYPTION_KEY, JWT_SECRET, FACTION_ID=11559

## Deploy
Push master → Coolify auto-deploy. API token at `~/.config/coolify/credentials.json`, app UUID `jut6hmgjyhv2bf8qpbahf92e`.

**IMPORTANT**: After EVERY deploy, run sanity check (see CLAUDE.md). Use Playwright browser or curl all API endpoints.

## Design philosophy (READ THIS)
Features exist to HELP players make decisions, not to pad the feature list. Every page must explain WHY data matters, show data sources, teach game mechanics. See CLAUDE.md and memory/feedback_design_philosophy.md.

## Git push note
SSH signing via 1Password sometimes fails. Use this workaround:
```bash
GIT_SSH_COMMAND="ssh -o IdentityFile=/dev/null -o IdentitiesOnly=yes" git push https://pawelorzech:$(gh auth token)@github.com/pawelorzech/tm-war-room.git master
```
And commit without gpg signing:
```bash
git -c commit.gpgsign=false commit -m "message"
```
