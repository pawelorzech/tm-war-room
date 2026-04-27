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

export const CURRENT_VERSION = "1.15.4";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.15.4",
    date: "2026-04-27",
    title: "Stats: superadmins can view other members + 1.15.3 follow-up",
    changes: [
      { type: "fix", text: "Superadmins (config SUPERADMIN_IDS) can now view any member's stat snapshots and growth — previously the check only honored the DB admin flag, so superadmins without the flag got a 403 and the UI showed an empty state" },
    ],
  },
  {
    version: "1.15.3",
    date: "2026-04-27",
    title: "Stats empty-state copy + service worker cache bump",
    changes: [
      { type: "fix", text: "Stats page empty-state used to suggest you needed to register your API key, even when you were looking at someone else's profile — now it correctly tells you that other player needs to register, with their name in the message" },
      { type: "fix", text: "Bumped service-worker cache version to push everyone past the stale 'Data collected daily at 4:00 UTC' header — stats actually refresh every 15 minutes" },
    ],
  },
  {
    version: "1.15.2",
    date: "2026-04-27",
    title: "Sprint 2 #8 + warmup polish",
    changes: [
      { type: "improve", text: "All chart components share a single Chart.js plugin registration — fewer duplicate registrations and one consolidated chart chunk used across stocks, awards, training, stats, and company trends" },
      { type: "improve", text: "Browser warms up the TLS handshake to the analytics server before the lazy-loaded analytics script fires — first-page analytics ping is faster on slow connections" },
    ],
  },
  {
    version: "1.15.1",
    date: "2026-04-27",
    title: "Sprint 2 #4 — Brotli compression",
    changes: [
      { type: "improve", text: "JavaScript and CSS now ship with Brotli compression in addition to gzip — about 23% smaller payloads for modern browsers, faster first paint on slow connections" },
      { type: "improve", text: "Bundle analyzer wired up (npm run build with ANALYZE=true) so future bundle bloat is easy to spot" },
    ],
  },
  {
    version: "1.15.0",
    date: "2026-04-27",
    title: "Sprint 2 #1+#19 — Redis + multi-worker backend",
    changes: [
      { type: "improve", text: "Backend now runs 2 worker processes behind nginx — roughly double the API throughput, especially on the dashboard and parallel data fetches" },
      { type: "improve", text: "Chat broadcasts (messages, edits, deletes, threads, pins) now fan out cross-worker via Redis pub/sub — no more missed messages when you and your peer happen to land on different workers" },
      { type: "improve", text: "Online presence is shared across workers via Redis with a 60s TTL — the green dot list is finally accurate cluster-wide" },
      { type: "improve", text: "Scheduler leader-election prevents duplicate background jobs — only one worker runs scrapers, scheduling 30s data refresh, 5min armoury polls, etc." },
      { type: "improve", text: "Rate limits are now shared across workers (Redis INCR) when shared state matters — a single user can't bypass a limit by spreading requests across workers" },
      { type: "improve", text: "Graceful Redis fallback — if Redis is unreachable, app keeps running with per-worker state and chat narrows to single-worker behaviour rather than failing" },
    ],
  },
  {
    version: "1.14.0",
    date: "2026-04-27",
    title: "Performance audit Sprint 1 — observability + quick wins",
    changes: [
      { type: "improve", text: "Director faction view now fans out training-data fetches in parallel — pages with many keys load 5-10× faster" },
      { type: "improve", text: "Web Vitals (LCP, INP, CLS, TTFB, FCP) shipped to Umami so we can see real-user performance instead of guessing" },
      { type: "improve", text: "Backend logs each /api/ request as a single JSON line — p50/p95/p99 latency analysis is now one jq command away" },
      { type: "improve", text: "New /health endpoint reports DB connectivity for Coolify probes" },
      { type: "improve", text: "nginx now actually caches private-Cache-Control responses (keyed per player) — was previously skipping them, hit ratio jumps from ~0% to expected baseline" },
      { type: "improve", text: "nginx access log includes upstream cache status so hit ratio is observable from logs" },
      { type: "improve", text: "Smaller Docker build context via .dockerignore (skips .git, node_modules, plans, tests)" },
    ],
  },
  {
    version: "1.13.5",
    date: "2026-04-27",
    title: "Daily encrypted backups for keys.db",
    changes: [
      { type: "improve", text: "Daily encrypted backups of the API key database to B2 with 30-day retention — losing the volume no longer means everyone re-registers their key" },
      { type: "improve", text: "Restore tooling + runbook + quarterly drill log so we know the backups actually work" },
    ],
  },
  {
    version: "1.13.4",
    date: "2026-04-27",
    title: "Session revocation + admin re-auth",
    changes: [
      { type: "improve", text: "Logout now actually revokes the session — even a leaked token can't be reused after you sign out (server-side jti deny-list)" },
      { type: "improve", text: "Admin escalation re-validates your Torn API key against Torn before issuing an admin session — a stolen session token alone is not enough" },
      { type: "improve", text: "Hardened CI: GitHub Actions pinned by SHA + scoped GITHUB_TOKEN permissions, dependabot watches upstream releases" },
      { type: "improve", text: "Umami analytics script pinned with SRI hash so a CDN compromise cannot inject script into the app" },
      { type: "improve", text: "Defensive SQL: armoury + chat repos refuse unknown column names instead of silently skipping them" },
    ],
  },
  {
    version: "1.13.3",
    date: "2026-04-27",
    title: "Auth hardening (HttpOnly cookies)",
    changes: [
      { type: "improve", text: "Login tokens now travel as HttpOnly cookies (tm_session, tm_admin) instead of being readable from JavaScript — XSS can no longer steal a session" },
      { type: "improve", text: "Content-Security-Policy hardened: dropped 'unsafe-inline' from script-src so injected scripts cannot run in the browser" },
      { type: "improve", text: "SUPERADMIN_IDS env var enables a backup superadmin without code changes (break-glass recovery)" },
    ],
  },
  {
    version: "1.13.2",
    date: "2026-04-27",
    title: "Security hardening",
    changes: [
      { type: "fix", text: "Stats snapshots/growth and the enemy baseline endpoint now reject requests for other players' data — only your own player_id is allowed (admins keep full read access)" },
      { type: "fix", text: "Director news feed HTML is sanitised before rendering, so any odd HTML in Torn news cannot run scripts in your browser" },
      { type: "fix", text: "All external links opening in a new tab now use rel=noopener noreferrer to prevent reverse tabnabbing" },
    ],
  },
  {
    version: "1.13.1",
    date: "2026-04-24",
    title: "Company Stock Runway",
    changes: [
      { type: "improve", text: "Company Director stock tab now estimates whether each product has enough in-stock + on-order units to keep this week's sell rate going through Sunday" },
      { type: "improve", text: "Runway uses director-only company stock snapshots with a Monday 00:00 TCT week boundary and clearly marks partial-week history when no Monday baseline exists" },
    ],
  },
  {
    version: "1.13.0",
    date: "2026-04-19",
    title: "Weekly Comparison + Trains Alerts",
    changes: [
      { type: "feat", text: "New 'Comparison' tab on /company/director — weekly leaderboard of class-10 companies anchored to Mon 18:00 TCT (not Torn's rolling 7-day). Filter by your company type or see all class-10 overall" },
      { type: "feat", text: "Anchored weekly sales for your own company — computed as a diff of lifetime sold_worth between week boundaries, so you see a real 'what did I sell this week' figure that resets, not the rolling one Torn shows" },
      { type: "feat", text: "Pin-a-week — save any week with a label (e.g. 'Halloween 2025') to overlay in future comparisons" },
      { type: "feat", text: "Background job discovers class-10 rival companies automatically (100 IDs/day sequential scan); daily snapshot pulls their public profile so we build historical data Torn itself doesn't store" },
      { type: "feat", text: "Per-employee 'trains stagnant' alerts — toggle alerts on any employee from the Employees tab; when company training credits sit unused ≥3 days we ping them via in-app notification (and push if enabled in Settings)" },
      { type: "feat", text: "Manual tracked-companies endpoint — directors can add any rival company ID to the daily watchlist" },
    ],
  },
  {
    version: "1.12.2",
    date: "2026-04-19",
    title: "Nav highlight fix",
    changes: [
      { type: "fix", text: "'Companies' and 'Director' were both highlighted at the same time when viewing /company/director — rewrote sidebar active-state to 'most specific match wins' so only the real target item lights up" },
    ],
  },
  {
    version: "1.12.1",
    date: "2026-04-19",
    title: "Director page polish",
    changes: [
      { type: "fix", text: "Sidebar was highlighting both 'Companies' and 'Director' at the same time on /company/director — prefix-match replaced with exact + descendant match across sidebar, bottom nav, and browse sheet" },
      { type: "improve", text: "Non-director view of /company/director now shows a teaser per tab explaining exactly what directors get, with an 'unlock' checklist (buy a company, link director's key) instead of a blank 'not a director' banner" },
      { type: "improve", text: "Lock icons on tabs that are director-only, tabs stay clickable to browse the teasers" },
    ],
  },
  {
    version: "1.12.0",
    date: "2026-04-19",
    title: "Hiring Ranker",
    changes: [
      { type: "feat", text: "Applications tab on /company/director now ranks applicants by predicted efficiency using TornStats — 'Top pick' badges on the best 3 and a per-applicant 'Best as X' recommendation" },
      { type: "feat", text: "Rate-limited batch calls (semaphore=5) respect the TornStats 100/min budget even with many applicants" },
      { type: "feat", text: "Explicit 'Rank applicants' button — no surprise external calls until you ask" },
    ],
  },
  {
    version: "1.11.0",
    date: "2026-04-19",
    title: "Company Trends",
    changes: [
      { type: "feat", text: "New Trends tab on /company/director — daily snapshots power line charts for funds/bank/ad budget, daily/weekly income, popularity/efficiency/environment, and aggregated stock" },
      { type: "feat", text: "Daily scheduler job silently collects director snapshots — time-series that neither YATA nor TornStats provide" },
      { type: "feat", text: "Window selector (7d / 30d / 90d / 1y) on Trends tab" },
    ],
  },
  {
    version: "1.10.0",
    date: "2026-04-19",
    title: "Company Director Cockpit",
    changes: [
      { type: "feat", text: "New /company/director page — full director cockpit with financials, employee effectiveness, applications, stock & margins, and news" },
      { type: "feat", text: "TM Companies benchmark tab — public profiles (rating, daily/weekly income, staffing) for every company our members run, open to everyone" },
      { type: "feat", text: "Non-directors see a friendly gate explaining the feature and the public benchmark remains accessible" },
    ],
  },
  {
    version: "1.9.1",
    date: "2026-04-12",
    title: "Login Stability Fix",
    changes: [
      { type: "fix", text: "Fix login appearing to refresh without logging in — caused by a race condition where session validation could fire before login completed" },
    ],
  },
  {
    version: "1.9.0",
    date: "2026-04-11",
    title: "Game Knowledge & Member Guide",
    changes: [
      { type: "feat", text: "New Member Guide page — comprehensive onboarding guide covering training, money safety, medical items, education priorities, and casino strategy" },
      { type: "feat", text: "Educational tooltips added to 7 pages (stats, loot, chain, bounties, travel, revives, company) with game mechanic tips and strategy advice" },
      { type: "feat", text: "Quick Tips widget on dashboard — rotating game tips with shuffle button" },
      { type: "feat", text: "Seasonal event banners — date-aware tips during Easter, Elimination, Halloween, Christmas, and Museum Day events" },
    ],
  },
  {
    version: "1.8.1",
    date: "2026-04-11",
    title: "Login & Stability Fixes",
    changes: [
      { type: "fix", text: "Login no longer fails when the server is briefly restarting — transient errors no longer force logout" },
      { type: "fix", text: "Root page (/) now loads correctly instead of showing a 500 error" },
    ],
  },
  {
    version: "1.8.0",
    date: "2026-04-11",
    title: "Armoury Restock Competitions",
    changes: [
      { type: "feat", text: "Armoury competitions — track who deposits the most blood bags, temporary items, or alcohol to the faction armoury" },
      { type: "feat", text: "Live leaderboard with podium for top 3, auto-refreshes every 60 seconds" },
      { type: "feat", text: "Admin controls to create competitions with configurable item category and date range" },
    ],
  },
  {
    version: "1.7.0",
    date: "2026-04-07",
    title: "Profiles, Avatars & Presence",
    changes: [
      { type: "feat", text: "Player avatars — Torn profile images cached on Backblaze B2, shown throughout the app" },
      { type: "feat", text: "Settings page — unified profile view with Torn stats, push notification preferences, and theme toggle" },
      { type: "feat", text: "Hub presence — online counter now shows everyone active in the hub, not just chat users" },
      { type: "improve", text: "Notifications page simplified to inbox only; push settings moved to /settings" },
    ],
  },
  {
    version: "1.6.0",
    date: "2026-04-06",
    title: "Revive Monitor Bot",
    changes: [
      { type: "feat", text: "New chat bot that warns members with revives enabled — crucial during wars" },
      { type: "feat", text: "Bot posts automatically every 10 min (war) or 60 min (peace) to #revives channel" },
      { type: "feat", text: "New Bots tab in admin panel with manual trigger button" },
    ],
  },
  {
    version: "1.5.0",
    date: "2026-04-06",
    title: "Chat Improvements",
    changes: [
      { type: "feat", text: "Traveling members shown in #traveling channel header" },
      { type: "feat", text: "Unread chat messages banner on dashboard" },
      { type: "feat", text: "Chat channels searchable in Cmd+K command palette" },
      { type: "feat", text: "People picker for push notifications (search by name)" },
      { type: "feat", text: "Leadership channel visible only to admins" },
      { type: "improve", text: "Messages appear instantly when you send them" },
    ],
  },
  {
    version: "1.4.1",
    date: "2026-04-06",
    title: "Chat Mobile Fix",
    changes: [
      { type: "fix", text: "Chat no longer goes blank when keyboard opens on mobile" },
      { type: "fix", text: "Footer hidden on chat page — input now sits cleanly above bottom nav" },
      { type: "fix", text: "iOS: keyboard no longer zooms — inputs now use 16px font size" },
      { type: "fix", text: "iOS: layout adjusts to visual viewport so content stays visible when keyboard is open" },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-04-06",
    title: "Push Notification System",
    changes: [
      { type: "feat", text: "Admin push panel — send notifications with templates, groups, and delivery history" },
      { type: "feat", text: "Torn PDA native notification support via JS bridge with automatic polling" },
      { type: "feat", text: "Custom notification groups for targeting specific players" },
      { type: "fix", text: "Chat mention push notifications now working via unified dispatcher" },
      { type: "improve", text: "Removed unused OC Ready event type from push preferences" },
    ],
  },
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
  {
    version: "1.3.0",
    date: "2026-04-06",
    title: "Faction Chat & Forum",
    changes: [
      { type: "feat", text: "Built-in faction chat with real-time messaging via WebSocket" },
      { type: "feat", text: "Multiple channels: #general, #war-room, #trading, #off-topic, #announcements" },
      { type: "feat", text: "Forum-style threaded discussions in announcement channels" },
      { type: "feat", text: "Unread message tracking with badge counts per channel" },
      { type: "feat", text: "@mention system with push notifications for mentioned players" },
      { type: "feat", text: "Bot API infrastructure — bots can post messages and mention players via REST API" },
      { type: "feat", text: "Admin tools: create/delete channels, manage bots, mute/unmute players, pin messages" },
      { type: "feat", text: "Typing indicators and online player count" },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-04-06",
    title: "Progressive Web App",
    changes: [
      { type: "feat", text: "TM Hub is now a PWA — add it to your home screen like a native app" },
      { type: "feat", text: "New neon-glow TM icon" },
      { type: "feat", text: "Offline mode with a clean fallback page when you lose connection" },
      { type: "feat", text: "Smart install prompt — detects Android and iOS with platform-specific instructions" },
    ],
  },
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
