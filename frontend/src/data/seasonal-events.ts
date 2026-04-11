// frontend/src/data/seasonal-events.ts

export interface SeasonalEvent {
  id: string;
  name: string;
  icon: string;
  /** 1-12 */
  startMonth: number;
  startDay: number;
  /** 1-12 */
  endMonth: number;
  endDay: number;
  /** Tailwind border-color class for the left accent */
  color: string;
  tips: string[];
}

export const SEASONAL_EVENTS: SeasonalEvent[] = [
  {
    id: "museum-day",
    name: "Museum Day",
    icon: "\uD83C\uDFDB\uFE0F", // 🏛️
    startMonth: 3,
    startDay: 1,
    endMonth: 3,
    endDay: 7,
    color: "border-l-blue-400",
    tips: [
      "Museum Day is coming! Build flower sets (11 flowers) and plushie sets (13 plushies) for profit",
      "Buy flowers/plushies when demand is low, sell sets when Museum Day drives up prices",
      "You need History Bachelor education to exchange sets at the museum",
      "Check YATA (yata.yt/bazaar/sets) for set prices and profit calculations",
    ],
  },
  {
    id: "easter",
    name: "Easter Egg Hunt",
    icon: "\uD83E\uDD5A", // 🥚
    startMonth: 4,
    startDay: 10,
    endMonth: 4,
    endDay: 22,
    color: "border-l-green-400",
    tips: [
      "Easter Egg Hunt is active! Eggs spawn on every page in Torn \u2014 visit all pages to collect them",
      "Run through all Torn pages every 12\u201324 hours for best egg collection",
      "Install Egg Navigator + Egg Finder userscripts via Tampermonkey for easy mode",
      "Eggs don\u2019t disappear from pages anymore \u2014 pick them up anytime during the event",
      "Last day is pickup only \u2014 no new eggs spawn. Do a final run the day before!",
    ],
  },
  {
    id: "elimination",
    name: "Elimination",
    icon: "\uD83C\uDFAF", // 🎯
    startMonth: 7,
    startDay: 1,
    endMonth: 7,
    endDay: 21,
    color: "border-l-red-400",
    tips: [
      "Elimination is live! Stock up on cans and boosters before prices spike",
      "Token shop merits are available during Elimination \u2014 check which ones you\u2019re missing",
      "Coordinate with faction for team strategies \u2014 Elimination rewards teamwork",
    ],
  },
  {
    id: "halloween",
    name: "Halloween",
    icon: "\uD83C\uDF83", // 🎃
    startMonth: 10,
    startDay: 25,
    endMonth: 11,
    endDay: 5,
    color: "border-l-orange-400",
    tips: [
      "Halloween event is active! Check the city for trick-or-treat locations",
      "Halloween items can be valuable \u2014 check Item Market before using or selling",
      "Some Halloween awards are limited-time \u2014 check your awards page for event-specific ones",
    ],
  },
  {
    id: "christmas",
    name: "Christmas Town",
    icon: "\uD83C\uDF84", // 🎄
    startMonth: 12,
    startDay: 15,
    endMonth: 1,
    endDay: 2,
    color: "border-l-red-400",
    tips: [
      "Christmas Town is open! Visit it daily for rewards and seasonal content",
      "Scrooge NPC appears during Christmas \u2014 coordinate with faction for NPC loot runs",
      "Christmas crackers and presents can contain valuable items \u2014 don\u2019t sell without checking prices",
    ],
  },
];

/**
 * Returns the currently active seasonal event, or null if none.
 * Handles cross-year events (e.g. Christmas Dec 15 \u2013 Jan 2).
 */
export function getActiveEvent(now: Date = new Date()): SeasonalEvent | null {
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();

  for (const event of SEASONAL_EVENTS) {
    const { startMonth, startDay, endMonth, endDay } = event;
    const afterStart = month > startMonth || (month === startMonth && day >= startDay);
    const beforeEnd = month < endMonth || (month === endMonth && day <= endDay);

    if (startMonth <= endMonth) {
      // Same-year range (e.g. April 10 – April 22)
      if (afterStart && beforeEnd) return event;
    } else {
      // Cross-year range (e.g. December 15 – January 2)
      if (afterStart || beforeEnd) return event;
    }
  }

  return null;
}
