// frontend/src/data/changelog.ts
//
// CHANGELOG STYLE GUIDE
// =====================
// Each change is one of three types: fix / feat / improve.
//
// FIX shape — uses a Before / Now / Why pattern:
//   summary  one-line headline, player-facing, ~60-100 chars
//   before   what was broken in user terms (the symptom, not the code), ~80-140 chars
//   after    how it works now, ~80-140 chars
//   cause    optional one-line "why it broke" in plain English (no fn/file names), ~60-100 chars
//
// FEAT / IMPROVE shape:
//   summary  one-line headline, ~60-100 chars
//   detail   optional 1-2 sentences explaining why a player would care, ~120-200 chars
//
// Rules:
//   - English only. No Polish.
//   - One sentence per field. If it runs longer, it belongs in the git log.
//   - Describe symptoms, not implementations. "Spy estimates showed 0 for most enemies"
//     beats "scheduler called wrong getattr on PersonalStats".
//   - No code identifiers, file paths, commit refs, or function names in user-facing fields.
//   - `cause` is for the curious player, not the engineer. "TornStats response shape changed"
//     beats "fetch_tornstats_spy missing spy block".

interface FixChange {
  type: "fix";
  summary: string;
  before: string;
  after: string;
  cause?: string;
}

interface FeatChange {
  type: "feat";
  summary: string;
  detail?: string;
}

interface ImproveChange {
  type: "improve";
  summary: string;
  detail?: string;
}

export type ChangelogChange = FixChange | FeatChange | ImproveChange;

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: ChangelogChange[];
}

