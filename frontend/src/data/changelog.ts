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

export const CURRENT_VERSION = "1.31.5";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.31.5",
    date: "2026-05-15",
    title: "Fix — spy estimates no longer wiped to zeros every 30 min",
    changes: [
      { type: "fix", text: "The 30-min `refresh_spies` scheduler job was overwriting real battle-stat estimates with zeros for months. Root cause: it called `fetch_tornstats_spy` (which returns PersonalStats — xanax/attacks/networth/...) and read `strength/defense/speed/dexterity/total` off those objects via `getattr(..., 0)`. Those attributes do not exist on PersonalStats, so every refresh wrote zeros to `spy_reports`. Empirical evidence in prod: 87% of spy_estimates had total=0, 99.86% of spy_reports had all stats=0, 162 zero-only inserts every hour. TornStats `/spy/faction/{id}` response actually has BOTH `personalstats` and `spy` blocks per member — the `spy` block holds the battle stats, and we were never reading it. Added `fetch_tornstats_faction_battle_stats` that parses the correct field, switched the scheduler to it, and added a `total <= 0 → skip upsert` guard so an empty TornStats response can never poison existing data again. Estimates will refill over the next 30-60 min as the scheduler runs with the corrected parser. Related to 1.31.3 — that was a downstream band-aid for the same root cause" },
    ],
  },
  {
    version: "1.31.4",
    date: "2026-05-15",
    title: "Fix — readable threat badges in light mode",
    changes: [
      { type: "fix", text: "Threat badges (easy/medium/hard/avoid) on the /enemies table and mobile cards were styled only for dark mode — `bg-{color}-900/60` over white background washed out to a pale tint with low-contrast text. Now use light-on-light in light mode (`bg-{color}-100 text-{color}-800`) and keep the existing dark styling under the `dark:` variant. Same pattern already used by AnnouncementList" },
    ],
  },
  {
    version: "1.31.3",
    date: "2026-05-15",
    title: "Fix — /enemies no longer shows everyone as 'easy 5'",
    changes: [
      { type: "fix", text: "Enemy threat scoring was labelling almost every enemy 'easy 5' regardless of level. Root cause: the spy_estimates table holds placeholder rows with total=0 for players where TornStats has no battle-stat data; the stat-based threat formula divided that zero by your real total, got a 0.0 ratio, and the 'ratio < 0.3 → easy' branch floored every such enemy at score 5. Now placeholder spy rows (total<=0) are skipped at the source, so those enemies fall back to the personalstats-based relative threat (xanax/refills/attacks_won/networth/level ratios), which produces the full easy/medium/hard/avoid spread again. Enemies with real spy estimates keep the more accurate stat-based score" },
    ],
  },
  {
    version: "1.31.2",
    date: "2026-05-15",
    title: "Hotfix 2 — roll back ALL user/* v2 selections (more shape mismatches found)",
    changes: [
      { type: "fix", text: "1.31.1 rolled back four torn/* selections but missed user/*. Playwright walkthrough showed /api/stocks/portfolio returning 500. Empirical probes confirmed: /v2/user/?selections=bars,cooldowns nests fields under a 'bars' object (v1 had top-level energy/nerve/happy/life), /v2/user/?selections=profile nests under 'profile' (v1 had top-level name/player_id/faction/status/last_action), /v2/user/?selections=stocks returns a LIST with shape {id, shares, transactions[]} (v1 was a dict keyed by stock_id with transactions{}). Rolled back fetch_member_bars, fetch_user_stocks, plus the 5 direct /user/ httpx calls in main.py, admin.py, scheduler/refresh_data, scheduler/refresh_avatars. v1 is frozen but stable. Proper v2 migration here needs reading the nested shape — tracked as backlog" },
      { type: "improve", text: "Updated V1_BASE comment in torn_client.py to enumerate which selections stay on v1 and why (so the next migration attempt has the breaking-shape list inline)" },
    ],
  },
  {
    version: "1.31.1",
    date: "2026-05-15",
    title: "Hotfix — roll back 4 v2 selections with breaking shape changes; fix /key/info parser",
    changes: [
      { type: "fix", text: "Empirical v2 probes after 1.31.0 deployed showed four selections changed shape between v1 and v2 in ways that broke our consumers: /v2/torn/stocks returns an array (v1 returned a dict keyed by id), /v2/torn/honors+medals same array vs dict, /v2/torn/items returns an array with value.market_price nested (v1 had flat market_value on top), and /v2/torn/rankedwars currently returns an error in v2. Rolled fetch_stock_market, fetch_honor_catalog, fetch_ranked_wars, and the four torn/items call sites (routers/market, routers/stocks, routers/travel, scheduler/refresh_data) back to /v1 with explicit comments. v1 is frozen but functional — proper v2 migration for these needs consumer-side refactors (iterating lists, reading new field names) and is now tracked as backlog. Endpoints that DID migrate cleanly (user/bars, user/stocks, user/profile across main+admin+scheduler+avatars, torn/companies) stay on v2" },
      { type: "fix", text: "Settings → API Key widget was returning 502 because /v2/key/info wraps the response under an outer 'info' key (not 'access' directly like the docs suggested). Parser now reads info.access.{level,type} and info.selections, with a flat-shape fallback in case Torn ever inlines it. Widget should now render with the green 'Full Access' badge for Full keys" },
    ],
  },
  {
    version: "1.31.0",
    date: "2026-05-15",
    title: "Torn API v2 sweep + Faction News audit + Key Info widget + chain 'interrupted' marker",
    changes: [
      { type: "feat", text: "New /news page surfaces Torn's full faction news log split into 9 audit categories: bank deposits, withdrawals, armoury deposits, armoury retracts, chain hits, attack notices, cesium use, revives, OC results. Pick a category in the chip bar to filter — useful for spotting unauthorized bank withdrawals, post-mortems on broken chains, or auditing armoury discipline. Previously TM Hub only ingested armoryDeposit; the other 8 categories were invisible until now. Backed by /api/faction/news?cat=X (v2 /faction/news, paginated)" },
      { type: "feat", text: "Settings page now shows what your Torn API key unlocks — access level (Public/Minimal/Limited/Full), how many sections are reachable, and a hint to regenerate the key at torn.com/preferences if you're missing data. Backed by the new /api/key/info endpoint which calls Torn v2 /key/info" },
      { type: "improve", text: "Chain page recent-attacks table now flags each attack with ⚠ when Torn's new v2 is_interrupted field is set — meaning the defender escaped mid-attack and the hit may not count toward chain respect. Backend schema migration 044 adds is_interrupted to attack_log; future chain audits can filter on it. Old rows backfill as 0 (no info)" },
      { type: "improve", text: "Backend REST clients migrated from Torn API v1 to v2 for 16 call sites: /torn/stocks, /torn/honors, /torn/companies, /torn/rankedwars, /torn/items (used by market/stocks/travel/scheduler), user/bars, user/stocks, plus the key-registration / auth / stakeout / avatar refresh paths. Torn API v1 is frozen (no new features), v2 is the active surface — this brings us onto the supported path and unlocks future v2-only fields. PersonalStats endpoints stay on v1 for now (v2 rebuilt that selection into a categorized shape we'd need to add a parser for; tracked separately)" },
      { type: "feat", text: "Plumbing for v2 /torn/itemstats added: new /api/market/items/{id}/stats endpoint returns historical circulation + market value for any item. UI integration on /market is next — for now it's a callable API for scripts and the companion" },
    ],
  },
  {
    version: "1.30.5",
    date: "2026-05-15",
    title: "Attack links work again — migrated from /loader.php to /page.php",
    changes: [
      { type: "fix", text: "Clicking Attack from Targets, Stakeout, Loot or Bounties used to open Torn at /loader.php?sid=attack&user2ID=<id> and show 'This endpoint is no longer available. Please use the new endpoints instead (page.php).' — Torn migrated its frontend router from loader.php to page.php. All 6 attack URLs (5 frontend pages + the attack_url field returned by /api/members) now point at the new /page.php?sid=attack form, and the URL builder is centralized in a single helper (frontend/src/lib/torn-urls.ts) so the next router migration is a one-line change. Companion userscript also now matches both URL forms on torn.com tabs so the attack-confirmation overlay keeps working on pinned tabs or stale bookmarks pointing at /loader.php" },
    ],
  },
  {
    version: "1.30.4",
    date: "2026-05-15",
    title: "Companion v0.10.3 — friendlier first connect in Torn PDA",
    changes: [
      { type: "fix", text: "Tapping Connect in the companion chip inside Torn PDA used to open hub.tri.ovh/extension-auth as a sized popup ('width=520,height=720'). Flutter's in-app webview renders that as a full-screen modal overlay that users instinctively dismiss by tapping the edge — and once dismissed there was no obvious way to bring it back. The userscript now detects Torn PDA (via UA + flutter_inappwebview bridge) and opens the auth page as a normal new tab, so you can swipe back to torn.com and re-tap Connect anytime. Desktop Tampermonkey keeps the sized popup since that works well there" },
      { type: "improve", text: "The login screen at /extension-auth now leads with a prominent 'Need a Torn API key?' card — a big mobile-friendly link straight to torn.com → Preferences → API Keys, plus a 1-2-3 mini-guide and a Torn-PDA-specific copy hint. The tiny 10px helper line was easy to miss on mobile; the new block makes the prereq impossible to overlook before you hit the input" },
      { type: "improve", text: "Added a small recovery line at the bottom of the login screen explaining how to reopen the connect flow if you closed it by accident — tap the ⚡ TM Hub Companion chip at the bottom-left of any torn.com page → Connect" },
      { type: "improve", text: "/install page now has a 'Before you start' note in both the Tampermonkey and Torn PDA cards, pointing at Torn → Preferences → API Keys so first-timers grab a Full Access key before they hit /extension-auth instead of after the prompt opens" },
    ],
  },
  {
    version: "1.30.3",
    date: "2026-05-15",
    title: "Spy deep-links work + 'Unknown player' fallback on known stats",
    changes: [
      { type: "fix", text: "Clicking 'Open in TM Hub →' from the companion intel card on a torn.com profile now lands on a working Spy Central page that auto-loads the spy estimate for that player (previously /spy/{id} 404'd because the dynamic route wasn't in the static export). Implementation uses /spy?id={id} so it works without dynamic routing — the page reads the query param via useSearchParams, fetches /api/spy/{id} (which triggers a TornStats refresh if the row is stale or missing), and renders the standard SpyResultCard above the regular search UI. Companion v0.10.2 updates the link target. Old /spy/{id} URLs still 404 (one-time pain for anyone with stale tabs), so re-open profiles after the companion auto-updates" },
      { type: "fix", text: "Known Stats list no longer renders '#2362436 [2362436]' (the same ID duplicated) when the player_name column is null — it now shows 'Unknown player' in muted italic with just [2362436] linking to the Torn profile, and rows with no stats anywhere get a subtle dimmed treatment. Plus the player name now links to /spy?id={id} so you can drill into the deep-link view without leaving TM Hub. As the TornStats refresh sweep fills in missing names (see 1.28.1 / 1.30.0), 'Unknown player' rows will resolve to real names automatically" },
      { type: "improve", text: "Known Stats table gets a 'Show N rows with no stats' toggle (off by default) so the list of actionable entries isn't drowned out by empty placeholder rows that haven't been backfilled yet. Counter in the header shows how many rows are currently hidden" },
    ],
  },
  {
    version: "1.30.2",
    date: "2026-05-15",
    title: "'No spy estimate' instead of fake 0/0/0/0 stats",
    changes: [
      { type: "fix", text: "When we don't actually have spy data for a player, the spy result card no longer renders '0 / 0 / 0 / 0' as if those were real stats — it now shows a clear 'No spy estimate available' message with a hint that a member-submit or the hourly TornStats refresh will fill it in. The Known Stats list and Faction Lookup also render '—' for any zero-value cell instead of a literal '0'. Backend hardening: /api/spy/{id} treats a stored estimate with total<=0 as missing (giving the on-demand TornStats fetch a chance to populate it instead of returning the placeholder), and /api/spy/known filters out zero-total rows so the Known Stats table only shows actionable data" },
    ],
  },
  {
    version: "1.30.1",
    date: "2026-05-15",
    title: "Companion v0.10.1 — Enter sends in chat dock",
    changes: [
      { type: "fix", text: "In the chat dock embedded on torn.com, pressing Enter now sends the message immediately (the way every other chat works). Shift+Enter still inserts a newline if you want a multi-line message. Previously Enter just inserted a newline and you had to hit Cmd/Ctrl+Enter to actually send — a confusing default that didn't match the main TM Hub chat. IME composition (e.g. Polish autocomplete) is respected: Enter during composition confirms the candidate without sending" },
    ],
  },
  {
    version: "1.30.0",
    date: "2026-05-15",
    title: "Always-fresh spy estimates — admin bulk refresh + hourly background loop",
    changes: [
      { type: "feat", text: "New admin button 'Refresh Spy Estimates Now' in the Analytics Dashboard runs a bulk pass through every stale row in spy_estimates (up to 500 per click), fetching fresh data from TornStats one player at a time at ~55 req/min (well under the API limit). 'Collect Stats Now' also fires the same refresh in the background, so a single click brings BOTH own-faction stat snapshots and enemy/known-player spy estimates back up to date. Backend: POST /api/admin/spy/refresh-stale-now" },
      { type: "improve", text: "Bumped the background refresh_stale_spies job from every 6h to every 1h and the per-run cap from 30 to 50 — at this rate the entire known-player set (typically 500-1000 rows) cycles through TornStats in well under a day instead of taking a week. Pacing increased from 0.5s to 1.1s between calls to stay safely under the TornStats 60/min ceiling. Result: any player whose estimate ages past 7 days gets refreshed automatically in the next ~hour without anyone clicking anything" },
    ],
  },
  {
    version: "1.29.0",
    date: "2026-05-15",
    title: "Companion v0.10 — stocks portfolio + ROI overlay on the stock market",
    changes: [
      { type: "feat", text: "Opening Torn's stock market (/loader.php?sid=stocks) now injects a TM Hub stocks card at the top of the page with: portfolio aggregates (total value, profit/loss in dollars, P/L %), 'Ready to collect' pills for any stock whose benefit or dividend is ripe right now, and the top 3 best marginal-ROI next-best moves with the dollar cost to buy in and rough days-to-break-even. Each recommendation reuses the same scoring logic as /stocks in TM Hub, so what you see on torn.com matches what you see in the hub" },
      { type: "feat", text: "ROI numbers prefer live item market prices when the benefit pays out a tradeable item (Lawyer Business Cards, Feathery Hotel Coupons, Erotic DVDs, etc — refreshed every 10 min server-side) and fall back to a hardcoded payout estimate otherwise. The card surfaces a small 'live price' hint on rows where the live market value drove the calculation" },
      { type: "improve", text: "When the linked API key doesn't have stock access (limited keys block /user/?selections=stocks) the card explains the situation and points at Torn → Preferences → API Keys to mint a Full Access key — instead of silently showing zeros. 60s cache so refreshing the stock page doesn't re-hit the Torn API" },
    ],
  },
  {
    version: "1.28.1",
    date: "2026-05-15",
    title: "Spy estimates stay fresh between wars",
    changes: [
      { type: "fix", text: "TornStats spy estimates were going stale and never refreshing — the 30-min refresh_spies job only batch-fetches the current enemy faction during a war, so your own faction and anyone else with an existing estimate would silently age past 30 days and get marked 'stale'. New scheduler job refresh_stale_spies walks the oldest rows every hour and re-fetches them via the single-player TornStats endpoint, paced under the API limit. On top of that, the /api/spy/{player_id} and /api/spy/faction/{id} endpoints now re-fetch on demand when a stored estimate is older than 7 days (previously they only fetched if no estimate existed at all). See 1.30.0 for the admin bulk-refresh button" },
    ],
  },
  {
    version: "1.28.0",
    date: "2026-05-15",
    title: "Companion v0.9 — bounties threat coloring + loot NPC overlay",
    changes: [
      { type: "feat", text: "On /bounties.php every bounty row now gets a TM Hub threat badge with score + source (spy / estimated / no data) and the row gets a subtle background tint: green for trivial/easy, amber for moderate, red for dangerous, deep red for lethal. The TM Hub threat scorer factors in your own stats when available, so you see relative difficulty — not just absolute totals. Saves you from spending 50 energy learning the hard way that the 'easy' $1.2M bounty was actually a 50M whale" },
      { type: "feat", text: "Visiting a loot NPC profile (Duke, Leslie, Jimmy, Bruno, Easter Bunny — auto-detected from TM Hub's tracked NPC list) injects a dedicated loot card with: current level highlighted in a 5-level grid, countdown to each next level, hospital release timer when applicable, and the full faction reservation list (members appearing in green if it's their own reservation). Plus inline 'Reserve a level' / 'Cancel my reservation' buttons that POST straight to /api/loot/reserve so you can claim your L5 without opening TM Hub" },
      { type: "improve", text: "Bounty page detection covers both /bounties.php and the SPA-style /loader.php?sid=bounties. Threat data is cached 60s so navigating between bounty pages doesn't re-hit the backend. Loot data cached the same way" },
    ],
  },
  {
    version: "1.27.0",
    date: "2026-05-15",
    title: "Companion v0.7 — inline write-back: flag off-limits / save target / watch from torn.com",
    changes: [
      { type: "feat", text: "TM Hub intel card on enemy profiles now has action buttons at the bottom: 🚫 Flag off-limits (during war), 🎯 Save to targets / Edit target, 🔍 Watch / Stop watching. Each opens a small modal with the relevant fields (reason / tag / difficulty / notes), POSTs to the backend, and refreshes the card optimistically. No more bouncing to hub.tri.ovh just to flag a med-out you noticed while attacking" },
      { type: "feat", text: "Flagging off-limits from torn.com auto-busts the main companion refresh cache, so the red OFF-LIMITS badge appears on the profile page within ~1s of you clicking 'Flag' — no waiting for the next poll cycle. Same fast-path for target / stakeout writes" },
      { type: "feat", text: "Edit target modal also surfaces a destructive 'Remove from targets' button so you can manage your hit list straight from torn.com. Stakeout removal uses a native confirm dialog because it's a faction-shared list and a misclick would affect everyone" },
      { type: "improve", text: "New generic modal helper (lib/modal.ts) for any future inline form action. Escape / backdrop click / Cancel all close. First field gets autofocus. Field types supported: text, textarea, select. Reusable for v0.8 bounties triage, v0.9 loot reservations, etc" },
    ],
  },
  {
    version: "1.26.2",
    date: "2026-05-15",
    title: "Dashboard stops exploding on partial Torn API responses",
    changes: [
      { type: "fix", text: "Dashboard was throwing 'Cannot read properties of undefined (reading length)' when Torn's API returned an organized-crime record without a participants array, or when the bounties / oc_crimes / chat_channels payloads were null because of an upstream timeout. Added defensive guards on every list-typed dashboard field so a single bad row no longer kills the whole load" },
    ],
  },
  {
    version: "1.26.1",
    date: "2026-05-15",
    title: "Companion v0.6.1 — status chip moved left, chat unread sync fix",
    changes: [
      { type: "fix", text: "Status chip was rendering bottom-right where Torn's own footer chat widgets live, so on many pages it got hidden behind them. Moved to bottom-left so it's always visible regardless of which Torn page you're on" },
      { type: "fix", text: "Chat dock unread badge was sticking on the old count even after you opened a channel and read everything — the local in-memory state didn't update when mark-as-read fired. Now the badge optimistically zeroes the channel locally the moment you scroll to bottom (or open the channel for the first time), then pokes the unread poller to confirm with the backend. Counts on the channel dropdown also refresh immediately" },
      { type: "fix", text: "Scrolling back down to the bottom of a channel now marks it as read — previously the auto-mark only triggered on poll receipts, so a user scrolling up to look at history and then scrolling down didn't actually clear the unread state until 5s of new poll" },
    ],
  },
  {
    version: "1.26.0",
    date: "2026-05-15",
    title: "Companion v0.6 — spy + targets + stakeout intel on profile pages",
    changes: [
      { type: "feat", text: "TM Hub intel card on every enemy profile page and the attack screen. Combines three pieces of data into one stack: spy estimate (strength / defense / speed / dexterity grid + total + how stale + which source), your personal target list status (tag + difficulty + notes), and faction-shared stakeout flag (who's watching this player). Empty sections hide automatically — the card only renders if there's at least one piece of intel to show" },
      { type: "feat", text: "Difficulty pills color-coded — green for easy, amber for medium, red for hard — so you can pattern-match at a glance instead of reading the word. Spy stats formatted as 12.4M / 850k for fast reading. 'Open in TM Hub →' deep-link in the card header for jumping into the full spy detail page when needed" },
      { type: "improve", text: "10-min per-player intel cache so flicking between attack and profile pages doesn't re-hit the backend each time. Targets and stakeout lists cached 5 min faction-wide" },
      { type: "improve", text: "Removed the duplicate 'not connected' banner on profile/attack pages — the persistent status chip in the corner is now the single source of truth for connection state. Less screen real estate burned on the same warning" },
    ],
  },
  {
    version: "1.25.0",
    date: "2026-05-15",
    title: "Companion v0.5 — chat dock inside torn.com",
    changes: [
      { type: "feat", text: "Persistent chat dock — floating green chat button above the status chip on every torn.com page. Click to expand into a 360×480 panel with channel selector, message stream, and composer. Switch between channels via the dropdown header. New messages poll every 5s while open; the unread badge on the collapsed button polls every 30s when closed" },
      { type: "feat", text: "Mentions of you inside the dock are highlighted with an amber background so they stand out in a scrolling channel. Auto-scroll when you're at the bottom; a 'New messages ↓' pill appears if you've scrolled up and new traffic arrives. Cmd/Ctrl+Enter to send" },
      { type: "feat", text: "Mark-as-read happens automatically when you reach the bottom of the message stream — no more wondering why /team still shows unread after you actually read everything in the dock" },
      { type: "feat", text: "Backend: GET /api/chat/channels/{id}/messages now accepts ?after=<id> in addition to ?before=<id>. The chat dock polls with ?after to fetch only new messages without re-downloading the whole window" },
      { type: "improve", text: "Admin-only channels are hidden from the dock's channel switcher for non-admins, so the dropdown stays clean" },
    ],
  },
  {
    version: "1.24.0",
    date: "2026-05-15",
    title: "Companion v0.4 — status chip + roadmap on /install",
    changes: [
      { type: "feat", text: "New persistent status chip in the bottom-right corner of every torn.com page. Always visible so you can tell at a glance whether the TM Hub Companion is loaded, which version (e.g. v0.4.0), and which player you're connected as. When not connected, the chip prompts with a 'Connect' button. Replaces the standalone settings gear — the chip now hosts the settings popover too" },
      { type: "feat", text: "/install page now has two side-by-side cards: 'What works today' (live features the userscript ships) and 'Coming up' (roadmap of what's next — chat dock, spy badges, targets, bounties threat coloring, loot timers, stocks ROI). Faction members get a clear view of where the project is and where it's going" },
      { type: "improve", text: "Settings popover redesigned — instead of confusing toggle-row clicks, separate sections for channel enable/disable, quick mute timers (with remaining-time badge), and disconnect. Open via the gear icon embedded in the status chip" },
    ],
  },
  {
    version: "1.23.0",
    date: "2026-05-15",
    title: "Companion v0.3 — @mention alerts inside torn.com",
    changes: [
      { type: "feat", text: "Whenever someone @mentions you in TM Hub chat — #war-room, #general, anywhere — the Companion userscript pops a toast on whatever torn.com page you are on within ~15s. Toast shows who mentioned you, in which channel, and a preview of the message. Click to jump to that channel; ignore to dismiss. If torn.com is in a background tab and you granted browser notification permission, a native OS-level alert fires too" },
      { type: "feat", text: "New backend endpoint GET /api/chat/mentions/recent returns chat messages where the caller is in the mentions array, with channel name and message preview (200 char clamp). Powers the Companion mention feature without exposing the full chat firehose to userscripts" },
      { type: "improve", text: "Polling discipline — mentions poll every 15s, notifications every 45s, heartbeat every 60s. All paused when the torn.com tab is hidden (Page Visibility API). Exponential backoff on 5xx so a backend outage doesn't get hammered" },
      { type: "improve", text: "Use the gear icon in the bottom-right of torn.com to mute @mentions for 1h without disconnecting the whole Companion" },
    ],
  },
  {
    version: "1.22.0",
    date: "2026-05-15",
    title: "TM Hub Companion v0.2 — notifications and presence inside torn.com",
    changes: [
      { type: "feat", text: "TM Hub Companion userscript v0.2.0 surfaces TM Hub inbox notifications as toasts directly on torn.com. Whenever a new notification lands in your TM Hub inbox, a small card slides in from the bottom-right of whatever Torn page you are on. Click to open the inbox, click the × to dismiss. If your tab is backgrounded and you have granted browser notification permission, a native OS-level alert also fires" },
      { type: "feat", text: "Presence heartbeat — while you have torn.com open, the companion pings TM Hub every 60s. Faction members now see you as online on /team even when you don't have hub.tri.ovh open in another tab. Auto-paused when the torn.com tab is hidden, so background tabs don't keep you 'online' indefinitely" },
      { type: "feat", text: "Settings gear in the bottom-right corner of torn.com — quick toggles for inbox notifications, @mentions, and presence, plus 'mute for 1h' shortcuts and a one-click 'Disconnect' that clears the companion token" },
      { type: "feat", text: "TM Hub Companion is now linked from Resources in the main nav (📚 → ⚡ TM Hub Companion). Direct path for faction members to find install instructions" },
      { type: "improve", text: "Reworked /install landing — removed the 'Chrome extension coming soon' placeholder since a native browser extension is not currently on the roadmap. Two clear paths: Tampermonkey (desktop) and Torn PDA (mobile), both running the same hosted userscript" },
      { type: "improve", text: "Companion ships with adaptive polling that pauses when the tab is hidden and backs off exponentially on backend errors, so a Coolify outage doesn't get hammered by every open torn.com tab" },
    ],
  },
  {
    version: "1.21.1",
    date: "2026-05-15",
    title: "Companion auth handoff actually works now",
    changes: [
      { type: "fix", text: "The 'Connect to TM Hub' banner in the userscript opened the auth page via a plain target=\"_blank\" link with rel=\"noopener\", which by definition nulls out window.opener — so the popup had nobody to postMessage the token to. Switched to a programmatic window.open() with a named target. Now the token flows back automatically and the userscript caches it without copy-paste" },
    ],
  },
  {
    version: "1.21.0",
    date: "2026-05-15",
    title: "TM Hub Companion — userscript for inside torn.com",
    changes: [
      { type: "feat", text: "New TM Hub Companion userscript injects faction intel directly into torn.com pages. Phase 1 surfaces OFF-LIMITS flags from /war on enemy profile and attack pages — when a teammate has flagged a player as med-out or dip, you see a red banner the moment you open their profile and a confirmation modal before the Attack button fires. No more accidentally breaking agreements because the chat scroll moved" },
      { type: "feat", text: "New /install landing page with three install paths (Tampermonkey userscript, Chrome / Firefox extension placeholder, Torn PDA) and step-by-step instructions. The userscript path works day-one in Tampermonkey, Violentmonkey, Torn PDA, and any other GM-compatible runtime — no Web Store review wait" },
      { type: "feat", text: "New /extension-auth page mints a 90-day extension JWT and hands it to the userscript via window.postMessage. Falls back to a copy-paste flow if postMessage is blocked (e.g. opened directly instead of through the companion)" },
      { type: "improve", text: "Backend: new POST /api/extension/issue-token endpoint, GET /api/wars/current lookup, and CORS allow-list for https://www.torn.com so the userscript can talk to hub.tri.ovh from inside a torn.com tab. Extension tokens carry a distinct scope claim and can be revoked independently of session tokens" },
    ],
  },
  {
    version: "1.20.0",
    date: "2026-05-15",
    title: "War-time off-limits tracker (med-out / dip agreements)",
    changes: [
      { type: "feat", text: "Flag enemy players as 'off-limits' during a war so the rest of the faction knows not to attack them — covers med-out agreements ('I let them out of hospital, don't re-hospitalize') and dip arrangements ('do not attack at all this war'). Open the Enemies page during an active war, hit the new {🚫} button next to any enemy, and add an optional reason. The flag is faction-wide and tied to the current war_id, so it auto-disappears when the war ends" },
      { type: "feat", text: "Off-limits enemies show a red badge and tinted row in both mobile and desktop views. Clicking 'Attack' on a flagged player opens a confirmation modal with who flagged them and why — you can still attack anyway if you have a reason, but you won't break a teammate's agreement by accident" },
      { type: "feat", text: "New 'Diplomatic' filter row on the Enemies page (active only during a war): 'Off-limits only' to review every standing agreement, 'Hide off-limits' to focus on attackable targets. Persists in the URL like the other filters" },
      { type: "improve", text: "Members can edit and remove only their own flags; admins can manage any. The flag header shows who set it, so audit is trivial. Backend ownership checks enforced server-side, not just in the UI" },
    ],
  },
  {
    version: "1.19.1",
    date: "2026-05-15",
    title: "Browser Sentry stops crying when the network blinks",
    changes: [
      { type: "fix", text: "Background polls (heartbeat, chat/unread) used to raise a Sentry event whenever a user's network blinked or the tab was closed mid-fetch — the browser-side equivalent of the upstream Torn 5xx noise the backend already drops. The frontend Sentry beforeSend now filters out handled `TypeError: Failed to fetch` / `NetworkError when attempting to fetch resource` / `Load failed` events that have no in-app stack frame, so the Sentry inbox stops counting closed-tab events as real bugs. Genuine fetch bugs (in-app frame present, or unhandled) still come through" },
    ],
  },
  {
    version: "1.19.0",
    date: "2026-05-15",
    title: "Icon refresh, mobile card layouts, and real error states",
    changes: [
      { type: "fix", text: "Redrew the TM Hub app icon with a proper safe-area inset so it doesn't get clipped on home screens. New Apple touch icon, dedicated monochrome push notification badge, and the install prompt + offline page now use the rendered PNG instead of an inline glow SVG (no more inconsistent login-screen icon)" },
      { type: "feat", text: "New shared <AppIcon> component replaces inline emoji across the navigation and key pages. Nav, sidebar, browse sheet, search bar, inbox badge, theme toggle, and admin link now render crisp SVG icons that scale, match the dark/light theme, and stop drifting across operating systems" },
      { type: "improve", text: "Most data pages (activity, analytics, awards, bounties, chain, dashboard, market, notifications, revives, stocks, targets, travel) now show a real error banner with a Retry button when an API call fails instead of silently rendering empty. You'll always know whether 'no data' means 'no data' or 'something broke'" },
      { type: "improve", text: "Mobile-first card layouts on activity, awards, bounties, and stocks — no more horizontal-scroll tables on phone. Each row becomes a tappable card with the important columns surfaced. Desktop keeps the dense table view" },
    ],
  },
  {
    version: "1.18.0",
    date: "2026-05-08",
    title: "Combine filters on the Enemies page",
    changes: [
      { type: "feat", text: "Enemy filters are now multi-select chips split into two groups — Status (Okay, Hospital) and Activity (Online, Idle, Offline). Pick any combination: 'Okay + Offline' shows sleeping attackable targets (the request that started this), 'Okay + Online + Idle' is the old Attackable preset, etc. Empty group = no constraint. Active filters sync to the URL (?status=okay&activity=offline) so you can bookmark or share a view" },
      { type: "improve", text: "The old single 'Attackable' filter quietly excluded offline players — fine for fast hits, but it meant you couldn't surface easy sleeping targets at all. Splitting Status from Activity makes that combination expressible and removes a hidden assumption" },
    ],
  },
  {
    version: "1.17.0",
    date: "2026-05-08",
    title: "Stay logged in — no more daily API key paste",
    changes: [
      { type: "feat", text: "New 'Stay logged in' checkbox on the login screen (on by default). Tick it and your session lasts 90 days — the token auto-refreshes every time you use the app, so an active player never sees the login wall again. Untick it on a shared computer and the session reverts to the previous 24h behaviour" },
    ],
  },
  {
    version: "1.16.6",
    date: "2026-05-01",
    title: "Sentry 504 silencer — finishing the job",
    changes: [
      { type: "fix", text: "The 1.16.5 cleanup wasn't actually silencing Torn 504s — Sentry's asyncio integration was independently grabbing every parallel scheduler task exception before our demote helper could see it. Now filtered at the SDK level (before_send), so upstream 5xx / timeouts / connection errors genuinely stop becoming Sentry issues regardless of which job hits them" },
    ],
  },
  {
    version: "1.16.5",
    date: "2026-04-30",
    title: "Sentry stops drowning in upstream Torn 504s",
    changes: [
      { type: "improve", text: "Scheduler jobs no longer flood Sentry with errors when Torn API returns 504 / times out — those are upstream hiccups the scheduler already retries next cycle, not bugs. They're now warnings (still in logs) so real bugs aren't buried in noise" },
      { type: "fix", text: "collect_stats was double-reporting per-member Torn failures (logger.exception + manual capture_exception); refresh_data sub-jobs (loot/stock/market/awards/attack/bars/OC/stakeout) and refresh_spies were also leaking upstream noise as Sentry errors. All routed through one demote helper now" },
    ],
  },
  {
    version: "1.16.4",
    date: "2026-04-29",
    title: "End-to-end observability for background work",
    changes: [
      { type: "improve", text: "All 11 scheduler jobs now report exceptions to Sentry with a job tag — previously only stat collection did, so a silent failure in armoury polling, company snapshots, revive checks, etc. was invisible until a user noticed missing data" },
      { type: "improve", text: "Two jobs that ran tasks in parallel (collect_company_snapshots, discover_companies) used to swallow per-task stack traces inside asyncio.gather — every individual failure now hits Sentry with the company id" },
      { type: "feat", text: "New admin-only endpoint /api/admin/scheduler/status returns leadership state plus per-task last finished_at and outcome — curl/cron canary for 'is anything still running?' without grepping container logs" },
      { type: "improve", text: "API client now reports unexpected fetch failures to Sentry centrally instead of relying on each page to remember — 401/403/404 stay quiet (expected app states), 5xx and unexpected 4xx fan out automatically" },
    ],
  },
  {
    version: "1.16.3",
    date: "2026-04-29",
    title: "Stat Growth keeps collecting after a deploy",
    changes: [
      { type: "fix", text: "Scheduler leader election now retries when the previous deploy left a stale Redis lease — previously, if both new workers booted into the 30s TTL window, both became followers forever and the 15-min stat collector never fired. Followers now run a watchdog that retries acquire and starts the scheduler once the stale lease expires" },
      { type: "improve", text: "Stat snapshots collector now logs a per-status breakdown (success / fetch_none / exceptions / total) every cycle and reports per-player Torn errors to Sentry — the 'why is Stat Growth stale?' question is now answerable from the dashboard instead of grepping logs" },
      { type: "improve", text: "Stats endpoints log INFO with player id, snapshot count, baseline/latest dates and live-fetch fallback flag; the leaderboard endpoint logs WARNING when the table is empty (canary that the scheduler isn't running)" },
      { type: "improve", text: "Stat Growth page shows a small 'Latest snapshot: …' banner so it's obvious whether you're looking at fresh data or a >36h gap" },
    ],
  },
  {
    version: "1.16.1",
    date: "2026-04-27",
    title: "Multi-worker startup is race-safe",
    changes: [
      { type: "fix", text: "Migration runner is now safe under multi-worker boot — previously two gunicorn workers could race on a fresh migration and crash startup with a UNIQUE constraint error; now a file lock serializes them so only one applies" },
    ],
  },
  {
    version: "1.16.0",
    date: "2026-04-27",
    title: "Sprint 2 #13 — Glitchtip wired (no-op until DSN set)",
    changes: [
      { type: "improve", text: "Backend and browser are now ready to report errors and slow traces to a self-hosted Glitchtip instance — turn it on by setting SENTRY_DSN and rebuilding. Until then it stays completely silent" },
      { type: "improve", text: "Tight PII filter scrubs Torn API keys, auth tokens, and cookies out of every event before transmission — covered by 15 dedicated tests on the backend and the browser uses an identical scrubber" },
    ],
  },
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
