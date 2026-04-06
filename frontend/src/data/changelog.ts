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

export const CURRENT_VERSION = "1.4.1";

export const CHANGELOG: ChangelogEntry[] = [
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
