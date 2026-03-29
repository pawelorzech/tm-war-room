# TM Hub Session 3 Handoff — 2026-03-29

## What was done

### New features
- **Bounty threat levels** — easy/medium/hard/avoid per target from spy data + personalstats, hospital filter, threat filter buttons
- **FAQ page** (`/faq`) — 45 Q&As across 11 categories with Torn Wiki research, search, category filters
- **Stock market "What to Buy"** — ROI recommendations sorted by cheapest benefit cost, OWNED/ACTIVE badges, selectable chart periods (1D/7D/30D/90D/All)
- **Travel profit calculator** — YATA abroad prices, 5% fee calculation, $/hour metric, custom capacity (including button 29), SOLD OUT indicator
- **OC Planner overhaul** — separate planning/completed views, readiness tracking ("Waiting for: X"), CPR analysis, "What went wrong?" on failures, summary stats
- **Sidebar reorganization** — FACTION / TOOLS / LEARN sections

### Improvements
- **PageExplainer** enhanced on all 17 pages — data sources, wiki links, educational bullets
- **Theme toggle** fixed (classList.remove/add instead of toggle)
- **Market item links** — added item ID parameter

### Backend
- `fetch_user_profile_stats()` — fetch any player's personalstats by ID
- `fetch_yata_travel_stocks()` — YATA abroad prices, cached 15min
- User-Agent header on httpx client (YATA returns 403 without it)
- OC success parsing from status field ("Successful"/"Failed")
- 11 new tests (213 total)

## Architecture changes

- **17 routers** (unchanged count, but bounties now has threat scoring + spy/key_store deps)
- **Sidebar**: 3 sections — FACTION (Dashboard, Team, Enemies, Activity, War Reports, OC, Notifications), TOOLS (Chain, Bounties, Targets, Stakeout, Spy, Loot, Revives, Market, Stocks, Travel), LEARN (Training, Stats, Awards, FAQ)
- **YATA integration**: travel export endpoint, requires User-Agent header, data cached 15min
- **Bounties**: depends on torn_client, key_store, spy_service for threat computation

## What needs to be done next

### Priority 1: War timeline
Attack-level data from chain/attacks API needs to be aggregated over time to show war progress visually. Current war page shows basic info but no timeline.

### Priority 2: Mobile responsive testing
All new pages (FAQ, enhanced OC, stocks "What to Buy", travel calculator) need mobile testing.

### Priority 3: Browser push notifications
Service Worker for stakeout status changes, war events, loot timer alerts.

### Medium-term
- Company specials tracker
- Awards circulation history charts
- Dashboard quick-action cards (profitable travel, easy bounties, etc.)

## Key env vars
TORN_API_KEY, TORNSTATS_API_KEY, ENCRYPTION_KEY, JWT_SECRET, FACTION_ID=11559

## Deploy
Push master → GitHub Actions → Coolify auto-deploy. API token at `~/.config/coolify/credentials.json`.

## Git push workaround
```bash
git -c commit.gpgsign=false commit -m "message"
GIT_SSH_COMMAND="ssh -o IdentityFile=/dev/null -o IdentitiesOnly=yes" git push https://pawelorzech:$(gh auth token)@github.com/pawelorzech/tm-war-room.git master
```
