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

export const CURRENT_VERSION = "1.10.0";

export const CHANGELOG: ChangelogEntry[] = [
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
