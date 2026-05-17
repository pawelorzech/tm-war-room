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

export const CURRENT_VERSION = "1.62.2";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.62.2",
    date: "2026-05-17",
    title: "Spy faction list — bucket-coded dots + range totals",
    changes: [
      {
        type: "improve",
        summary: "Spy Central tables (Known Stats + Faction Lookup) now match the per-player view: bucket-colored dot (green/yellow/orange) and a total that shows a range when the data isn't a fresh verified spy",
        detail: "Same three trust levels (VERIFIED SPY / ESTIMATE / ROUGH GUESS) introduced in v1.62.0, now applied to the list views — you can scan a roster and immediately see which rows are hard data and which are guesses without opening each player individually.",
      },
    ],
  },
  {
    version: "1.62.1",
    date: "2026-05-17",
    title: "Chat — link previews appear instantly without refresh",
    changes: [
      {
        type: "fix",
        summary: "Chat link previews now appear immediately, without refresh",
        before: "Sending a Torn profile/item/faction URL in chat showed a plain link until the page was refreshed.",
        after: "The rich card with name, status and Attack button shows up the moment the message lands — for the sender, for everyone else live, and inside the companion dock.",
        cause: "The server only attached entity metadata to messages fetched on page load, not to messages broadcast over the live channel.",
      },
    ],
  },
  {
    version: "1.62.0",
    date: "2026-05-17",
    title: "Spy estimates — honest ranges, three trust levels",
    changes: [
      {
        type: "improve",
        summary: "Spy panels show a range instead of a single number when we're not 100% sure, plus a prominent badge so you can tell verified spy data from a rough guess at a glance",
        detail: "Three buckets: VERIFIED SPY (green — recent real spy network data), ESTIMATE (yellow — older spy or our own snapshot), and ROUGH GUESS (orange — only public stats like level and xanax count). Each shows an adaptively-wide range: fresh spies are exact, mid-age spies show ±10%, and the weakest guesses span an order of magnitude (e.g., \"500M — 50B\") so you can't mistake a wild guess for a hard number. When all we have is the heuristic estimate the per-stat STR/DEF/SPD/DEX grid is hidden — it was just total÷4 anyway and looked misleadingly precise.",
      },
    ],
  },
  {
    version: "1.61.0",
    date: "2026-05-17",
    title: "Spy intel — per-user TornStats keys for real-data parity with the native TornStats userscript",
    changes: [
      {
        type: "feat",
        summary: "Settings → TornStats Integration: paste your own TornStats key to unlock the spies you can already see on tornstats.com",
        detail: "Each member can now register their personal TornStats API key in Settings. The /api/spy/{id} pipeline tries your key first, then pools other members' keys, then falls back to the shared TM Hub key. Different keys see different faction-spy entries on TornStats — pooling them dramatically widens coverage so the companion's TM HUB INTEL panel on torn.com profiles shows the same exact battle stats the native TornStats userscript renders just below it. Keys are encrypted at rest, validated before saving, and auto-marked invalid the moment TornStats starts rejecting them.",
      },
      {
        type: "fix",
        summary: "Profile intel panel no longer shows '—' on enemies that TornStats has clear data on",
        before: "TM HUB INTEL on torn.com profiles showed '—' for STR/DEF/SPD/DEX even when the native TornStats card right below it displayed 3.95B/2.5B/3.4B/3.4B from the same source.",
        after: "The intel panel pulls from a pool of member-owned TornStats keys, so whichever key has the spy report wins. The numbers now match what TornStats shows you.",
        cause: "The single shared TornStats key the app used had been silently 403-ing for ~6 days; the scheduler kept overwriting real estimates with zero rows.",
      },
      {
        type: "improve",
        summary: "Cleaned up stale zero-stat spy estimates from the database",
        detail: "Removed legacy spy_reports / spy_estimates rows where every battle stat was 0 — they were leftovers from the broken global TornStats key and were polluting the freshest-report picker. Real reports rebuild on the next scheduler tick or on-demand profile view.",
      },
    ],
  },
  {
    version: "1.60.2",
    date: "2026-05-17",
    title: "Chat — OC digest is compact by default (Companion 0.35.3)",
    changes: [
      {
        type: "fix",
        summary: "OC 2.0 digest card no longer eats the whole companion chat when many faction members are traveling",
        before: "On a day where 15 members were flying for the Christmas Town event, the OC digest card on #general expanded into a 10-row tower listing every traveler with their full \"Traveling from Torn to Switzerland\" status — the actual chat messages were pushed off-screen.",
        after: "The card now defaults to collapsed (just the one-line summary: 1 ready · 11 waiting · 15 traveling) and remembers your expand preference. When expanded, each section caps at 5 chips with a \"+N more\" overflow indicator, and traveler chips show the compact \"→ Switzerland\" form instead of the full \"Traveling from Torn to Switzerland\" sentence.",
        cause: "First pass shipped expanded-by-default with no list cap and the raw verbose description from the Torn API, which scaled badly on faction-wide travel events.",
      },
    ],
  },
  {
    version: "1.60.1",
    date: "2026-05-17",
    title: "Chat — reaction picker is a clean horizontal row (Companion 0.35.1)",
    changes: [
      {
        type: "improve",
        summary: "The reaction picker is now a single horizontal row with the 7 most-used emojis and a '⋯' button for the rest",
        detail: "Replaced the cramped three-row tile that wrapped 13 emojis into a narrow box. The picker now shows 👍 ❤️ 😂 🎉 🔥 ✅ 👀 in one row — tap '⋯' to reveal the full set (❌ 💀 🚀 🟢 🟡 🔴). Hover bumps each emoji up slightly so it's easier to aim at. Same redesign in the companion chat dock on torn.com.",
      },
    ],
  },
  {
    version: "1.60.0",
    date: "2026-05-17",
    title: "Chat — OC 2.0 readiness digest pinned to #general (Companion 0.35.0)",
    changes: [
      {
        type: "feat",
        summary: "#general and #leadership now pin a live OC 2.0 digest — ready crimes, missing tools, traveling members at a glance",
        detail: "When you have organized crimes in the planning queue, the top of #general (and #leadership) shows a yellow digest card: how many crimes are ready to fire right now, how many are still waiting, which slots are blocked because nobody brought the Drug Pack / Lockpick / etc., and which crime participants are currently traveling abroad (so the crime can't execute). Collapsible per-member (your collapse preference persists). Auto-refreshes every 5 minutes. Same card + same data in the floating Companion chat dock on torn.com. When the queue is empty the card hides itself so #general looks normal.",
      },
    ],
  },
  {
    version: "1.59.0",
    date: "2026-05-17",
    title: "Chat — incoming attacks auto-posted to #war-room with retal cards",
    changes: [
      {
        type: "feat",
        summary: "#war-room now gets a live retaliation feed — every time someone hits a faction member, the attacker pops up as a card with an Attack button",
        detail: "A background job watches the faction's attack log every 60 seconds. When an outside player attacks one of us — hospitalised, mugged, attacked, or even tried-and-lost — a bot message lands in #war-room embedding the attacker's profile URL. The existing entity-card resolver picks up the URL automatically, so the attacker's name, level, faction tag, current status (Hospital / Okay / Traveling) and an Attack button render inline. Dedup is 1 hour per attacker — somebody mugging three of us in 10 minutes posts once, not three times. Works in both the main chat and the Companion dock (same channel, same renderer). No new card type needed — it's the entity-card system from v1.55 doing the heavy lifting.",
      },
    ],
  },
  {
    version: "1.58.1",
    date: "2026-05-17",
    title: "Chat — war card no longer says \"Ended left\" after target score is reached",
    changes: [
      {
        type: "fix",
        summary: "War-room card stops showing \"Ended left\" when the target score is already reached",
        before: "Once a ranked war hit the target score, the time-remaining chip on the war card rendered as \"· Ended left\" — grammatically broken and unclear about whether the war was over or still scoring.",
        after: "The chip now shows \"· Xh Ym left\" while the timer is positive, switches to \"· Target reached\" (yellow) once either side hits target_score, and disappears entirely otherwise.",
        cause: "The frontend always rendered \"{fmtRemaining(secs)} left\", and fmtRemaining returned the literal string \"Ended\" for 0 seconds — combining into the nonsense suffix.",
      },
    ],
  },
  {
    version: "1.58.0",
    date: "2026-05-17",
    title: "Chat — /chain target self-organizes chain assists (Companion 0.34.0)",
    changes: [
      {
        type: "feat",
        summary: "/chain target <ID> posts a coordination card — others tap \"I'm hitting\", everyone gets a push when the target leaves hospital",
        detail: "Type `/chain target 2362436` (or `/chain target [2362436]`, or paste a profile URL) in any chat channel and a red coordination card appears: target name, live status (Okay / Hospital / Jail), the leader who called it, an Attack button, and a list of hitters. Other members tap \"I'm hitting\" to join the list so the leader can see at-a-glance who's already on it. A scheduler job watches the target every 20 seconds — when they leave hospital, every hitter gets a browser push notification (\"X is back up!\") and the card flashes back to green. Leader closes the assist with `/chain end`; opening a new `/chain target` automatically closes the previous one. Same card + same controls in the floating Companion chat dock on torn.com.",
      },
    ],
  },
  {
    version: "1.57.0",
    date: "2026-05-17",
    title: "Chat — live war-room card during ranked wars (Companion 0.33.0)",
    changes: [
      {
        type: "feat",
        summary: "#war-room channel pins a live war card during ranked wars — score, time left, top 5 easiest enemies",
        detail: "During an active ranked war, the war-room channel (both on hub.tri.ovh and in the floating Companion dock on torn.com) gets a sticky red card at the top: live score (us – them, color-coded by who's leading), target score, time remaining, and the 5 easiest currently-attackable enemies (online + Okay status, sorted by threat — hospital/jail/offline filtered out so chain leaders don't waste energy). Tap any enemy chip to jump straight into the attack page. Card auto-refreshes every 30 seconds while you're looking at war-room, and hides itself outside of a war so the channel looks normal the rest of the time.",
      },
    ],
  },
  {
    version: "1.56.1",
    date: "2026-05-17",
    title: "Companion v0.32.1 — the '+ add reaction' button finally opens the picker",
    changes: [
      {
        type: "fix",
        summary: "The smiley '+ add reaction' button on chat messages now opens the emoji picker — and the picker stays open until you pick or click away",
        before: "Even after yesterday's v0.31.1 click-listener fix, tapping the '+' button in the companion chat dock still did nothing visible — no picker would appear. Existing reaction chips (the ones with counts) toggled fine, but adding a new reaction was impossible.",
        after: "The picker now appears anchored above the '+' you tapped and stays open. Tap an emoji to react, or click anywhere else to dismiss it.",
        cause: "The picker was being mounted inside the chat message list, but the message list rewrites its own HTML on every poll, websocket update and entity-resolve cycle — usually within milliseconds — silently deleting the picker before you could see it, let alone click an emoji.",
      },
    ],
  },
  {
    version: "1.56.0",
    date: "2026-05-17",
    title: "Chat — full-text search with Slack-style filters (Companion 0.32.0)",
    changes: [
      {
        type: "feat",
        summary: "Search across all chat history — tap the magnifier, type 'from:Bombel has:link xanax', jump to any past message",
        detail: "The magnifier next to the channel name (Cmd+F on desktop) opens a search panel. Plain text searches every channel you can see; filters compose freely: from:Name limits by author, in:channel-name by channel, has:link or has:reaction or has:pin by what the message contains, before:YYYY-MM-DD and after:YYYY-MM-DD by date, and -word excludes results containing word. Hits are ranked by relevance with the matched fragment highlighted (snippet view). Click a result to jump straight to its channel. Same panel + same syntax in the floating Companion chat dock on torn.com — the icon is in the dock header next to the channel picker.",
      },
    ],
  },
  {
    version: "1.55.2",
    date: "2026-05-17",
    title: "Chat — Attack button on entity cards opens the right page",
    changes: [
      {
        type: "fix",
        summary: "Attack button on chat player cards opens the live attack page instead of showing an API error",
        before: "Clicking the red \"Attack\" button on a player card in chat returned a JSON error: \"This endpoint is no longer available. Please use the new endpoints instead (page.php).\"",
        after: "Attack button now opens the current attack page (page.php?sid=attack) — same one Torn's own profile-page \"Attack\" link uses.",
        cause: "Torn deprecated the legacy /loader.php?sid=attack URL on May 17; the card was still pointing at the old form.",
      },
    ],
  },
  {
    version: "1.55.1",
    date: "2026-05-17",
    title: "Companion v0.31.1 — reaction chips actually clickable again",
    changes: [
      {
        type: "fix",
        summary: "Reaction chips and the '+ add reaction' button respond to clicks in the companion chat dock — for real this time",
        before: "Even after the v0.29.2 reaction-click refactor, the v0.30.0 slash-command framework and the v0.31.0 live entity cards release, tapping an existing reaction chip in the floating chat dock inside torn.com still did nothing. The smiley '+ add reaction' trigger in the top-right of a message was equally dead. Backend logs confirmed not a single reaction request was reaching the API — the click was being swallowed before any HTTP call left the browser.",
        after: "The dock now strips any stale .panel from its shadow root before rendering a fresh one, so the delegated click listener is guaranteed to be bound to the .messages container you actually see and click. Failed reactions now surface an in-dock error (expired session, rate limit, etc.) instead of being silently swallowed. Set localStorage['tm-debug']='1' on torn.com to see every reaction click logged to the console.",
        cause: "startChatDock could run more than once during a Torn SPA navigation; the first run's panel lingered alongside the second run's panel inside the same shadow root. The click listener was bound to the first .messages — but rendering and visible clicks targeted the second one, so nothing happened.",
      },
    ],
  },
  {
    version: "1.55.0",
    date: "2026-05-17",
    title: "Chat — live entity cards (Companion 0.31.0)",
    changes: [
      {
        type: "feat",
        summary: "Torn links in chat now render as live cards — player status, item price, faction tag, war score",
        detail: "Paste a Torn profile URL (or the bracket shorthand [2362436], or any factions.php / item.php / rankedwars link) and the message gets a compact live card under the text: player cards show level, faction tag, status chip and an Attack button; item cards show market low and circulation; faction cards show member count and respect; ranked-war cards show live score, target and time remaining. Cards refresh while the message is on screen and stop polling when it scrolls away, so this stays inside the 100 calls/min API budget. Same cards render in the floating Companion chat dock on torn.com — paste once, see it everywhere.",
      },
    ],
  },
  {
    version: "1.54.0",
    date: "2026-05-17",
    title: "Chat — slash commands (foundation + /help)",
    changes: [
      {
        type: "feat",
        summary: "Type / in chat to see an autocomplete list of commands",
        detail: "Anything starting with /name is now intercepted as a chat command. The autocomplete dropdown shows registered commands with descriptions; arrow keys navigate, Tab or Enter accepts, Esc dismisses. /help lists every command. Unknown /foo shows an ephemeral 'unknown command' hint only you can see — it never lands in the channel. This is the plumbing for upcoming /chain, /poll, /remind, /travel and user-defined macros. Works the same in the floating Companion chat dock on torn.com.",
      },
    ],
  },
  {
    version: "1.53.3",
    date: "2026-05-17",
    title: "Companion v0.29.3 — settings gear reachable on mobile / Torn Companion app",
    changes: [
      {
        type: "fix",
        summary: "Companion settings gear is now tappable on phones and in the Torn Companion app",
        before: "The persistent ⚡ TM Hub Companion chip at the bottom-left of every Torn page rendered the full label — \"TM Hub Companion v0.29 · @YourName\" plus the gear — and on a narrow phone screen the chip stretched far enough right that Torn's floating green chat bubble covered the settings gear. You could see TM Hub was loaded but couldn't open its settings menu without rotating to landscape or zooming.",
        after: "On screens 600px wide and under, the chip collapses to a compact pill: just the ⚡ bolt and the ⚙ gear. Both are larger tap targets (28-32px) than the desktop version, the gear is clear of Torn's chat bubble, and tapping the bolt still opens hub.tri.ovh in a new tab. Desktop layout is unchanged — full label, version and username still show. Update via Tampermonkey Dashboard → TM Hub Companion → Check for updates (v0.29.3).",
        cause: "The chip had no mobile breakpoint; it was sized for desktop and overflowed into the chat-bubble zone on small viewports.",
      },
    ],
  },
  {
    version: "1.53.2",
    date: "2026-05-17",
    title: "Chat — URLs are clickable, companion reactions wired up properly",
    changes: [
      {
        type: "fix",
        summary: "Torn URLs in chat messages now render as proper clickable links",
        before: "Pasting a profile URL like https://www.torn.com/profiles.php?XID=4096610 left it as plain grey text — you had to copy-paste it into the address bar to actually visit. Same for any other http(s) URL or bare torn.com/… shortcut.",
        after: "URLs and bare torn.com/… paths render as blue underlined links that open in a new tab. Works in both the main chat on hub.tri.ovh and the floating chat dock inside torn.com. Trailing punctuation like commas isn't pulled into the link target.",
        cause: "The renderer only linkified @mentions; URLs were treated as plain text. Now it does a single pass for both.",
      },
      {
        type: "fix",
        summary: "Reaction chips and the '+ add reaction' button respond to clicks in the companion chat dock",
        before: "After reactions shipped, clicking an existing chip in the floating chat dock inside torn.com did nothing — you couldn't toggle your own reaction off, and the '+ add reaction' trigger wouldn't open the emoji picker either.",
        after: "Click handler is now wired through a shared helper covered by unit tests; clicking a chip toggles your reaction, clicking the smiley trigger in the top-right of a message opens the curated emoji picker. Works whether the click lands on the chip itself, the emoji inside, or the count badge.",
        cause: "Event delegation lived in a one-off inline closure that couldn't be unit-tested; moving it into a shared helper (lib/chat-render.ts) exercised the path and surfaced the missing wiring.",
      },
    ],
  },
  {
    version: "1.53.1",
    date: "2026-05-17",
    title: "Chat — tighter spacing when no reactions",
    changes: [
      {
        type: "fix",
        summary: "Empty reaction row no longer adds vertical space between messages",
        before: "After the reactions feature shipped, every message reserved a row for the chip strip and the '+ add reaction' button — so unreacted messages had a visible gap underneath, making the conversation feel airier than before.",
        after: "Messages with no reactions render flush against the next one. The '+ add reaction' button now lives in the existing hover action pill at the top-right (next to edit/pin/delete in the main chat, top-right of the bubble in the Companion).",
        cause: "The reactions wrapper was always rendered for layout consistency; collapsing it to null when empty restores the original message density.",
      },
    ],
  },
  {
    version: "1.53.0",
    date: "2026-05-17",
    title: "Chat — emoji reactions on every message",
    changes: [
      {
        type: "feat",
        summary: "Tap any chat message to react with an emoji",
        detail: "A '+' button now appears on hover next to every chat message; tap it and pick from a curated palette (👍 ❤️ 🎉 ✅ ❌ 👀 💀 🔴 🟡 🟢 and friends). Reactions render as compact chips below the message with a count and the names of everyone who reacted on hover; tap your own chip to take it back. Works the same in the floating Companion chat dock on torn.com — reactions sync live across both surfaces. Foundation for the upcoming /poll command (🟢🟡🔴 quick polls).",
      },
    ],
  },
  {
    version: "1.52.0",
    date: "2026-05-17",
    title: "Chat — detect Torn entities in messages (foundation for live cards)",
    changes: [
      {
        type: "feat",
        summary: "Chat now identifies Torn links and shorthand in every message",
        detail: "Every chat message is now scanned for Torn player profiles, faction profiles, items and ranked-war links — including bracket shorthand like [2362436] and [Xanax]. Nothing visible changes yet; this is the groundwork for the upcoming live entity cards that will render status, market and war data inline next to each link.",
      },
    ],
  },
  {
    version: "1.51.0",
    date: "2026-05-17",
    title: "Chat — grouped messages and avatars",
    changes: [
      {
        type: "improve",
        summary: "Consecutive messages from the same person no longer repeat the nick and timestamp",
        detail: "When the same player sends several messages in a row within five minutes, only the first one shows their avatar, name and time. The rest line up underneath as continuation lines, with the time still revealed on hover in the left gutter. Less visual noise, easier to read long bursts of conversation.",
      },
      {
        type: "improve",
        summary: "Companion chat dock now shows member avatars",
        detail: "The floating chat panel injected into torn.com pages now displays the same circular member avatars as the full TM Hub chat, with initials as a fallback for members whose photo has not been cached yet. Same five-minute grouping rule applies — repeated authors collapse into a single block.",
      },
    ],
  },
  {
    version: "1.50.8",
    date: "2026-05-17",
    title: "Sidebar pins survive page refresh",
    changes: [
      {
        type: "fix",
        summary: "Sidebar pins no longer reset to the default three on every page refresh",
        before: "After pinning items like Spy, Awards, or Stocks to the sidebar, the next hard refresh quietly reset everyone's pin list back to the default Dashboard / Team / Chain trio. The reset hit both the on-server favorites and the local copy, so the customisation was unrecoverable — you had to re-pin from scratch every session, and a cross-device check on prod showed all 26 active users sitting on the exact same default list.",
        after: "Pins are now read from the server first and only written back when you actually change something. Pin Spy once, refresh as many times as you want, switch devices, redeploy — your list stays exactly as you left it.",
        cause: "The background sync was racing the initial server fetch and pushing the placeholder default list up before your real pins loaded.",
      },
    ],
  },
  {
    version: "1.50.7",
    date: "2026-05-17",
    title: "Companion chat — date headers stop overlapping each other",
    changes: [
      {
        type: "fix",
        summary: "Companion chat date headers no longer pile up on the top edge during scroll",
        before: "v0.27.3 used a sticky pill so the day label stayed pinned to the top of the chat dock while you scrolled. In the narrow Companion panel the sticky pills did not push each other out of the way the way they do in wider chats — two or three consecutive day pills collided in the top-right corner and rendered as overlapping fragments.",
        after: "Each day boundary now renders as a centered inline pill with a hairline divider on each side (Today / Yesterday / Monday / Apr 6). The label scrolls with the conversation instead of pinning, so different days can no longer overlap. Per-message timestamps still carry the day (\"Yesterday 22:00\", \"Mon 22:00\"), so even when the divider is off-screen you can tell which day a line belongs to. Update via Tampermonkey Dashboard → TM Hub Companion → Check for updates (v0.27.4).",
      },
    ],
  },
  {
    version: "1.50.6",
    date: "2026-05-17",
    title: "Companion chat dock — date headers so you can tell today from last week",
    changes: [
      {
        type: "fix",
        summary: "Companion chat now shows day labels and sticky date headers, not just a bare time",
        before: "Inside the Torn-page chat dock, every message showed only a HH:MM time with no day attached and no divider between conversations from different days. A message you sent today at 00:30 looked indistinguishable from one sent at 22:00 the night before — chat scrollback was effectively undated.",
        after: "Each timestamp now carries its day when it's not today: \"Yesterday 22:00\", \"Mon 22:00\", or a full date for anything older than a week. A sticky \"Today / Yesterday / Monday\" pill rides the top of the chat dock as you scroll, so you always see which day's messages you're reading. Update via Tampermonkey (Greasy Fork auto-syncs within an hour) or reload your direct install at hub.tri.ovh/install.",
      },
    ],
  },
  {
    version: "1.50.5",
    date: "2026-05-17",
    title: "Chat — date headers so messages from different days stop looking adjacent",
    changes: [
      {
        type: "fix",
        summary: "Chat messages now show the day, not just the time",
        before: "Messages older than today only showed a short timestamp like \"22:00\" with no day attached, and the thin date divider between days was easy to miss while scrolling. A message posted today at 00:30 looked like it was sent two hours after a message from yesterday at 22:00.",
        after: "Every timestamp older than today now carries a day label: \"Yesterday 22:00\", \"Mon 22:00\", or a full date for anything older than a week. The day divider between conversations is now a sticky pill that stays pinned to the top of the message list while you scroll, so you always know which day you're reading.",
        cause: "Previous format relied solely on a low-contrast divider; under quick scrolling players never saw it.",
      },
    ],
  },
  {
    version: "1.50.4",
    date: "2026-05-17",
    title: "Companion is now on Greasy Fork — true 1-click install on Chrome",
    changes: [
      {
        type: "feat",
        summary: "TM Hub Companion published on Greasy Fork — Chrome no longer demands Developer Mode",
        detail: "The Companion is listed at greasyfork.org/scripts/578482-tm-hub-companion. /install now shows a green 1-click 'Open Greasy Fork →' hero card as the recommended desktop path: Tampermonkey trusts GF natively, so the install prompt opens without the Chrome 130+ 'cannot install scripts from this website' wall. Greasy Fork's automatic sync polls hub.tri.ovh/companion.user.js every hour, so every Companion release lands on GF within an hour — nothing to do per release. The direct-link and Manual-install fallbacks shipped yesterday stay in place as the kill-switch path.",
      },
      {
        type: "improve",
        summary: "Companion userscript now declares @license MIT and @supportURL in its header",
        detail: "Greasy Fork's policy requires an explicit license tag; without it, the listing warns that users cannot redistribute or modify the script. The build now injects // @license MIT and a @supportURL pointing at /install on every Companion build, so future syncs go through without manual edits.",
      },
    ],
  },
  {
    version: "1.50.3",
    date: "2026-05-17",
    title: "/install — unstick newcomers on \"cannot install scripts from this website\"",
    changes: [
      {
        type: "fix",
        summary: "Companion install link no longer leaves Chrome users with a Tampermonkey error and no recovery path",
        before: "Clicking the desktop install link on /install threw a Tampermonkey error (\"you cannot install scripts from this website\") for any Chrome 130+ user without Developer Mode enabled at chrome://extensions/. The page gave no hint about the fix, so new members effectively could not install the Companion at all.",
        after: "The install card now ships with an expandable \"Manual install (always works)\" section: it explains the Chrome Developer Mode requirement in two clicks, and offers a Copy-URL button that pastes straight into Tampermonkey Dashboard → Utilities → Install from URL. The Troubleshooting list surfaces the same recovery path. iPhone, iPad, and Android visitors now see only the Torn PDA card instead of a desktop path that cannot succeed on their device.",
        cause: "Chrome 130+ enforces an MV3 restriction that requires Developer Mode for any non-store userscript install — the install page silently assumed the old behaviour.",
      },
      {
        type: "fix",
        summary: "/install no longer hides behind the TM Hub login wall — newcomers can read install docs first",
        before: "Anyone hitting /install before logging into TM Hub saw only the API-key login card. New faction members had to log into TM Hub before they could see how to install the Companion — an order-of-operations trap, since most of them came to the page precisely because someone in chat said \"install the Companion first\".",
        after: "/install is now part of the public-routes allowlist. The page renders for unauthenticated visitors exactly the same as for logged-in members. Other pages still require login.",
        cause: "The auth gate had no concept of public routes — every page in the app fell through to the same login wall.",
      },
    ],
  },
  {
    version: "1.50.2",
    date: "2026-05-16",
    title: "Companion v0.27.2 — hide the TM Hub pins panel on torn.com if you don't want it",
    changes: [
      {
        type: "feat",
        summary: "Companion settings now have a 'TM Hub pins' toggle to hide the floating pins panel",
        detail: "If the floating TM Hub Pins panel in the top-left of every Torn page is in your way, you can now turn it off from the gear menu on the Companion chip (Overlays → TM Hub pins). Default stays on, the pin shortcuts in TM Hub itself are unaffected, and flipping the toggle takes effect immediately without a page reload.",
      },
    ],
  },
  {
    version: "1.50.1",
    date: "2026-05-16",
    title: "Companion profile page no longer jumps around while loading",
    changes: [
      {
        type: "fix",
        summary: "Companion profile pages stopped lagging the browser with visible jank",
        before: "Opening a profile on torn.com made the page visibly jump several times as Companion overlays (FF chip, intel card, flight pill, claim button, activity chip, loot panel) faded in one by one — players reported the script making the browser feel slow.",
        after: "All Companion overlays now mount into a single pre-allocated container with reserved height, so they fill in without shifting anything around them.",
        cause: "Each overlay waited for its own network request before claiming layout space, so every response triggered a fresh shift.",
      },
    ],
  },
  {
    version: "1.50.0",
    date: "2026-05-16",
    title: "Intel Pack — server-backed scouting suite (FF fallback, flights, activity, hit claims)",
    changes: [
      {
        type: "feat",
        summary: "Intel Pack — FF score fallback when no spy estimate is available",
        detail: "When a target has no fresh spy data, the Companion now shows a FFScouter-style FF chip on profile, attack, and roster pages with the dominant stat (STR / DEF / SPD / DEX) you should counter. Spy data still wins everywhere we have it — the FF chip only kicks in as a fallback, so you no longer click blind on un-scouted targets. Flag-gated, server-computed, cached 60s.",
      },
      {
        type: "feat",
        summary: "Intel Pack — flight tracker with 60s server-side polling and ticket-class detection",
        detail: "TM Hub now polls Torn every 60s for faction departures and renders a ✈️ flight pill on roster/profile/attack pages with the destination, ticket class (standard / private / business / WLT / book), and predicted landing time. The /travel page surfaces an airborne section listing everyone currently in flight. Server-side detection means a departure is captured even when nobody has the tab open — useful for chasing landings during ranked wars.",
      },
      {
        type: "feat",
        summary: "Intel Pack — 7x24 activity heatmap of when each player is online",
        detail: "Backend now samples last_action.timestamp every 5 minutes and bins the result into a 7-day x 24-UTC-hour matrix (14-day rolling retention). /team row details show the full heatmap; the Companion drops an 'Most active 14:00-18:00 UTC' chip on /profile.php. Outsiders the faction is scoping get enrolled organically the first time a member opens their profile in TM Hub or the Companion — so the dataset grows without leadership doing anything.",
      },
      {
        type: "feat",
        summary: "Intel Pack — hit-call claims to stop two teammates wasting energy on the same kill",
        detail: "One-click 🎯 Claim button on the Companion (profile, hospital rows, attack-end screen) reserves a target for 15 minutes — faction-wide visibility, auto-expires, can be released manually any time. The /chain page embeds an Active Claims panel with a live SSE stream so updates arrive instantly; the frontend falls back to 5s polling if SSE drops. Bundled with a new /guide/intel-pack explainer page and an FAQ covering how spy/FF interplay works, who can see your heatmap, and what happens to expired claims.",
      },
    ],
  },
  {
    version: "1.49.1",
    date: "2026-05-16",
    title: "Companion v0.27.1 — profile pages stop hitching on every TM Hub overlay load",
    changes: [
      {
        type: "fix",
        summary: "TM Hub overlays on /profile.php no longer push the page around as they load",
        before: "Opening a profile made the page jump around for a second or two — the OFF-LIMITS card, FF chip, intel card, claim button, flight pill, activity chip and loot overlay each appeared one after another, each pushing whatever was below them further down. Web Vitals scored layout shift as 0.61 (poor).",
        after: "All seven overlays land inside a single reserved-height container that the companion drops in the moment the page loads, so the rest of the profile keeps its position even while overlay data is still being fetched.",
        cause: "Each overlay was mounting itself with insertBefore on the page header as soon as its fetch resolved, with no shared parent to hold space in advance.",
      },
    ],
  },
  {
    version: "1.49.0",
    date: "2026-05-16",
    title: "Companion v0.26 — Edit a saved target without removing and re-saving it",
    changes: [
      {
        type: "feat",
        summary: "Profile intel card now exposes Edit and Remove side-by-side for saved targets",
        detail: "Until now, tweaking a target's tag, difficulty, or notes meant clicking 'Saved → tap to remove' and going through the save flow from scratch. The card on /profile.php now shows two buttons when a target is saved — ✏️ Edit target opens the same modal pre-filled with the current tag, difficulty, and notes; 🗑 Remove still asks for confirmation. Saves an annoying round-trip when you just want to bump a difficulty.",
      },
    ],
  },
  {
    version: "1.48.0",
    date: "2026-05-16",
    title: "Companion v0.25 — TM Hub pin shortcuts on every Torn page",
    changes: [
      {
        type: "feat",
        summary: "Floating quick-pins panel on torn.com with an inline picker",
        detail: "A small TM Hub Pins panel now floats in the top-left of every Torn page once you're connected. It lists the routes you've pinned in TM Hub (Dashboard, Team, Chain, etc.) as one-click links — Torn fight night and TM Hub stay one tab apart. A ✎ button reveals an inline picker (checkboxes over 14 of the most-pinned routes) so you can add or remove pins without leaving Torn; changes sync to TM Hub and the existing /preferences/pinned-navs UI sees them on its next poll.",
      },
    ],
  },
  {
    version: "1.47.1",
    date: "2026-05-16",
    title: "Changelog page no longer triggers extra re-renders on open",
    changes: [
      {
        type: "fix",
        summary: "Opening the changelog stops the 'new version' banner without extra re-render cascade",
        before: "Visiting /changelog tried to dismiss the 'new version' banner while the page was still rendering, which made React re-run the whole shell once or twice extra and showed a warning in the browser console.",
        after: "The dismiss now runs once after the page has mounted, so the shell renders exactly once and the warning is gone.",
        cause: "The dismiss call was placed in the component body instead of an effect, so each render scheduled another state update.",
      },
    ],
  },
  {
    version: "1.47.0",
    date: "2026-05-16",
    title: "Companion v0.24 — Submit spy stats straight from the attack-end screen",
    changes: [
      {
        type: "feat",
        summary: "Submit-spy chip on attack pages when the loser's stats are revealed",
        detail: "After a fight where the opponent's stats showed up in the outcome panel (STR/DEF/SPD/DEX visible), the Companion now drops a small \"Submit spy to TM Hub\" chip in the top-right of the page. One click ships those four numbers to /api/spy/submit so the rest of the faction sees up-to-date intel — no copying numbers into the web app by hand. Chip is hidden when stats aren't on screen, removes itself after a successful submit, and shows a retry label if the call fails.",
      },
    ],
  },
  {
    version: "1.46.1",
    date: "2026-05-16",
    title: "Companion install instructions now appear first on /install",
    changes: [
      {
        type: "improve",
        summary: "Install steps (Tampermonkey + Torn PDA) moved above the 'what works today' grid on the Companion page",
        detail: "Opening TM Hub Companion used to scroll past a long 'what works today' feature list before showing how to actually install the userscript. The install paths now sit directly under the page header, with the feature status grid moved below them — easier to find the install button when that's why you're on the page.",
      },
    ],
  },
  {
    version: "1.46.0",
    date: "2026-05-16",
    title: "Companion v0.23 — Clear all inbox toasts in one click",
    changes: [
      {
        type: "feat",
        summary: "Mark-all-read button in the Companion notification toast tray",
        detail: "When you have one or more TM Hub inbox toasts on screen (bottom-right corner), a small \"Mark all read\" pill now sits below them. Click it once and the tray clears immediately — and the unread badge in TM Hub follows on its next poll. Button auto-hides when the tray is empty so it never lingers with nothing to do.",
      },
    ],
  },
  {
    version: "1.45.1",
    date: "2026-05-16",
    title: "Spy estimate stops showing 7B for everyone without a real spy",
    changes: [
      {
        type: "fix",
        summary: "Heuristic stat estimate now reflects the target player, not the TM Hub key owner",
        before: "Every player without a TornStats or YATA spy was shown with the same 7.02B total, split 1.76B per stat — including level 39 nine-month-old accounts.",
        after: "The estimate is computed from the target player's own xanax, refills, level and account age, so a fresh account no longer shows endgame numbers.",
        cause: "The Torn API call passed the player id as a query parameter, which it silently ignores — the response was the API key owner's stats.",
      },
    ],
  },
  {
    version: "1.45.0",
    date: "2026-05-16",
    title: "Companion v0.22 — Hall of Fame leaderboards highlight TM mates and war enemies",
    changes: [
      {
        type: "feat",
        summary: "Hall of Fame rows get a small TM pill on faction mates and a ☠ pill on current war enemies",
        detail: "Open /halloffame.php on any tab (chain, ranked war, attacks, etc.) and the rows you scroll past now carry small inline pills next to known players — green TM for faction mates, red ☠ for the current war enemy. No row tinting, nothing on people we don't recognise, so the leaderboard still looks like a leaderboard. Quiet by design.",
      },
    ],
  },
  {
    version: "1.44.1",
    date: "2026-05-16",
    title: "Wars page loads roughly twice as fast",
    changes: [
      {
        type: "improve",
        summary: "Wars endpoint now fetches faction history and past ranked wars in parallel",
        detail: "The /wars page used to wait for two independent Torn API calls one after the other — current/recent wars first, then the past ranked wars list. They now run concurrently, roughly halving the response time on slow days. Same pattern Stocks and Company already use.",
      },
    ],
  },
  {
    version: "1.44.0",
    date: "2026-05-16",
    title: "Companion v0.21 — Jail list now marks TM mates and war enemies inline",
    changes: [
      {
        type: "feat",
        summary: "Jail list rows show TM mate / war enemy / OFF-LIMITS / target pills inline",
        detail: "Open /jailview.php on Torn and each row gets a tinted background and a small pill next to the name if we know the player: green for TM mates (don't bust unless asked), red for current war enemies (good bust candidates to keep them in), 🚫 OFF-LIMITS for anyone flagged in TM Hub, and 🎯 target for your saved targets — with your tag, if any. People we don't recognise stay untouched so the page doesn't get noisy.",
      },
    ],
  },
  {
    version: "1.43.0",
    date: "2026-05-16",
    title: "Companion v0.20 — OC 2.0 readiness card on Torn's crimes page",
    changes: [
      {
        type: "feat",
        summary: "Planning + executing OCs surface inline on /factions.php?step=crimes",
        detail: "Open the faction crimes page and TM Hub now mounts a card above Torn's own list: a top pill tells you whether you're already booked into an OC or free to join, then each planning OC shows its slot fill (filled/total), average CPR across the filled slots, difficulty, and the next ready-at countdown. Executing OCs show alongside with member count and how long ago they kicked off. Skip the click into TM Hub when you just want to know 'is there anything I should join right now?'",
      },
    ],
  },
  {
    version: "1.42.7",
    date: "2026-05-16",
    title: "Team page shows a skeleton while loading",
    changes: [
      {
        type: "improve",
        summary: "Loading state on Our Team now shows a table skeleton instead of a centered 'Loading team data…' line",
        detail: "Opening Our Team used to show a single line of text in the middle of an otherwise empty box while data loaded. It now shows ten placeholder rows matching the eventual member table, same pattern Awards, OC, Chain, and the Item Market already use.",
      },
    ],
  },
  {
    version: "1.42.6",
    date: "2026-05-16",
    title: "Item Market page shows a skeleton while loading + tighter auth header validation",
    changes: [
      {
        type: "improve",
        summary: "Loading state on /market now shows table-shaped skeleton instead of plain text",
        detail: "Opening the Item Market used to show a single pulsing 'Loading market data...' line while the API call resolved. It now shows ten placeholder rows matching the table's seven columns, same pattern Awards, OC and Chain already use. Less likely to feel broken on slow networks.",
      },
      {
        type: "improve",
        summary: "Authentication middleware now rejects 'X-Player-Id: 0' instead of letting it through",
        detail: "Torn never issues player_id 0 — every real player has a positive ID. The middleware already validated that the header was a number and matched the token's subject, but didn't enforce the domain rule. A forged token (only possible with our JWT secret) could otherwise impersonate a non-existent 'player 0'. Defensive hardening rather than a live exploit, but cheap.",
      },
    ],
  },
  {
    version: "1.42.5",
    date: "2026-05-16",
    title: "Push-notification subscription no longer silently saves a broken record",
    changes: [
      {
        type: "fix",
        summary: "Subscribing to push notifications with missing browser keys now returns a clear error instead of looking successful",
        before: "Asking to enable push notifications returned 'subscribed' even when the browser sent an empty cryptographic-keys payload. The row was saved to our side, but the actual push never reached the device — you'd toggle notifications on, see no confirmation problem, then never receive anything.",
        after: "The subscribe endpoint now rejects requests with missing or empty keys (or an empty endpoint) with a 422 validation error, so a buggy or unsupported browser surfaces the problem at registration time instead of vanishing into silent failure.",
        cause: "The subscribe request model accepted the keys block as a free-form dictionary, with empty-string fallbacks if the keys were missing. The empty strings looked valid enough to save, but the web-push library couldn't encrypt anything with them.",
      },
    ],
  },
  {
    version: "1.42.4",
    date: "2026-05-16",
    title: "Chain page loading skeleton + fewer redundant Torn API calls for training data",
    changes: [
      {
        type: "improve",
        summary: "Chain page now shows a table skeleton while loading",
        detail: "Both the main chain view and the chain detail view used to show a single line of pulsing gray text while loading. They now show table-shaped skeletons matching the columns of the eventual table, same pattern as Awards and Stocks.",
      },
      {
        type: "fix",
        summary: "Opening pages that all read your training data no longer multiplies Torn API hits",
        before: "Several screens (Your Stats, Company Director / Training, Company / Faction) each read the same Torn training endpoint for the same player. Because that endpoint wasn't cached on our side, every screen opening within a minute triggered its own round-trip to Torn — wasted bandwidth and a faster path to Torn's per-key rate limit.",
        after: "The training data fetcher now caches per-key for one minute, matching every other user-scoped endpoint. The first screen pays the upstream call; subsequent ones served instantly from memory.",
        cause: "When the training fetcher was added it was the lone outlier in the API client — every sibling fetcher had the cache lookup, this one didn't. Easy miss, no test catching it until now.",
      },
    ],
  },
  {
    version: "1.42.3",
    date: "2026-05-16",
    title: "Organised Crime page now shows skeleton cards while loading",
    changes: [
      {
        type: "improve",
        summary: "Loading state on /oc matches the rest of the app — skeleton cards instead of plain text",
        detail: "Opening the Organised Crime page used to show a single line of pulsing gray text while data loaded. It now shows three card-shaped placeholders, matching the pattern Stakeout, Targets and the Company pages already use. Less likely to feel broken on slow networks, especially on mobile.",
      },
    ],
  },
  {
    version: "1.42.2",
    date: "2026-05-16",
    title: "Companies-by-faction loads roughly three times faster",
    changes: [
      {
        type: "improve",
        summary: "/api/company/faction parallelizes member training-data fetches",
        detail: "The endpoint that powers the Companies-by-faction view used to fetch each member's training data one after the other. It now fans them out concurrently, capped at five in flight at a time. For a faction with dozens of registered keys this turns ~7 seconds of waiting into something closer to two, matching the pattern already used by the company-director endpoint.",
      },
    ],
  },
  {
    version: "1.42.1",
    date: "2026-05-16",
    title: "Awards page now shows a proper skeleton while loading",
    changes: [
      {
        type: "improve",
        summary: "Loading state on /awards matches the rest of the app — table skeleton instead of plain text",
        detail: "Opening the Awards page used to show a single line of pulsing gray text while data loaded. It now shows a 12-row table skeleton — the same pattern Bounties, Revives and Stocks already use. Less likely to feel broken on slow networks, especially on mobile.",
      },
    ],
  },
  {
    version: "1.42.0",
    date: "2026-05-16",
    title: "Companion v0.19 — Spot underpriced item market listings without leaving Torn",
    changes: [
      {
        type: "feat",
        summary: "Fair-price pills on every /imarket.php listing",
        detail: "Open Torn's item market and each listing now carries a small pill: green if the asking price is more than 10% below TM Hub's fair value, red if it's more than 10% above, grey if it's within ±10%. The pill shows the % delta so you can sort the deals at a glance. Fair value comes from Torn's own market_value field, refreshed every 5 minutes — same data TM Hub uses elsewhere.",
      },
    ],
  },
  {
    version: "1.41.2",
    date: "2026-05-16",
    title: "Companion war polling no longer crashes when Torn's API flakes",
    changes: [
      {
        type: "fix",
        summary: "/api/wars/current stopped throwing 500s during Torn upstream hiccups",
        before: "Every time Torn's API returned 504 Gateway Timeout or dropped the connection, the Companion extension's war-id poll surfaced as an UNHANDLED error in our monitoring — six events in 14 days, all upstream noise we couldn't act on.",
        after: "Upstream 5xx, timeout, connect and read errors now return the same empty payload as 'no war right now'. The extension polls again on its next cycle and nothing is logged as a real error.",
        cause: "The route called Torn's API without a try/except, so any httpx 5xx or timeout propagated up as an unhandled exception and got captured by Sentry's logger integration.",
      },
    ],
  },
  {
    version: "1.41.1",
    date: "2026-05-16",
    title: "Faster stock portfolio + tighter chat-history limits",
    changes: [
      {
        type: "improve",
        summary: "Stock portfolio page loads about twice as fast",
        detail: "The portfolio endpoint used to fetch the stock market and your holdings one after the other. They're now fetched in parallel, roughly halving the response time players see when opening the portfolio tab.",
      },
      {
        type: "fix",
        summary: "Chat history endpoint no longer dumps the entire channel for negative page sizes",
        before: "The chat-message endpoint silently accepted any integer for the page-size parameter. Passing a negative value pulled the entire channel history in one response — small risk for normal players, but a way for a curious or hostile client to spike server load and pull more than intended.",
        after: "The endpoint now requires the page size to be between 1 and 100. Out-of-range values are rejected with a clear validation error before the database is even touched.",
        cause: "A newer paginated endpoint was missing the same range guards that every other paginated endpoint in the app already had.",
      },
    ],
  },
  {
    version: "1.41.0",
    date: "2026-05-16",
    title: "Companion v0.18 — TM Hub pills now appear wherever player names show up on Torn",
    changes: [
      {
        type: "feat",
        summary: "Pills inline on /messages, /forums, /friendlist, /searchresults",
        detail: "Anywhere a profile link appears on Torn, the Companion now drops a tiny pill next to the name if we know the player: 🚫 OFF-LIMITS during war, 🎯 saved target (with your tag), 👁 stakeout, plus spy total + age when we have it. No background tints, no decoration on people we don't know — keeps the page quiet.",
      },
      {
        type: "fix",
        summary: "/api/enemy no longer 500s when Torn returns a malformed members payload",
        before: "fetch_enemy_members used the same bare-index pattern as fetch_members — when Torn's faction members endpoint returned a 200 without the 'members' key, /api/enemy crashed with KeyError.",
        after: "Same defensive shape as the fetch_members fix from v1.40.2: missing-key responses now return an empty list and log as an integration failure, no 500.",
        cause: "Follow-up debt surfaced during the post-mortem of the 2026-05-15 outage — same pattern, different function, only matter of time before it'd fire on prod too.",
      },
    ],
  },
  {
    version: "1.40.6",
    date: "2026-05-16",
    title: "Browser no longer hitches every few seconds while TM Hub is open",
    changes: [
      {
        type: "fix",
        summary: "Chrome stutter every dozen seconds — removed always-on paint pressure",
        before: "Across every page, on both desktop and mobile, Chrome would briefly hitch every 10–20 seconds whether you were idle or interacting. Heavy users felt it most after the tab had been open a while.",
        after: "The pulsing glow on the TM Hub logo is now a static glow, the alert-banner box-shadow no longer animates infinitely, the chat-unread badge only pops once when the count changes, and the mobile header drops the expensive backdrop-blur. The 30s background poll also adds a small random jitter so multiple tabs/clients don't burst-render in lockstep. Users who set 'Reduce motion' in their OS now get a fully static UI.",
        cause: "Several CSS animations (text-shadow pulse, box-shadow pulse) ran infinitely on always-mounted shell elements, and `text-shadow` can't be GPU-accelerated — every frame triggered a main-thread repaint. On weaker GPUs (mobile, busy machines) this baseline cost made any other small task visible as a hitch.",
      },
    ],
  },
  {
    version: "1.40.5",
    date: "2026-05-16",
    title: "Enemy profile no longer shows NaN stats next to a fake total",
    changes: [
      {
        type: "fix",
        summary: "Some enemy profiles showed NaN per-stat values with a wildly wrong total",
        before: "Opening a player like Deadly_Assassin [348794] on Torn showed a TM Hub panel with 'today / estimate' badges, a 2.67B total, and STR/DEF/SPD/DEX all reading NaN — while YATA below showed real values adding up to 9.3B.",
        after: "We now ignore spy network responses that don't include a per-stat breakdown, falling back to YATA, your faction snapshot, or our personalstats-based estimator. If nothing has real data the panel says 'No spy estimate available' instead of inventing a misleading number, and the rendering guards turn any non-finite value into a dash.",
        cause: "TornStats returns the literal string 'N/A' for per-stat fields when nobody in their network has actually spied the player — only a level-based total guess. The string slipped past our number coercion and got stored as text in a numeric column, which the browser then rendered as NaN.",
      },
    ],
  },
  {
    version: "1.40.4",
    date: "2026-05-16",
    title: "Spy deep-link page hydrates instead of stalling on the loading spinner",
    changes: [
      {
        type: "fix",
        summary: "/spy/<player_id> stopped getting stuck on the loading dots",
        before: "After the v1.40.3 re-ship the URL loaded but the page never hydrated — three dots animated forever and the spy lookup never started. The browser console showed multiple Content-Security-Policy violations blocking Next.js inline hydration scripts.",
        after: "The deep-link route now returns a CSP that allows the inline scripts the Next.js RSC payload needs (same as the rest of the static export), so the page hydrates and the spy lookup fires immediately.",
        cause: "The strict API-side CSP blocked the inline self.__next_f.push(...) tags that Next.js 16 emits to ship hydration data; static pages served directly by nginx never had that CSP applied, but the new FastAPI route did.",
      },
    ],
  },
  {
    version: "1.40.3",
    date: "2026-05-16",
    title: "Spy deep-link URLs are back — and nginx config now gets validated in CI",
    changes: [
      {
        type: "feat",
        summary: "/spy/<player_id> works again as a linkable URL",
        detail: "You can paste or bookmark hub.tri.ovh/spy/2362436 and land on that player's spy card. This time the route is served by the backend instead of an nginx rewrite, so there's no path-mismatch risk.",
      },
      {
        type: "improve",
        summary: "CI now validates nginx.conf syntax before every deploy",
        detail: "After yesterday's 9-min outage caused by a bad nginx block, the deploy workflow runs `nginx -t` against a clean container before triggering Coolify. Syntax errors will fail the workflow instead of taking prod down.",
      },
    ],
  },
  {
    version: "1.40.2",
    date: "2026-05-15",
    title: "Spy deep-link URLs + fewer 500s when Torn's API hiccups",
    changes: [
      {
        type: "feat",
        summary: "/spy/<player_id> is now a real linkable URL",
        detail: "You can paste or bookmark hub.tri.ovh/spy/2362436 and land directly on that player's spy card. Previously the same URL 404'd and you had to type the ID into the search box first.",
      },
      {
        type: "fix",
        summary: "/api/overview no longer 500s when Torn returns a malformed members payload",
        before: "When Torn's faction members endpoint returned a 200 with a payload missing the 'members' key (their occasional shape drift), the overview endpoint crashed with KeyError and TM Hub's main page failed to load.",
        after: "The fetch now treats a missing 'members' key the same as a network blip — logged as an integration failure, no 500 to the user, retries on the next poll.",
        cause: "We were bare-indexing raw['members'] instead of defending against the upstream sometimes omitting the key.",
      },
      {
        type: "fix",
        summary: "/api/stocks/portfolio no longer 500s when Torn returns a list instead of a dict",
        before: "When Torn's user/stocks selection returned an array shape (which happens for some keys and some empty-portfolio cases), the route crashed with AttributeError trying to iterate it as a dict.",
        after: "Non-dict shapes now fall through to the same 'No stock data' 403 the route already used for empty portfolios — no 500.",
        cause: "The route assumed the Torn payload was always a dict; reality is the shape sometimes drifts to a list.",
      },
      {
        type: "fix",
        summary: "Honor circulation scheduler job stopped crashing on a list-shaped Torn response",
        before: "Once every few days the background job that snapshots faction honor circulation crashed with AttributeError, leaving a gap in the circulation history graph.",
        after: "The Torn client now normalizes the honor/medal payloads to dicts keyed by id before returning them, so the job iterates a stable shape.",
        cause: "Same shape drift class as the overview and stocks bugs — fix is in one place at the Torn client boundary.",
      },
    ],
  },
  {
    version: "1.40.1",
    date: "2026-05-15",
    title: "Companion shows real battle stats for teammates instead of \"no data\"",
    changes: [
      {
        type: "fix",
        summary: "TM Hub Intel on a teammate's Torn profile said \"no spy estimate available\" even when we had their exact stats",
        before: "Visiting a faction member's profile (or looking them up on /spy) showed \"no data\" because TornStats and YATA almost never have spies on our own teammates.",
        after: "If the teammate has their API key registered with TM Hub we now show their exact stats straight from our daily snapshot — STR / DEF / SPD / DEX and total. For players we don't have at all we fall back to a rough estimate derived from their public personalstats so the panel is no longer empty.",
        cause: "The spy lookup only ever asked external spy networks; it ignored the stat snapshots we already collect for every registered member.",
      },
    ],
  },
  {
    version: "1.40.0",
    date: "2026-05-15",
    title: "Battle stat estimates now pull from YATA too — no more year-old spy data",
    changes: [
      {
        type: "fix",
        summary: "Player total battle stats showed a fraction of the real value when TornStats held a stale spy",
        before: "If TornStats's spy on a player was outdated (e.g. from a year ago when they had 2.67B), we showed 2.67B even though YATA had a fresh 9B spy on the same player.",
        after: "Every spy lookup now queries TornStats and YATA in parallel and picks the most recent actual spy. The age shown is the real spy date, not when we last refreshed.",
        cause: "We only ever read TornStats, and we stamped each fetch with 'now' so the cached row always looked fresh even when the underlying spy was a year old.",
      },
    ],
  },
  {
    version: "1.39.4",
    date: "2026-05-15",
    title: "Companion v0.17.4 — Connect now works on Torn PDA",
    changes: [
      {
        type: "fix",
        summary: "Connect now button on Torn PDA finally opens the auth page",
        before: "On Torn PDA, tapping Connect now in the companion popover did nothing — no navigation, no window.",
        after: "PDA users are sent straight to the auth page; once they sign in, they get bounced back to where they came from with the connection live.",
        cause: "Torn PDA's in-app browser ignores requests to open a new tab — the companion now navigates in place instead.",
      },
      {
        type: "fix",
        summary: "Companion popover no longer reappears every time you change pages",
        before: "While not connected, the install nudge could pop up on every profile or page navigation until you tapped a button.",
        after: "The nudge appears at most once per device. If you ignore it and navigate away, it stays away.",
      },
    ],
  },
  {
    version: "1.39.3",
    date: "2026-05-15",
    title: "Companion v0.17.3 — userscript bundle 19% smaller",
    changes: [
      {
        type: "improve",
        summary: "Companion userscript dropped from ~155 KB to ~126 KB on disk and over the wire",
        detail: "Build now ships with whitespace + syntax minification on. Identifier names are kept readable so stack traces in bug reports are still useful. Smaller bundle = faster first paint on torn.com and quicker Tampermonkey self-updates.",
      },
    ],
  },
  {
    version: "1.39.2",
    date: "2026-05-15",
    title: "Companion v0.17.2 — same width fix for stocks and travel cards",
    changes: [
      {
        type: "fix",
        summary: "Stocks and travel cards on Torn now always take the full content width",
        before: "On Torn pages with a flex main container (notably PDA / narrow viewports) the stocks and travel cards could end up squeezed into a thin column with the header text wrapping awkwardly, the same shape as the armoury bug fixed in v0.17.1.",
        after: "Both cards now force their Shadow DOM host to display block + width 100%, and their header rows wrap gracefully on small screens instead of breaking words.",
        cause: "The same Shadow DOM host wasn't pinned to block + full width — the armoury fix wasn't applied to its two siblings.",
      },
    ],
  },
  {
    version: "1.39.1",
    date: "2026-05-15",
    title: "Companion v0.17.1 — armoury card no longer wraps letter-by-letter on mobile",
    changes: [
      {
        type: "fix",
        summary: "Armoury competition card on Torn rendered as three narrow vertical columns on mobile / PDA",
        before: "The card title '🏆 TM Hub Armoury' wrapped one letter-cluster per line, 'Open in TM Hub →' got split across multiple lines, and the competition leaderboard sat in a middle column with the footer hint pushed to a third right-side column.",
        after: "The card always takes the full width of Torn's content area, the title and 'Open in TM Hub →' link stay on one line, and on narrow viewports the link wraps to a new line as a whole instead of getting cut up.",
        cause: "The Shadow DOM host wasn't forced to a block display + full width, so Torn's flex layout on the faction page squeezed the card into a narrow inline column.",
      },
    ],
  },
  {
    version: "1.39.0",
    date: "2026-05-15",
    title: "Companion v0.17 — travel arbitrage card",
    changes: [
      {
        type: "feat",
        summary: "Top-3 most profitable destinations now show inline on Torn's travel agency",
        detail: "Open /travelagency.php and a card with the three best-profit countries appears above the destination picker — best item per destination, abroad cost, sell value, profit per item, one-way travel time. Picks the country for you instead of cross-referencing TM Hub.",
      },
    ],
  },
  {
    version: "1.38.0",
    date: "2026-05-15",
    title: "Companion v0.16 — retal queue intel",
    changes: [
      {
        type: "feat",
        summary: "Retal queue rows on Torn now show TM Hub intel pills",
        detail: "Open /factions.php?step=retals and any attacker we have data on gets a pill: OFF-LIMITS (don't retal them — they're medded out), your saved target tag, and 'spy 12.4M · 3d' if we know their stats. Attackers we have nothing on are left alone.",
      },
    ],
  },
  {
    version: "1.37.1",
    date: "2026-05-15",
    title: "Spy Central — usernames instead of 'Unknown player'",
    changes: [
      {
        type: "fix",
        summary: "Known Stats rows now show the player's name when we have it locally",
        before: "Roughly 85% of Known Stats rows rendered as 'Unknown player' even though we had the player's ID and had attacked or spied them before.",
        after: "Rows now show the real name. New rows pick up the name straight from TornStats, and existing nameless rows are filled in at request time from our attack log, prior spy reports, or saved targets.",
        cause: "The scheduled TornStats faction-spy refresh wrote every report with a NULL name (the TornStats response shape was being read with the wrong field path), so the estimate's name kept getting blanked out.",
      },
    ],
  },
  {
    version: "1.37.0",
    date: "2026-05-15",
    title: "Companion v0.15 — armoury competition card on Torn",
    changes: [
      {
        type: "feat",
        summary: "Active armoury competitions now show inline on Torn's armoury page",
        detail: "Open /factions.php?step=armoury (or step=your&type=1) and you get a card with every active competition, a top-5 mini leaderboard with you highlighted if you've contributed, time-remaining countdown, and a link to TM Hub for the full view.",
      },
      {
        type: "feat",
        summary: "Your rank in the competition shows even if you're outside the top 5",
        detail: "If you've contributed but didn't make the top 5, your row is appended at the bottom with your real rank — so you always know where you stand without opening TM Hub.",
      },
    ],
  },
  {
    version: "1.36.1",
    date: "2026-05-15",
    title: "Companion v0.14.1 — TM Hub pills no longer leak onto the Torn sidebar",
    changes: [
      {
        type: "fix",
        summary: "Hospital and faction-roster pills stopped painting the persistent sidebar Information widget",
        before: "Your own profile link in the left-side Information widget got painted with a green 'TM MATE' pill and tint on every page, because the row decorator walked every profile link on the page including the sidebar.",
        after: "The decorator now only looks at links inside Torn's main container, so the sidebar, header, and other chrome are left alone — pills only appear in the hospital list / faction roster / bounty board where they're meant to.",
        cause: "The row-decorator helper queried the whole document for profile links instead of scoping to the page's main content area.",
      },
    ],
  },
  {
    version: "1.36.0",
    date: "2026-05-15",
    title: "Chat mentions click through to Torn + notify you",
    changes: [
      {
        type: "feat",
        summary: "Every @mention in chat is now a clickable link to that player's Torn profile",
        detail: "Works in the TM Hub web chat and inside the Companion dock on torn.com. Revive Monitor's lists, your own @mentions, and message authors all link through to torn.com/profiles.php in a new tab.",
      },
      {
        type: "feat",
        summary: "You get a notification when someone @-mentions you in chat",
        detail: "Mentions land in the in-app /notifications bell and fire a web push toast (if you've enabled push). New 'Chat mentions' toggle in Settings → Push lets you opt out.",
      },
      {
        type: "improve",
        summary: "Typing @nick without picking from the autocomplete still mentions the person",
        detail: "Used to require clicking the dropdown for the mention to register on the backend. Now the composer scans the message text for @names matching the faction roster and adds them automatically.",
      },
      {
        type: "improve",
        summary: "Companion mention toast lets you jump straight to the author's profile",
        detail: "The author name in the 'X mentioned you' toast is its own link to their Torn profile. Clicking anywhere else on the toast still opens TM Hub chat as before.",
      },
    ],
  },
  {
    version: "1.35.0",
    date: "2026-05-15",
    title: "Companion v0.14 — hospital list intel",
    changes: [
      {
        type: "feat",
        summary: "Hospital list rows on Torn now show TM Hub markers inline",
        detail: "Open /hospitalview.php and any player in your faction (TM mate, green), the current war enemy (red), an OFF-LIMITS flag, or your saved target is called out with a pill — so you scan the page instead of cross-referencing 100 names.",
      },
      {
        type: "feat",
        summary: "Background tint on hospital rows for friend-or-foe at a glance",
        detail: "TM mates get a soft green tint; current war enemies get a soft red tint. Players you have no signal on are left alone so the page is not noisy.",
      },
    ],
  },
  {
    version: "1.34.1",
    date: "2026-05-15",
    title: "Companion v0.13.1 — profile intel layout no longer breaks on narrow columns",
    changes: [
      {
        type: "fix",
        summary: "Profile intel card stopped breaking layout in Torn's narrow profile column and on Torn PDA",
        before: "The card jammed total, pills, stats and action buttons into one row that overflowed past the card edge — buttons spilled onto the right-side Actions panel on desktop and got cut off on Torn PDA.",
        after: "The card now stacks vertically in narrow columns and only switches to a horizontal action row when the card itself is wide enough — independent of browser window width.",
        cause: "The card was reacting to browser width instead of its own column, and reused a style name that another overlay set to a horizontal row.",
      },
    ],
  },
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
