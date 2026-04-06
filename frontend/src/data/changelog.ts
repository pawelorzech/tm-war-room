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

export const CURRENT_VERSION = "1.2.0";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.2.0",
    date: "2026-04-06",
    title: "Aplikacja PWA",
    changes: [
      { type: "feat", text: "TM Hub działa teraz jako PWA — dodaj do ekranu głównego jak natywną apkę" },
      { type: "feat", text: "Nowa ikona neon-glow TM" },
      { type: "feat", text: "Tryb offline z ładną stroną gdy brak połączenia" },
      { type: "feat", text: "Inteligentny install prompt — rozpoznaje Android i iOS" },
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