export const CURRENT_VERSION = "1.34.0";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.34.0",
    date: "2026-05-15",
    title: "Companion v0.13 — faction roster intel overlay",
    changes: [
      {
        type: "feat",
        summary: "Enemy faction member rows now show TM Hub intel inline on torn.com",
        detail: "Open any faction profile on Torn and every member row gets a tint by threat tier plus pills for OFF-LIMITS, your saved target tag, stakeout watches, and spy coverage age — no clicking through to TM Hub.",
      },
      {
        type: "feat",
        summary: "Faster scan of who is safe to attack and who is flagged",
        detail: "OFF-LIMITS pills appear when you are at war and a teammate has flagged the player. Members without spy data show a 'no spy' chip so you know we are guessing only from level.",
      },
    ],
  },
  {
    version: "1.33.0",
    date: "2026-05-15",
    title: "Companion v0.12 — profile intel redesign with live toggle buttons",
    changes: [
      {
        type: "feat",
        summary: "Profile INTEL overlay redesigned with an action-first 'Decision Stack' layout",
        detail: "The card now leads with the hero total estimate, then source / age / confidence pills, then stats, then actions — so you decide and act faster on a player's profile.",
      },
      {
        type: "feat",
        summary: "All three intel actions are now live toggles (save target / watch / off-limits)",
        detail: "Saved / Watching / Off-limits buttons glow green when active and flip to red on hover — tap to undo with a confirm. The old Edit-target modal is gone; tag and note edits live on TM Hub web.",
      },
      {
        type: "feat",
        summary: "Target tags and stakeout info now live inline inside the intel body",
        detail: "On mobile they stack under the stat grid; on desktop they sit side-by-side as one row — saves ~40px of vertical space when a player is both saved and on stakeout.",
      },
      {
        type: "fix",
        summary: "Profile intel card no longer renders broken on narrow Torn PDA viewports",
        before: "On ~320px mobile the title 'TM HUB INTEL' wrapped one letter-cluster per line and action buttons were pushed off-screen.",
        after: "Header stays on one line, button labels are shorter on mobile, and the Hub link collapses to a single ↗ icon below 480px wide.",
        cause: "The header and button labels had no rule keeping each on one line.",
      },
      {
        type: "feat",
        summary: "Unflag a player off-limits directly from their Torn profile",
        detail: "Previously you had to open the TM Hub web UI to remove an off-limits flag. Now there's a green '✓ Off-limits — tap to unflag' button right on the intel card during an active war.",
      },
    ],
  },
  {
    version: "1.32.0",
    date: "2026-05-15",
    title: "Companion v0.11 — friendlier first connect + smaller attack-page footprint",
    changes: [
      {
        type: "feat",
        summary: "Companion launch button now shows a clear disconnected vs connected state",
        detail: "Disconnected shows a yellow plug icon with a gentle pulse and a 'Connect TM Hub Companion' tooltip; connected shows the usual green chat bubble. It updates within 5 seconds without a page reload.",
      },
      {
        type: "feat",
        summary: "First-run onboarding popover explains what the Connect button does",
        detail: "About 1.5 seconds after page load on torn.com the popover invites you to connect with your Torn API key. Clicking the disconnected button always shows it as a 'what's about to happen' gate before the auth window opens.",
      },
      {
        type: "feat",
        summary: "After companion auth you get bounced back to the Torn page you came from",
        detail: "On desktop the auth popup auto-closes about a second after success; on Torn PDA the page redirects back to the original Torn URL. A manual 'Back to Torn' link is always present as a fallback.",
      },
      {
        type: "improve",
        summary: "Slimmer login card on the connect handoff so it feels like one step, not two",
        detail: "Instead of showing the full TM Hub branding, the connect page now shows a compact 'Connect Companion — one step, we'll wire up the userscript and bring you back to Torn' card.",
      },
      {
        type: "fix",
        summary: "Companion status chip showed 'v0.0.0' instead of the real version",
        before: "The version chip on every torn.com page reported v0.0.0 regardless of which build of the companion was actually running.",
        after: "The chip reports the real version (e.g. v0.11.0) reliably across Tampermonkey, Violentmonkey, and Torn PDA.",
        cause: "A runtime guard around the version constant always failed in the userscript environment, so the fallback won.",
      },
      {
        type: "fix",
        summary: "Intel card no longer pushes the Attack button down on the attack page",
        before: "On the attack screen the intel card was injected above the page header, shoving the Attack button down and breaking muscle memory during quick rotations.",
        after: "The off-limits badge and attack-intercept modal still render on the attack page; the full intel block stays on the profile page where there's no Attack button to nudge.",
      },
    ],
  },
  {
    version: "1.31.5",
    date: "2026-05-15",
    title: "Fix — spy estimates no longer wiped to zeros every 30 min",
    changes: [
      {
        type: "fix",
        summary: "Spy estimates stay intact between background refreshes",
        before: "Most enemies' spy data was being silently wiped to all zeros — 87% of estimates had total stats of 0.",
        after: "Real battle stats now persist between refreshes, and an empty TornStats reply can't overwrite good data anymore.",
        cause: "Background job was reading battle stats from the wrong part of the TornStats response.",
      },
    ],
  },
  {
    version: "1.31.4",
    date: "2026-05-15",
    title: "Fix — readable threat badges in light mode",
    changes: [
      {
        type: "fix",
        summary: "Threat badges on the Enemies page are readable in light mode again",
        before: "Easy/medium/hard/avoid badges on the Enemies table and mobile cards washed out to a pale tint with barely-readable text under light mode.",
        after: "Badges now use proper light-on-light colors in light mode and keep their darker styling when the dark theme is active.",
        cause: "The badge colors were only styled for dark mode and inherited dark backgrounds against a white page.",
      },
    ],
  },
  {
    version: "1.31.3",
    date: "2026-05-15",
    title: "Fix — /enemies no longer shows everyone as 'easy 5'",
    changes: [
      {
        type: "fix",
        summary: "Enemy threat scoring gives a real spread again instead of labelling everyone 'easy 5'",
        before: "Almost every enemy on the Enemies page was tagged 'easy 5' regardless of their actual level or stats.",
        after: "Enemies with no real spy data fall back to the activity-based threat score, so you see the full easy/medium/hard/avoid spread; enemies with real spy data still get the stat-based score.",
        cause: "Placeholder spy rows with zero total stats were being treated as real data, dividing to a 0.0 ratio and floor-pinning everyone to 'easy'.",
      },
    ],
  },
  {
    version: "1.31.2",
    date: "2026-05-15",
    title: "Hotfix 2 — roll back more Torn API v2 selections with breaking shape changes",
    changes: [
      {
        type: "fix",
        summary: "Stocks portfolio and user data endpoints work again after the v2 migration broke them",
        before: "The stocks portfolio page was returning 500 errors and several user data lookups silently broke after the v2 sweep.",
        after: "All the affected user data calls are back on the stable v1 endpoints with explicit notes for the next migration attempt.",
        cause: "More v2 endpoints than expected had reshaped their response bodies in ways our consumers couldn't read.",
      },
      {
        type: "improve",
        summary: "Documented which Torn API selections stay on v1 and why",
        detail: "The list of breaking-shape selections is now inline in the API client so the next v2 migration attempt has a clear list of consumer-side refactors to tackle first.",
      },
    ],
  },
  {
    version: "1.31.1",
    date: "2026-05-15",
    title: "Hotfix — roll back four v2 selections; fix API Key widget",
    changes: [
      {
        type: "fix",
        summary: "Stocks, honors, ranked wars, and items endpoints work again after the v2 migration",
        before: "After the Torn v2 sweep, stocks, honors, ranked wars, and items lookups returned empty data or errors across the site.",
        after: "Those four selections are rolled back to v1 (frozen but functional) with explicit notes; the endpoints that did migrate cleanly stay on v2.",
        cause: "Torn's v2 reshaped several response bodies from dict-keyed objects to arrays — our consumers were still reading the old shape.",
      },
      {
        type: "fix",
        summary: "Settings → API Key widget renders again instead of showing a 502",
        before: "Opening Settings showed a 502 error in place of the 'Full Access' badge that tells you what your Torn API key unlocks.",
        after: "The widget now renders correctly with the access level pill, including the green 'Full Access' badge for Full keys.",
        cause: "Torn's v2 wraps the key info under an extra nesting layer the parser wasn't aware of.",
      },
    ],
  },
  {
    version: "1.31.0",
    date: "2026-05-15",
    title: "Torn API v2 sweep + Faction News audit + Key Info widget + chain 'interrupted' marker",
    changes: [
      {
        type: "feat",
        summary: "New Faction News page surfaces all 9 audit categories from Torn's news log",
        detail: "Filter by bank deposits, withdrawals, armoury moves, chain hits, attack notices, cesium use, revives, or OC results — useful for spotting unauthorized bank withdrawals or auditing armoury discipline.",
      },
      {
        type: "feat",
        summary: "Settings page now shows what your Torn API key actually unlocks",
        detail: "See the access level (Public/Minimal/Limited/Full), how many sections are reachable, and a hint to regenerate your key on Torn if you're missing data.",
      },
      {
        type: "improve",
        summary: "Chain recent-attacks table now flags hits where the defender escaped mid-attack",
        detail: "Attacks marked as interrupted by Torn get a warning icon, so chain audits can tell which hits may not have counted toward chain respect.",
      },
      {
        type: "improve",
        summary: "Backend migrated from Torn API v1 to v2 for 16 call sites",
        detail: "Torn API v1 is frozen with no new features, so moving to v2 puts us on the supported path and unlocks future v2-only data. PersonalStats endpoints stay on v1 for now because the v2 shape needs a new parser.",
      },
      {
        type: "feat",
        summary: "New API endpoint exposes historical item circulation and market value",
        detail: "Returns long-running market data for any item, ready for scripts and the companion. UI integration on the Market page is next.",
      },
    ],
  },
  {
    version: "1.30.5",
    date: "2026-05-15",
    title: "Attack links work again — migrated to Torn's new page router",
    changes: [
      {
        type: "fix",
        summary: "Attack buttons from Targets, Stakeout, Loot, and Bounties open the attack page again",
        before: "Clicking Attack from any TM Hub page opened a Torn URL that showed 'This endpoint is no longer available. Please use the new endpoints instead.'",
        after: "Every attack link now points at Torn's new page router, and the companion also recognizes both the old and new attack URL forms.",
        cause: "Torn migrated its frontend router and the old attack URLs we were generating stopped working.",
      },
    ],
  },
  {
    version: "1.30.4",
    date: "2026-05-15",
    title: "Companion v0.10.3 — friendlier first connect in Torn PDA",
    changes: [
      {
        type: "fix",
        summary: "Connect flow works inside Torn PDA without trapping you in a modal",
        before: "Tapping Connect inside Torn PDA opened the auth page as a full-screen modal that users instinctively dismissed, with no obvious way to bring it back.",
        after: "On Torn PDA the auth page now opens as a normal new tab, so you can swipe back to torn.com and re-tap Connect anytime. Desktop keeps the sized popup.",
        cause: "The auth page was opened as a sized popup, which Torn PDA's in-app browser renders as a sticky overlay.",
      },
      {
        type: "improve",
        summary: "Login screen leads with a prominent 'Need a Torn API key?' card",
        detail: "A big mobile-friendly link straight to Torn → Preferences → API Keys plus a 1-2-3 mini-guide, so first-timers don't miss the prerequisite before they hit the input.",
      },
      {
        type: "improve",
        summary: "Login screen explains how to reopen the connect flow if you closed it by accident",
        detail: "A small recovery line at the bottom tells you to tap the TM Hub Companion chip at the bottom-left of any torn.com page and pick Connect.",
      },
      {
        type: "improve",
        summary: "Install page has a 'Before you start' note pointing at Torn's API Keys settings",
        detail: "Both the Tampermonkey and Torn PDA cards now nudge first-timers to grab a Full Access key on Torn before they hit the connect screen.",
      },
    ],
  },
  {
    version: "1.30.3",
    date: "2026-05-15",
    title: "Spy deep-links work + 'Unknown player' fallback on Known Stats",
    changes: [
      {
        type: "fix",
        summary: "'Open in TM Hub' from the companion intel card now lands on a working spy page",
        before: "Clicking 'Open in TM Hub' from the companion on a Torn profile hit a 404 because the deep-link target didn't exist in the static export.",
        after: "The link now opens Spy Central with the player's spy estimate auto-loaded, and triggers a fresh TornStats fetch if the data is stale or missing.",
        cause: "The deep-link route wasn't included in the site's static export.",
      },
      {
        type: "fix",
        summary: "Known Stats list no longer shows '#2362436 [2362436]' for unnamed players",
        before: "Rows with a missing player name rendered the player ID twice — once as the name and once as the ID link.",
        after: "Rows now show 'Unknown player' in muted italic with the ID linking to the Torn profile, and the player name links into the spy deep-link view. Names backfill as the TornStats sweep catches up.",
      },
      {
        type: "improve",
        summary: "Known Stats table can hide rows with no stats so actionable rows stand out",
        detail: "A 'Show N rows with no stats' toggle (off by default) keeps the list focused on entries that have real data, with a counter showing how many rows are hidden.",
      },
    ],
  },
  {
    version: "1.30.2",
    date: "2026-05-15",
    title: "'No spy estimate' instead of fake 0/0/0/0 stats",
    changes: [
      {
        type: "fix",
        summary: "Spy result card shows 'No spy estimate available' instead of fake zeros",
        before: "When we had no spy data for a player, the spy card rendered '0 / 0 / 0 / 0' as if those were real stats, which was misleading at a glance.",
        after: "The card now shows a clear 'No spy estimate available' message with a hint that a member submit or the hourly TornStats refresh will fill it in; Known Stats and Faction Lookup render an em-dash for any zero cell.",
        cause: "Placeholder rows with zero total stats were treated as real estimates rather than as missing data.",
      },
    ],
  },
  {
    version: "1.30.1",
    date: "2026-05-15",
    title: "Companion v0.10.1 — Enter sends in chat dock",
    changes: [
      {
        type: "fix",
        summary: "Pressing Enter in the embedded chat dock now sends the message",
        before: "In the chat dock embedded on torn.com, Enter inserted a newline and you had to press Cmd/Ctrl+Enter to actually send — which didn't match the main TM Hub chat.",
        after: "Enter sends the message immediately and Shift+Enter inserts a newline. Polish/IME composition is respected — Enter during composition just confirms the candidate.",
      },
    ],
  },
  {
    version: "1.30.0",
    date: "2026-05-15",
    title: "Always-fresh spy estimates — admin bulk refresh + hourly background loop",
    changes: [
      {
        type: "feat",
        summary: "New admin button refreshes every stale spy estimate on demand",
        detail: "'Refresh Spy Estimates Now' walks up to 500 stale rows per click, fetching fresh TornStats data well under the API rate limit. 'Collect Stats Now' also triggers the same refresh in the background.",
      },
      {
        type: "improve",
        summary: "Background spy refresh runs every hour instead of every six",
        detail: "The whole known-player set now cycles through TornStats in under a day instead of a week, so any estimate older than 7 days gets refreshed automatically within the next hour.",
      },
    ],
  },
  {
    version: "1.29.0",
    date: "2026-05-15",
    title: "Companion v0.10 — stocks portfolio + ROI overlay on the stock market",
    changes: [
      {
        type: "feat",
        summary: "Stock market page on torn.com now shows your TM Hub portfolio at the top",
        detail: "Card displays total value, profit/loss in dollars and percent, 'Ready to collect' pills for ripe benefits or dividends, and the top three best next moves with buy-in cost and rough days to break even.",
      },
      {
        type: "feat",
        summary: "ROI uses live item market prices for stocks that pay out tradeable items",
        detail: "Lawyer Business Cards, Feathery Hotel Coupons, Erotic DVDs and similar payouts price off the live market every 10 minutes, with a small hint shown on rows where that drove the calculation.",
      },
      {
        type: "improve",
        summary: "Limited API keys get a clear fix-it message instead of silent zeros on the stocks card",
        detail: "When your key lacks stock access the card explains why and points you to Torn → Preferences → API Keys to mint a Full Access key, and refresh is cached for 60 seconds.",
      },
    ],
  },
  {
    version: "1.28.1",
    date: "2026-05-15",
    title: "Spy estimates stay fresh between wars",
    changes: [
      {
        type: "fix",
        summary: "Spy estimates no longer go stale and stop refreshing outside of wars",
        before: "Spy data for your own faction and anyone outside the current enemy aged silently past 30 days and got marked stale.",
        after: "A new hourly job walks the oldest estimates and re-fetches them, and any estimate older than a week refreshes on demand when you open a player.",
        cause: "The half-hour refresh only ever pulled the active enemy faction, so everyone else was ignored.",
      },
    ],
  },
  {
    version: "1.28.0",
    date: "2026-05-15",
    title: "Companion v0.9 — bounties threat coloring + loot NPC overlay",
    changes: [
      {
        type: "feat",
        summary: "Every bounty row on torn.com gets a TM Hub threat badge and tinted background",
        detail: "Green for trivial, amber for moderate, red for dangerous, deep red for lethal — scored against your own stats so you stop spending 50 energy on a 'cheap' bounty that turns out to be a 50M whale.",
      },
      {
        type: "feat",
        summary: "Loot NPC profiles inject a card with current level, countdowns, and the faction reservation list",
        detail: "Duke, Leslie, Jimmy, Bruno and the Easter Bunny show a 5-level grid, hospital release timer, and inline buttons to reserve or cancel a level without leaving the NPC's page.",
      },
      {
        type: "improve",
        summary: "Bounty and loot data is cached for 60 seconds so paging around does not hammer the backend",
        detail: "Detection covers both /bounties.php and the SPA-style loader URL, and the same cache window applies to loot overlays.",
      },
    ],
  },
  {
    version: "1.27.0",
    date: "2026-05-15",
    title: "Companion v0.7 — inline write-back: flag off-limits / save target / watch from torn.com",
    changes: [
      {
        type: "feat",
        summary: "Profile intel card has action buttons for off-limits, targets and stakeout",
        detail: "Flag a med-out, save or edit a target, start or stop watching — each opens a small modal, saves to the backend, and refreshes the card without bouncing to hub.tri.ovh.",
      },
      {
        type: "feat",
        summary: "Off-limits and target writes update the on-page badge within about a second",
        detail: "Flagging a player from torn.com busts the companion cache immediately so the red OFF-LIMITS badge appears without waiting for the next poll cycle.",
      },
      {
        type: "feat",
        summary: "Edit target modal includes a destructive remove button for managing your hit list",
        detail: "Stakeout removal uses a native confirm dialog because the watch list is shared faction-wide and a misclick would affect everyone.",
      },
      {
        type: "improve",
        summary: "New shared modal helper powers every inline form action on torn.com",
        detail: "Escape, backdrop click and Cancel all close the modal, the first field gets autofocus, and it supports text, textarea, and select fields ready for future companion features.",
      },
    ],
  },
  {
    version: "1.26.2",
    date: "2026-05-15",
    title: "Dashboard stops exploding on partial Torn API responses",
    changes: [
      {
        type: "fix",
        summary: "Dashboard no longer crashes when Torn returns an incomplete payload",
        before: "An organized crime missing its participants list, or a null bounties or chat block from an upstream timeout, threw a JavaScript error that killed the whole dashboard load.",
        after: "Every list field is guarded, so a single bad row from Torn is skipped and the rest of the dashboard renders normally.",
      },
    ],
  },
  {
    version: "1.26.1",
    date: "2026-05-15",
    title: "Companion v0.6.1 — status chip moved left, chat unread sync fix",
    changes: [
      {
        type: "fix",
        summary: "Status chip moved to the bottom-left so Torn's chat widgets stop hiding it",
        before: "On many pages Torn's own footer chat sat on top of the chip in the bottom-right, leaving you unable to see whether the companion was connected.",
        after: "The chip now lives in the bottom-left corner and stays visible on every torn.com page.",
      },
      {
        type: "fix",
        summary: "Chat dock unread badge clears the moment you read a channel",
        before: "Even after opening a channel and reading every message, the unread badge kept showing the old count until the next backend poll.",
        after: "The badge zeroes locally as soon as you reach the bottom or open the channel, and the channel dropdown refreshes its counts at the same time.",
        cause: "The in-memory unread count was not being updated when mark-as-read fired.",
      },
      {
        type: "fix",
        summary: "Scrolling back to the bottom of a channel now marks it as read right away",
        before: "If you scrolled up to read history and then scrolled back down, the channel stayed unread until five seconds of new poll traffic arrived.",
        after: "Reaching the bottom marks the channel as read immediately, regardless of whether new messages are coming in.",
      },
    ],
  },
  {
    version: "1.26.0",
    date: "2026-05-15",
    title: "Companion v0.6 — spy + targets + stakeout intel on profile pages",
    changes: [
      {
        type: "feat",
        summary: "Single TM Hub intel card on every enemy profile and attack page",
        detail: "Stacks spy estimate (stats grid plus total, age and source), your personal target tag and notes, and the faction stakeout watchers — empty sections hide so the card only shows when there is real intel.",
      },
      {
        type: "feat",
        summary: "Difficulty pills are color-coded and spy stats are short-formatted for fast reading",
        detail: "Green easy, amber medium, red hard so you pattern-match at a glance, stats render as 12.4M / 850k, and a deep link opens the full spy detail in TM Hub when you need more.",
      },
      {
        type: "improve",
        summary: "Intel cache reduces backend traffic when bouncing between attack and profile pages",
        detail: "Per-player intel is cached for 10 minutes, and target and stakeout lists are cached for 5 minutes faction-wide so flicking around stays snappy.",
      },
      {
        type: "improve",
        summary: "Removed the duplicate 'not connected' banner on profile and attack pages",
        detail: "The persistent status chip in the corner is now the single source of truth for connection state, freeing screen space on every attack.",
      },
    ],
  },
  {
    version: "1.25.0",
    date: "2026-05-15",
    title: "Companion v0.5 — chat dock inside torn.com",
    changes: [
      {
        type: "feat",
        summary: "Floating chat dock on every torn.com page lets you read and post without leaving Torn",
        detail: "Green button above the status chip expands to a 360×480 panel with channel selector, message stream and composer, polling every 5 seconds while open.",
      },
      {
        type: "feat",
        summary: "Mentions of you are highlighted amber in the dock and a pill warns when new messages arrive offscreen",
        detail: "Auto-scroll kicks in when you are at the bottom, a 'New messages' pill appears if you have scrolled up, and Cmd/Ctrl+Enter sends.",
      },
      {
        type: "feat",
        summary: "Channels are marked as read automatically when you reach the bottom of the stream",
        detail: "No more wondering why the team page still shows unread after you have actually read everything in the dock.",
      },
      {
        type: "feat",
        summary: "Chat now supports fetching only new messages forward in time",
        detail: "The companion polls for messages since the last one you saw instead of re-downloading the whole window, which keeps the dock responsive on busy channels.",
      },
      {
        type: "improve",
        summary: "Admin-only channels are hidden from the dock for non-admins",
        detail: "The channel dropdown only lists channels you can actually post in, so it stays clean for regular members.",
      },
    ],
  },
  {
    version: "1.24.0",
    date: "2026-05-15",
    title: "Companion v0.4 — status chip + roadmap on /install",
    changes: [
      {
        type: "feat",
        summary: "Persistent status chip in the bottom-right corner of every torn.com page",
        detail: "Tells you at a glance whether the companion is loaded, which version is running, and which player is connected — and prompts you to connect when it is not.",
      },
      {
        type: "feat",
        summary: "Install page now shows what works today and what is coming next",
        detail: "Side-by-side cards list live features and the roadmap (chat dock, spy badges, targets, bounty coloring, loot timers, stocks ROI) so faction members know where the project is heading.",
      },
      {
        type: "improve",
        summary: "Settings popover redesigned with clear sections instead of confusing toggle rows",
        detail: "Separate areas for channel enable/disable, quick mute timers with remaining-time badge, and disconnect — opened from the gear inside the status chip.",
      },
    ],
  },
  {
    version: "1.23.0",
    date: "2026-05-15",
    title: "Companion v0.3 — @mention alerts inside torn.com",
    changes: [
      {
        type: "feat",
        summary: "Companion pops a toast on torn.com whenever someone @mentions you in TM Hub chat",
        detail: "Toast shows who mentioned you, which channel, and a preview of the message within about 15 seconds — click to jump to that channel, ignore to dismiss.",
      },
      {
        type: "feat",
        summary: "Native OS notification fires when torn.com is in a background tab",
        detail: "If you have granted browser notification permission, mentions reach you even when the Torn tab is hidden behind other windows.",
      },
      {
        type: "improve",
        summary: "Polling is paced and pauses when the Torn tab is hidden",
        detail: "Mentions poll every 15 seconds, notifications every 45, heartbeat every 60, all paused when the tab is hidden, with exponential backoff if the backend errors.",
      },
      {
        type: "improve",
        summary: "Quick one-hour mute for @mentions without disconnecting the whole companion",
        detail: "The gear icon in the bottom-right of torn.com now offers a one-click 'mute mentions for an hour' shortcut.",
      },
    ],
  },
  {
    version: "1.22.0",
    date: "2026-05-15",
    title: "TM Hub Companion v0.2 — notifications and presence inside torn.com",
    changes: [
      {
        type: "feat",
        summary: "TM Hub inbox notifications now appear as toasts on torn.com",
        detail: "A small card slides in from the bottom-right whenever a new notification lands — click to open the inbox, dismiss to ignore, and a native OS alert fires if the tab is backgrounded.",
      },
      {
        type: "feat",
        summary: "Presence heartbeat keeps you visible as online on the team page while Torn is open",
        detail: "The companion pings every 60 seconds so faction members can see you without you needing hub.tri.ovh open too, and it pauses automatically when the tab is hidden.",
      },
      {
        type: "feat",
        summary: "Settings gear in the corner with quick toggles and one-click disconnect",
        detail: "Toggles for inbox notifications, mentions and presence, plus 'mute for 1h' shortcuts and a button that clears the companion token instantly.",
      },
      {
        type: "feat",
        summary: "Companion is now linked from the Resources menu in the main nav",
        detail: "Faction members have a direct path to install instructions via Resources → TM Hub Companion.",
      },
      {
        type: "improve",
        summary: "Install page no longer promises a Chrome extension that is not on the roadmap",
        detail: "The page now shows two clean paths — Tampermonkey for desktop and Torn PDA for mobile — both running the same hosted userscript.",
      },
      {
        type: "improve",
        summary: "Companion polling pauses on hidden tabs and backs off on backend errors",
        detail: "A Coolify outage no longer gets hammered by every open torn.com tab, and idle background tabs stop wasting requests.",
      },
    ],
  },
  {
    version: "1.21.1",
    date: "2026-05-15",
    title: "Companion auth handoff actually works now",
    changes: [
      {
        type: "fix",
        summary: "Companion now picks up the auth token automatically without copy-paste",
        before: "Clicking 'Connect to TM Hub' opened the auth page in a new tab but the token never made it back, leaving you to copy and paste it manually.",
        after: "The auth popup hands the token straight to the userscript and the companion caches it without you doing anything else.",
        cause: "The connect link was opened in a way that severed the channel between the popup and the userscript.",
      },
    ],
  },
  {
    version: "1.21.0",
    date: "2026-05-15",
    title: "TM Hub Companion — userscript for inside torn.com",
    changes: [
      {
        type: "feat",
        summary: "New companion userscript injects faction intel directly into torn.com pages",
        detail: "Phase one shows OFF-LIMITS flags from the war page on enemy profiles and attack screens — a red banner appears the moment you open a flagged player, and the Attack button asks for confirmation so you never break an agreement by accident.",
      },
      {
        type: "feat",
        summary: "New install landing page with step-by-step instructions for desktop and mobile",
        detail: "Works day one in Tampermonkey, Violentmonkey and Torn PDA — no Web Store review wait, just pick your runtime and follow the guide.",
      },
      {
        type: "feat",
        summary: "New auth handoff page mints a 90-day token and hands it to the companion",
        detail: "Falls back to a copy-paste flow if the browser blocks the direct handoff, so you can still connect even if the popup cannot talk to its opener.",
      },
      {
        type: "improve",
        summary: "Backend now accepts requests from torn.com so the companion can talk to TM Hub",
        detail: "New token-issuing endpoint, a current-war lookup, and a CORS allow-list for www.torn.com — companion tokens can be revoked independently of your normal session.",
      },
    ],
  },
  {
    version: "1.20.0",
    date: "2026-05-15",
    title: "War-time off-limits tracker (med-out / dip agreements)",
    changes: [
      {
        type: "feat",
        summary: "Flag enemy players as off-limits during a war so the faction knows not to attack them",
        detail: "Covers med-out and dip agreements — hit the new button on the Enemies page during an active war, add an optional reason, and the flag is faction-wide and auto-clears when the war ends.",
      },
      {
        type: "feat",
        summary: "Off-limits players show a red badge and the Attack button asks for confirmation",
        detail: "Mobile and desktop both tint the row red, and clicking Attack opens a modal showing who flagged them and why so you can still attack on purpose but never by accident.",
      },
      {
        type: "feat",
        summary: "New Diplomatic filter on the Enemies page during a war",
        detail: "Switch between 'Off-limits only' to review every standing agreement and 'Hide off-limits' to focus on attackable targets, with the filter saved in the URL like the others.",
      },
      {
        type: "improve",
        summary: "Members can manage only their own flags, admins can manage any, with full audit",
        detail: "The flag header shows who set it, ownership checks are enforced server-side, and any teammate can see at a glance who is responsible for each agreement.",
      },
    ],
  },
  {
    version: "1.19.1",
    date: "2026-05-15",
    title: "Browser Sentry stops crying when the network blinks",
    changes: [
      {
        type: "fix",
        summary: "Closed-tab and dropped-connection errors no longer flood the bug inbox",
        before: "Every time a user's network blinked or they closed a tab mid-request, we logged it as a real bug and the inbox filled with noise.",
        after: "Routine network drops and closed-tab fetches are now filtered out, while genuine in-app fetch bugs still come through.",
        cause: "Background polls treated every aborted network request as an application error.",
      },
    ],
  },
  {
    version: "1.19.0",
    date: "2026-05-15",
    title: "Icon refresh, mobile card layouts, and real error states",
    changes: [
      {
        type: "fix",
        summary: "App icon now renders cleanly on home screens and notifications",
        before: "The home-screen icon got clipped on iOS, the push badge was wrong, and the login screen showed a different icon than the installed app.",
        after: "A redrawn icon with proper safe-area inset is used everywhere — home screens, push notifications, install prompt, and offline page all match.",
      },
      {
        type: "feat",
        summary: "Crisp SVG icons replace emoji across navigation and key pages",
        detail: "Nav, sidebar, browse sheet, search bar, inbox badge, theme toggle, and admin link now share one icon component that scales cleanly and follows your theme.",
      },
      {
        type: "improve",
        summary: "Pages now show a real error banner with Retry when an API call fails",
        detail: "Activity, analytics, awards, bounties, chain, dashboard, market, notifications, revives, stocks, targets, and travel no longer silently render empty — you'll always know whether 'no data' means 'no data' or 'something broke'.",
      },
      {
        type: "improve",
        summary: "Mobile-first card layouts on activity, awards, bounties, and stocks",
        detail: "No more horizontal-scroll tables on phone: each row becomes a tappable card with the important columns surfaced. Desktop keeps the dense table view.",
      },
    ],
  },
  {
    version: "1.18.0",
    date: "2026-05-08",
    title: "Combine filters on the Enemies page",
    changes: [
      {
        type: "feat",
        summary: "Enemy filters are now multi-select chips split into Status and Activity",
        detail: "Pick any combination — 'Okay + Offline' surfaces sleeping attackable targets, 'Okay + Online + Idle' is the old Attackable preset. Active filters sync to the URL so you can bookmark or share a view.",
      },
      {
        type: "improve",
        summary: "Sleeping attackable targets are now reachable from filters",
        detail: "The old single Attackable filter quietly excluded offline players, so easy sleeping targets were invisible. Splitting Status from Activity removes that hidden assumption.",
      },
    ],
  },
  {
    version: "1.17.0",
    date: "2026-05-08",
    title: "Stay logged in — no more daily API key paste",
    changes: [
      {
        type: "feat",
        summary: "New 'Stay logged in' checkbox extends your session to 90 days",
        detail: "On by default — the token auto-refreshes whenever you use the app, so active players stop seeing the login wall. Untick it on a shared computer to keep the previous 24-hour behaviour.",
      },
    ],
  },
  {
    version: "1.16.6",
    date: "2026-05-01",
    title: "Sentry 504 silencer — finishing the job",
    changes: [
      {
        type: "fix",
        summary: "Upstream Torn 5xx and timeouts truly stop becoming bug reports",
        before: "Despite last week's cleanup, Sentry was still filling up with Torn 504s and timeouts that aren't actually our bugs.",
        after: "Those upstream errors are now filtered at the SDK level, so they stay in logs but no longer create issues regardless of which background job hits them.",
        cause: "Sentry was grabbing parallel background-task errors before our filter could see them.",
      },
    ],
  },
  {
    version: "1.16.5",
    date: "2026-04-30",
    title: "Sentry stops drowning in upstream Torn 504s",
    changes: [
      {
        type: "improve",
        summary: "Torn API timeouts no longer flood the bug inbox as errors",
        detail: "Background jobs already retry on the next cycle, so upstream 5xx and timeouts are now warnings in the logs instead of bug reports — real bugs stop getting buried.",
      },
      {
        type: "fix",
        summary: "Background jobs stop double-reporting and leaking upstream noise",
        before: "Stat collection logged the same Torn failure twice, and several other background jobs leaked normal upstream hiccups into the bug inbox.",
        after: "All background jobs now route upstream failures through one shared helper, so each issue is reported at most once and only when it's actually a bug.",
      },
    ],
  },
  {
    version: "1.16.4",
    date: "2026-04-29",
    title: "End-to-end observability for background work",
    changes: [
      {
        type: "improve",
        summary: "All 11 background jobs now report their failures",
        detail: "Previously only stat collection did, so silent failures in armoury polling, company snapshots, revive checks, etc. were invisible until a user noticed missing data.",
      },
      {
        type: "improve",
        summary: "Per-company background failures are no longer swallowed",
        detail: "Company snapshot and discovery jobs ran tasks in parallel and ate individual stack traces — each failure now surfaces with the company id attached.",
      },
      {
        type: "feat",
        summary: "New admin endpoint exposes scheduler health at a glance",
        detail: "Returns leadership state plus per-job last-finished time and outcome, so admins can answer 'is anything still running?' without digging through container logs.",
      },
      {
        type: "improve",
        summary: "Unexpected page-load failures now report themselves automatically",
        detail: "The frontend reports 5xx and unexpected 4xx responses to the bug tracker centrally — expected 401/403/404 stay quiet so the inbox isn't noisy.",
      },
    ],
  },
  {
    version: "1.16.3",
    date: "2026-04-29",
    title: "Stat Growth keeps collecting after a deploy",
    changes: [
      {
        type: "fix",
        summary: "Stat snapshots keep being collected after every deploy",
        before: "After a deploy, the 15-minute stat collector sometimes stopped firing for hours and Stat Growth went stale until someone noticed.",
        after: "If both new workers boot together they now retry until one takes over, and the collector resumes within the lease window.",
        cause: "Both workers could simultaneously hit a stale lock from the previous deploy and both back off forever.",
      },
      {
        type: "improve",
        summary: "Stat collector now logs a per-cycle breakdown of what succeeded and what failed",
        detail: "Success / no-data / errors / total are logged every cycle and per-player Torn errors are tracked, so 'why is Stat Growth stale?' is answerable from the dashboard instead of by grepping logs.",
      },
      {
        type: "improve",
        summary: "Stats endpoints log richer diagnostic info on every request",
        detail: "Player id, snapshot count, baseline/latest dates, and fallback flags are logged on every call; the leaderboard warns when it's empty as an early canary that the collector stopped.",
      },
      {
        type: "improve",
        summary: "Stat Growth page now shows when the latest snapshot was taken",
        detail: "A small 'Latest snapshot: …' banner makes it obvious whether you're looking at fresh data or a stale gap of more than 36 hours.",
      },
    ],
  },
  {
    version: "1.16.1",
    date: "2026-04-27",
    title: "Multi-worker startup is race-safe",
    changes: [
      {
        type: "fix",
        summary: "Fresh deploys no longer crash when both workers boot at the same time",
        before: "On a fresh database migration, two backend workers could race each other and crash startup with a uniqueness error.",
        after: "Workers now take turns applying migrations, so only one runs them and the other waits.",
        cause: "Both workers tried to apply the same migration simultaneously with no coordination.",
      },
    ],
  },
  {
    version: "1.16.0",
    date: "2026-04-27",
    title: "Sprint 2 #13 — Glitchtip wired (no-op until DSN set)",
    changes: [
      {
        type: "improve",
        summary: "Backend and browser are now ready to report errors and slow requests to a self-hosted tracker",
        detail: "Turn it on by setting the tracker URL and rebuilding — until then it stays completely silent and ships nothing.",
      },
      {
        type: "improve",
        summary: "PII filter scrubs API keys, auth tokens, and cookies before any error is sent",
        detail: "Backend coverage is locked in by 15 dedicated tests and the browser uses an identical scrubber, so secrets never leave your session.",
      },
    ],
  },
  {
    version: "1.15.4",
    date: "2026-04-27",
    title: "Stats: superadmins can view other members + 1.15.3 follow-up",
    changes: [
      {
        type: "fix",
        summary: "Superadmins can now open any member's stat snapshots and growth",
        before: "Superadmins got a permission error and an empty Stats page when viewing other members unless they also had the regular admin flag set.",
        after: "Superadmins listed in the configured allowlist can now open any member's stats directly.",
        cause: "The permission check only honored the database admin flag and ignored the superadmin allowlist.",
      },
    ],
  },
  {
    version: "1.15.3",
    date: "2026-04-27",
    title: "Stats empty-state copy + service worker cache bump",
    changes: [
      {
        type: "fix",
        summary: "Stats empty state stops blaming you for someone else's missing key",
        before: "When you opened another player's Stats page and they had no data, the page told you to register your own API key.",
        after: "The empty state now correctly says that the other player needs to register, naming them in the message.",
      },
      {
        type: "fix",
        summary: "Stats page stops claiming data refreshes once per day",
        before: "An old cached header on Stats said 'Data collected daily at 4:00 UTC', even though it actually refreshes every 15 minutes.",
        after: "Bumping the cache version forces every browser to load the corrected copy on next visit.",
        cause: "An old offline-cache version was pinning a stale header on returning visitors.",
      },
    ],
  },
  {
    version: "1.15.2",
    date: "2026-04-27",
    title: "Sprint 2 #8 + warmup polish",
    changes: [
      {
        type: "improve",
        summary: "All charts share one consolidated chart bundle",
        detail: "Stocks, awards, training, stats, and company trends now register charting plugins once instead of repeatedly, shrinking duplicate code and unifying the chart chunk.",
      },
      {
        type: "improve",
        summary: "First analytics ping is faster on slow connections",
        detail: "The browser now warms up the connection to the analytics server before the analytics script fires, so the initial handshake doesn't block the first page load.",
      },
    ],
  },
  {
    version: "1.15.1",
    date: "2026-04-27",
    title: "Sprint 2 #4 — Brotli compression",
    changes: [
      {
        type: "improve",
        summary: "JavaScript and CSS now ship with Brotli compression",
        detail: "Modern browsers download about 23% less data than before, which means a noticeably faster first paint on slow connections.",
      },
      {
        type: "improve",
        summary: "Bundle analyzer is wired up so future bloat is easy to spot",
        detail: "Running the build with ANALYZE=true now produces a visual breakdown of bundle contents, making regressions easy to catch.",
      },
    ],
  },
  {
    version: "1.15.0",
    date: "2026-04-27",
    title: "Sprint 2 #1+#19 — Redis + multi-worker backend",
    changes: [
      {
        type: "improve",
        summary: "Backend now runs two worker processes for roughly double the API throughput",
        detail: "Dashboard and pages that fan out parallel data fetches feel noticeably snappier under load.",
      },
      {
        type: "improve",
        summary: "Chat messages now reach everyone regardless of which backend worker they hit",
        detail: "Messages, edits, deletes, threads, and pins now broadcast cluster-wide via Redis, so two people on different workers stay in sync.",
      },
      {
        type: "improve",
        summary: "Online presence dots are now accurate across the whole cluster",
        detail: "Presence is shared across workers with a 60-second TTL, so the green dot list finally reflects who is actually here.",
      },
      {
        type: "improve",
        summary: "Background jobs no longer run twice — only one worker is the scheduler leader",
        detail: "Scrapers, the 30-second data refresh, 5-minute armoury polls, and friends now run on exactly one worker at a time.",
      },
      {
        type: "improve",
        summary: "Rate limits are now shared cluster-wide so they cannot be bypassed",
        detail: "A single user cannot dodge a limit by spreading requests across workers anymore.",
      },
      {
        type: "improve",
        summary: "App keeps running gracefully when Redis is unreachable",
        detail: "If Redis goes down, the app falls back to per-worker state and chat narrows to single-worker behaviour rather than failing outright.",
      },
    ],
  },
  {
    version: "1.14.0",
    date: "2026-04-27",
    title: "Performance audit Sprint 1 — observability + quick wins",
    changes: [
      {
        type: "improve",
        summary: "Director faction view loads 5-10x faster on pages with many keys",
        detail: "Training-data fetches now run in parallel instead of waiting for each one in turn.",
      },
      {
        type: "improve",
        summary: "Real-user performance metrics are now collected so we stop guessing",
        detail: "LCP, INP, CLS, TTFB, and FCP are shipped to analytics so we can see actual page speed across real devices instead of synthetic tests.",
      },
      {
        type: "improve",
        summary: "Each API request is now logged as a single line for fast latency analysis",
        detail: "p50, p95, and p99 latency are now one shell command away when investigating slow pages.",
      },
      {
        type: "improve",
        summary: "New health endpoint reports database connectivity for uptime probes",
      },
      {
        type: "improve",
        summary: "Per-player cached responses are now actually cached at the edge",
        detail: "The reverse proxy was silently skipping responses marked private — hit ratio jumps from near zero to expected baseline, taking real load off the app.",
      },
      {
        type: "improve",
        summary: "Edge cache hit ratio is now observable from access logs",
      },
      {
        type: "improve",
        summary: "Smaller Docker build context speeds up deploys",
        detail: "Build no longer ships history, dependencies, plans, and tests into the image.",
      },
    ],
  },
  {
    version: "1.13.5",
    date: "2026-04-27",
    title: "Daily encrypted backups for keys.db",
    changes: [
      {
        type: "improve",
        summary: "Encrypted daily backups of the API key database with 30-day retention",
        detail: "Losing the server volume no longer means every member has to re-register their Torn API key from scratch.",
      },
      {
        type: "improve",
        summary: "Restore tooling and quarterly drill log keep the backups proven, not theoretical",
      },
    ],
  },
  {
    version: "1.13.4",
    date: "2026-04-27",
    title: "Session revocation + admin re-auth",
    changes: [
      {
        type: "improve",
        summary: "Signing out actually revokes the session so a leaked token cannot be reused",
        detail: "Even if someone captured your token earlier, hitting logout now invalidates it server-side immediately.",
      },
      {
        type: "improve",
        summary: "Admin escalation re-checks your Torn API key before granting admin access",
        detail: "A stolen session token alone is no longer enough to reach admin tools — you must still control the underlying Torn key.",
      },
      {
        type: "improve",
        summary: "Hardened CI pipeline reduces supply-chain risk on deploys",
        detail: "Build actions are pinned by exact version, deploy permissions are scoped to the minimum, and a watcher flags upstream updates.",
      },
      {
        type: "improve",
        summary: "Analytics script pinned with an integrity hash to block CDN tampering",
        detail: "If the analytics CDN is ever compromised and the script is swapped, the browser refuses to run it.",
      },
      {
        type: "improve",
        summary: "Database layer refuses unknown column names instead of skipping them silently",
        detail: "Defensive guard in the armoury and chat data layer catches typos and tampered input early.",
      },
    ],
  },
  {
    version: "1.13.3",
    date: "2026-04-27",
    title: "Auth hardening (HttpOnly cookies)",
    changes: [
      {
        type: "improve",
        summary: "Login tokens are no longer reachable from page JavaScript",
        detail: "Session tokens now ride in HttpOnly cookies instead of being readable from scripts, so a hypothetical XSS bug cannot steal your session.",
      },
      {
        type: "improve",
        summary: "Stricter content security policy blocks inline script execution",
        detail: "Even if a script tag gets injected into a page, the browser will refuse to run it.",
      },
      {
        type: "improve",
        summary: "Configurable break-glass superadmin allows recovery without a code deploy",
      },
    ],
  },
  {
    version: "1.13.2",
    date: "2026-04-27",
    title: "Security hardening",
    changes: [
      {
        type: "fix",
        summary: "Stat snapshot endpoints now refuse to return other players' data",
        before: "It was possible to ask the server for someone else's stat snapshots, growth history, or enemy baseline.",
        after: "Members can only fetch their own data; admins keep full read access for moderation.",
        cause: "Ownership checks were missing on a few read endpoints.",
      },
      {
        type: "fix",
        summary: "Director news feed is now safe even if Torn ever returns odd HTML",
        before: "Faction news from Torn was rendered as-is, so unusual HTML in a news item could in theory run in your browser.",
        after: "All news HTML is sanitised before rendering, stripping out anything that could execute.",
      },
      {
        type: "fix",
        summary: "External links opening in a new tab can no longer hijack the original tab",
        before: "A malicious site opened via a new-tab link could quietly reach back and navigate the page that opened it.",
        after: "Every external new-tab link now severs that reverse link.",
      },
    ],
  },
  {
    version: "1.13.1",
    date: "2026-04-24",
    title: "Company Stock Runway",
    changes: [
      {
        type: "improve",
        summary: "Director stock tab now estimates whether each product survives through Sunday",
        detail: "Combines current in-stock plus on-order units against this week's sell rate, so you know which products are about to run out before customers walk away.",
      },
      {
        type: "improve",
        summary: "Runway uses a proper Monday-aligned week and flags partial-week history",
        detail: "Anchored to Monday 00:00 TCT instead of a rolling 7-day window, and rows without a real Monday baseline are clearly marked so you know which numbers are estimates.",
      },
    ],
  },
  {
    version: "1.13.0",
    date: "2026-04-19",
    title: "Weekly Comparison + Trains Alerts",
    changes: [
      {
        type: "feat",
        summary: "New weekly leaderboard for class-10 companies anchored to a real week",
        detail: "Comparison tab ranks class-10 companies on a Monday 18:00 TCT week boundary instead of Torn's rolling 7-day, with filters for your company type or all class-10 overall.",
      },
      {
        type: "feat",
        summary: "Your own company gets a real weekly sales number that actually resets",
        detail: "Calculated as the lifetime-sold difference between week boundaries, so you finally see 'what did I sell this week' instead of a rolling figure.",
      },
      {
        type: "feat",
        summary: "Pin any past week with a label to compare against in future reports",
        detail: "Save weeks like 'Halloween 2025' and overlay them on later comparisons to see how this year stacks up against last.",
      },
      {
        type: "feat",
        summary: "Rival class-10 companies are discovered and snapshotted daily in the background",
        detail: "We build historical data Torn itself does not store, so you can study competitors over months instead of guessing from the latest profile.",
      },
      {
        type: "feat",
        summary: "Stagnant trains alert pings any employee whose company training credits sit unused",
        detail: "Toggle alerts per employee in the Employees tab; if their credits go three days without being spent, they get an in-app notification (and push if enabled).",
      },
      {
        type: "feat",
        summary: "Manually add any rival company to the daily watchlist",
        detail: "Directors can drop in a company ID and start collecting daily snapshots even if it would not have been discovered automatically.",
      },
    ],
  },
  {
    version: "1.12.2",
    date: "2026-04-19",
    title: "Nav highlight fix",
    changes: [
      {
        type: "fix",
        summary: "Sidebar no longer lights up two items at once on the director page",
        before: "Both 'Companies' and 'Director' were highlighted simultaneously when viewing the director page, making it unclear where you actually were.",
        after: "Only the most specific matching item lights up, so the active nav entry always matches the current page.",
        cause: "The sidebar was using a loose prefix-match for active state.",
      },
    ],
  },
  {
    version: "1.12.1",
    date: "2026-04-19",
    title: "Director page polish",
    changes: [
      {
        type: "fix",
        summary: "Sidebar, bottom nav, and browse sheet no longer double-highlight on director",
        before: "'Companies' and 'Director' were both highlighted at the same time when viewing the director page across every navigation surface.",
        after: "Only the exact matching nav item lights up; descendant pages light up their real parent.",
      },
      {
        type: "improve",
        summary: "Non-directors now see useful teasers explaining each director-only tab",
        detail: "Instead of a blank 'not a director' wall, each tab shows what directors actually get and an unlock checklist (buy a company, link the director's key).",
      },
      {
        type: "improve",
        summary: "Director-only tabs show a lock icon but stay clickable to browse teasers",
      },
    ],
  },
  {
    version: "1.12.0",
    date: "2026-04-19",
    title: "Hiring Ranker",
    changes: [
      {
        type: "feat",
        summary: "Applications tab ranks job applicants by predicted efficiency",
        detail: "Uses TornStats data to score every applicant, badges the top three, and tells you which company position each one would perform best in.",
      },
      {
        type: "feat",
        summary: "Applicant scoring respects the TornStats rate limit even with many applicants",
        detail: "Calls fan out under a small concurrency limit so the 100-per-minute budget is never exceeded.",
      },
      {
        type: "feat",
        summary: "Explicit 'Rank applicants' button — no surprise external calls",
        detail: "Nothing gets fetched from TornStats until you ask, so you stay in control of your API budget.",
      },
    ],
  },
  {
    version: "1.11.0",
    date: "2026-04-19",
    title: "Company Trends",
    changes: [
      {
        type: "feat",
        summary: "New Trends tab plots line charts for every key director metric over time",
        detail: "Daily snapshots power charts for funds, bank, ad budget, daily and weekly income, popularity, efficiency, environment, and aggregated stock.",
      },
      {
        type: "feat",
        summary: "Background job silently collects director snapshots every day",
        detail: "Builds a time-series of your company that neither YATA nor TornStats keep, so you can spot trends Torn itself does not surface.",
      },
      {
        type: "feat",
        summary: "Pick the time window on the Trends tab: 7 days, 30 days, 90 days, or 1 year",
      },
    ],
  },
  {
    version: "1.10.0",
    date: "2026-04-19",
    title: "Company Director Cockpit",
    changes: [
      {
        type: "feat",
        summary: "New Director Cockpit page covers everything you need to run a company",
        detail: "Financials, employee effectiveness, applications, stock and margins, plus company news, all on one page.",
      },
      {
        type: "feat",
        summary: "TM Companies benchmark tab is open to everyone, not just directors",
        detail: "Browse public profiles — rating, daily and weekly income, staffing — for every company TM members run.",
      },
      {
        type: "feat",
        summary: "Non-directors see a friendly explainer instead of a hard block",
        detail: "The benchmark tab stays accessible and the director-only tabs explain what the feature is about.",
      },
    ],
  },
  {
    version: "1.9.1",
    date: "2026-04-12",
    title: "Login Stability Fix",
    changes: [
      {
        type: "fix",
        summary: "Login no longer appears to refresh without actually logging you in",
        before: "Sometimes you'd hit the login button, the page would flicker, and you would still be sitting on the login screen with no error.",
        after: "Login completes cleanly every time and only then does the app check the session.",
        cause: "A session validation check could fire before the login request finished.",
      },
    ],
  },
  {
    version: "1.9.0",
    date: "2026-04-11",
    title: "Game Knowledge & Member Guide",
    changes: [
      {
        type: "feat",
        summary: "New Member Guide page with onboarding for new players",
        detail: "Covers training priorities, money safety, medical items, education choices, and casino strategy in one place.",
      },
      {
        type: "feat",
        summary: "Educational tooltips added across seven pages",
        detail: "Stats, loot, chain, bounties, travel, revives, and company pages now explain the game mechanic and what action to take.",
      },
      {
        type: "feat",
        summary: "Rotating Quick Tips widget on the dashboard",
        detail: "A fresh game tip every visit, with a shuffle button when you want another.",
      },
      {
        type: "feat",
        summary: "Seasonal event banners around Torn holidays",
        detail: "Date-aware tips appear during Easter, Elimination, Halloween, Christmas, and Museum Day so you don't miss limited-time activities.",
      },
    ],
  },
  {
    version: "1.8.1",
    date: "2026-04-11",
    title: "Login & Stability Fixes",
    changes: [
      {
        type: "fix",
        summary: "Brief server restarts no longer log you out",
        before: "If the server hiccuped for a second mid-login, the app treated it as a hard failure and kicked you back to the login screen.",
        after: "Transient errors are now ignored and the session is kept; you stay logged in across short server blips.",
      },
      {
        type: "fix",
        summary: "Home page loads instead of showing a 500 error",
        before: "Opening the bare site URL hit a server error page instead of the dashboard.",
        after: "The root URL now loads the app cleanly like every other page.",
      },
    ],
  },
  {
    version: "1.8.0",
    date: "2026-04-11",
    title: "Armoury Restock Competitions",
    changes: [
      {
        type: "feat",
        summary: "Armoury restock competitions for the faction",
        detail: "Track who deposits the most blood bags, temporary items, or alcohol to the faction armoury over a chosen window.",
      },
      {
        type: "feat",
        summary: "Live leaderboard with top-three podium",
        detail: "The board auto-refreshes every minute so contestants can see their rank update in near real time.",
      },
      {
        type: "feat",
        summary: "Admin controls to launch a competition",
        detail: "Pick the item category and the start/end date, and the competition runs itself.",
      },
    ],
  },
  {
    version: "1.7.0",
    date: "2026-04-07",
    title: "Profiles, Avatars & Presence",
    changes: [
      {
        type: "feat",
        summary: "Player avatars shown throughout the app",
        detail: "Torn profile images are cached on our own storage so they load fast and stay available even if Torn is slow.",
      },
      {
        type: "feat",
        summary: "Unified Settings page for your profile",
        detail: "One place for your Torn stats, push notification preferences, and the light/dark theme toggle.",
      },
      {
        type: "feat",
        summary: "Hub presence counts everyone active, not just chatters",
        detail: "The online indicator now reflects all members currently using TM Hub, not only people with chat open.",
      },
      {
        type: "improve",
        summary: "Notifications page simplified to an inbox",
        detail: "Push notification settings moved into the new Settings page so the inbox is clean.",
      },
    ],
  },
  {
    version: "1.6.0",
    date: "2026-04-06",
    title: "Revive Monitor Bot",
    changes: [
      {
        type: "feat",
        summary: "Chat bot that flags members with revives enabled",
        detail: "Crucial during wars — you immediately know who can be brought back into the fight.",
      },
      {
        type: "feat",
        summary: "Automatic posting to the revives channel",
        detail: "Every 10 minutes during wars and every 60 minutes in peace time, so the channel stays useful without spam.",
      },
      {
        type: "feat",
        summary: "New Bots tab in the admin panel with manual trigger",
        detail: "Admins can fire off a fresh revives report on demand instead of waiting for the next scheduled run.",
      },
    ],
  },
  {
    version: "1.5.0",
    date: "2026-04-06",
    title: "Chat Improvements",
    changes: [
      { type: "feat", summary: "Traveling members listed in the travel channel header" },
      { type: "feat", summary: "Unread chat banner on the dashboard so nothing slips by" },
      { type: "feat", summary: "Chat channels searchable from the Cmd+K command palette" },
      { type: "feat", summary: "Push notification people picker — search recipients by name" },
      { type: "feat", summary: "Leadership channel visible only to admins" },
      { type: "improve", summary: "Your own messages appear instantly when you send them" },
    ],
  },
  {
    version: "1.4.1",
    date: "2026-04-06",
    title: "Chat Mobile Fix",
    changes: [
      {
        type: "fix",
        summary: "Chat stays visible when the mobile keyboard opens",
        before: "Tapping the message input would push the conversation off-screen, leaving a blank chat area.",
        after: "The chat now resizes to the visible viewport so messages and input stay on screen while you type.",
      },
      {
        type: "fix",
        summary: "Footer hidden on the chat page",
        before: "The site footer sat under the message input on mobile, crowding the bottom of the screen.",
        after: "The footer is now hidden on chat so the input sits cleanly above the bottom navigation bar.",
      },
      {
        type: "fix",
        summary: "iOS no longer zooms in when you tap the chat input",
        before: "Safari auto-zoomed every time you focused the message box, forcing you to pinch back out.",
        after: "Inputs now use a 16px font size, which iOS treats as zoom-safe and leaves the layout alone.",
        cause: "iOS Safari zooms into any input with a font smaller than 16 pixels.",
      },
      {
        type: "fix",
        summary: "iOS layout follows the keyboard instead of clipping content",
        before: "When the iOS keyboard appeared, parts of the chat would slide behind it and become unreachable.",
        after: "The layout now tracks the visual viewport, so everything stays within the area iOS leaves visible.",
      },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-04-06",
    title: "Push Notification System",
    changes: [
      {
        type: "feat",
        summary: "Admin push panel with templates, groups, and history",
        detail: "Compose a notification once, target a group, and see exactly who received it and when.",
      },
      {
        type: "feat",
        summary: "Native push notifications inside Torn PDA",
        detail: "PDA users get real OS notifications via the in-app JS bridge with automatic polling — no separate setup required.",
      },
      {
        type: "feat",
        summary: "Custom notification groups for targeted broadcasts",
        detail: "Build a group of specific players once and reuse it whenever you need to ping just that crew.",
      },
      {
        type: "fix",
        summary: "Chat @mentions now actually trigger push notifications",
        before: "Being mentioned in chat did not produce a push notification, so people missed callouts.",
        after: "Mentions now fan out through the same notification system as every other event and reliably reach you.",
      },
      {
        type: "improve",
        summary: "Removed the unused OC Ready event from push preferences",
        detail: "Cleared a setting that did nothing so the preferences page only lists notifications you can actually receive.",
      },
    ],
  },
  {
    version: "1.3.1",
    date: "2026-04-06",
    title: "Chat Beta Controls",
    changes: [
      {
        type: "feat",
        summary: "Chat is admin-only until explicitly opened to everyone",
        detail: "Lets leadership smoke-test the feature before exposing it to the whole faction.",
      },
      {
        type: "feat",
        summary: "Admin Settings tab with a chat-for-everyone toggle",
        detail: "One switch flips chat from admin-only beta to fully available for the faction.",
      },
      {
        type: "feat",
        summary: "Prominent chat entry in the sidebar and mobile nav with unread badges",
        detail: "Unread counts surface where you already look so messages don't sit unread for hours.",
      },
      {
        type: "feat",
        summary: "Floating chat button on every page with an unread count",
        detail: "Jump into chat from anywhere in TM Hub without losing your spot.",
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-04-06",
    title: "Faction Chat & Forum",
    changes: [
      {
        type: "feat",
        summary: "Built-in faction chat with real-time messaging",
        detail: "A live group chat for your faction inside TM Hub — no Discord required to coordinate.",
      },
      {
        type: "feat",
        summary: "Multiple channels for general, war room, trading, off-topic, and announcements",
        detail: "Conversations split by purpose so war coordination doesn't get buried under banter.",
      },
      {
        type: "feat",
        summary: "Forum-style threaded replies in announcement channels",
        detail: "Announcements keep their replies grouped underneath instead of flooding the main timeline.",
      },
      { type: "feat", summary: "Per-channel unread badges so you only check what's new" },
      {
        type: "feat",
        summary: "@mentions that send push notifications to the tagged player",
        detail: "Pinging a teammate by name reaches them even if they're not currently looking at chat.",
      },
      {
        type: "feat",
        summary: "Bot API so automated tools can post and mention players",
        detail: "Faction bots can drop messages and call out individuals through a simple REST API.",
      },
      {
        type: "feat",
        summary: "Admin tools to create channels, manage bots, mute players, and pin messages",
        detail: "Everything leadership needs to keep chat tidy without touching the database.",
      },
      {
        type: "feat",
        summary: "Typing indicators and a live online player count",
        detail: "See at a glance who's around and who's about to reply.",
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-04-06",
    title: "Progressive Web App",
    changes: [
      {
        type: "feat",
        summary: "TM Hub installs as a PWA on your home screen",
        detail: "Add it like a native app and launch it without the browser chrome.",
      },
      { type: "feat", summary: "Fresh neon-glow TM app icon" },
      {
        type: "feat",
        summary: "Offline fallback page when you lose connection",
        detail: "Instead of a browser error you get a clean TM Hub page that explains the network is down.",
      },
      {
        type: "feat",
        summary: "Smart install prompt with Android and iOS instructions",
        detail: "Detects your platform and shows the right steps to add TM Hub to your home screen.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-04-06",
    title: "Real gym energy tracking & Changelog",
    changes: [
      {
        type: "fix",
        summary: "Gym energy spent comes from real Torn data",
        before: "The training stats showed made-up energy estimates that didn't match what you actually trained.",
        after: "Energy spent is now pulled straight from Torn's gym history, so totals match the game.",
        cause: "The previous figure was an estimate calculated locally instead of read from Torn.",
      },
      {
        type: "feat",
        summary: "Changelog page with the full TM Hub update history",
        detail: "Browse every release and see what changed across versions.",
      },
      {
        type: "feat",
        summary: "New-version banner that shows once per player per release",
        detail: "You get a heads-up when something new ships, and the banner disappears once you've seen it.",
      },
      { type: "improve", summary: "Footer version number is now a clickable link to the changelog" },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-03-28",
    title: "TM Hub Launch",
    changes: [
      { type: "feat", summary: "Dashboard with faction overview and member stats" },
      { type: "feat", summary: "War room with enemy tracking and threat levels" },
      { type: "feat", summary: "Training guide with gym calculator and stat growth tracking" },
      { type: "feat", summary: "Chain tracker, market prices, and NPC loot timers" },
      { type: "feat", summary: "Spy central, bounty board, and target lists" },
      { type: "feat", summary: "Awards tracker with circulation history" },
      { type: "feat", summary: "Stocks portfolio, travel planner, and company specials" },
      { type: "feat", summary: "OC planner, revive tracker, and stakeout system" },
      { type: "feat", summary: "Push notifications and an announcement system" },
      { type: "feat", summary: "Admin panel with member management" },
    ],
  },
];
