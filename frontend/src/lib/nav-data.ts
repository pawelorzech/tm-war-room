// frontend/src/lib/nav-data.ts

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: string;
  items: NavItem[];
}

/** Default pinned hrefs for new users */
export const DEFAULT_PINNED_HREFS: string[] = [
  "/dashboard",
  "/team",
  "/chain",
];

export const MAX_PINNED = 8;

export const DASHBOARD_ITEM: NavItem = {
  label: "Dashboard",
  href: "/dashboard",
  icon: "🏠",
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "warfare",
    label: "Warfare",
    icon: "⚔️",
    items: [
      { label: "Enemies", href: "/enemies", icon: "⚔️" },
      { label: "Targets", href: "/targets", icon: "🎯" },
      { label: "Stakeout", href: "/stakeout", icon: "👁️" },
      { label: "Spy Central", href: "/spy", icon: "🔍" },
      { label: "Compare", href: "/compare", icon: "⚖️" },
      { label: "Bounties", href: "/bounties", icon: "💵" },
      { label: "War Reports", href: "/wars", icon: "📊" },
      { label: "Chain Tracker", href: "/chain", icon: "🔗" },
    ],
  },
  {
    id: "economy",
    label: "Economy",
    icon: "💰",
    items: [
      { label: "Market", href: "/market", icon: "🛒" },
      { label: "Stocks", href: "/stocks", icon: "📉" },
      { label: "NPC Loot", href: "/loot", icon: "💰" },
      { label: "Revives", href: "/revives", icon: "💚" },
      { label: "Travel", href: "/travel", icon: "✈️" },
      { label: "Companies", href: "/company", icon: "🏢" },
      { label: "Director", href: "/company/director", icon: "💼" },
    ],
  },
  {
    id: "faction",
    label: "Faction",
    icon: "👥",
    items: [
      { label: "Our Team", href: "/team", icon: "👥" },
      { label: "Activity", href: "/activity", icon: "🟢" },
      { label: "OC Planner", href: "/oc", icon: "🕴️" },
      { label: "Armoury", href: "/armoury", icon: "🛡️" },
      { label: "Analytics", href: "/analytics", icon: "📈" },
      { label: "Notifications", href: "/notifications", icon: "🔔" },
      { label: "Settings", href: "/settings", icon: "⚙️" },
    ],
  },
  {
    id: "training",
    label: "Training",
    icon: "💪",
    items: [
      { label: "Training Guide", href: "/training", icon: "💪" },
      { label: "Stat Growth", href: "/stats", icon: "📈" },
      { label: "Awards", href: "/awards", icon: "🏆" },
    ],
  },
  {
    id: "resources",
    label: "Resources",
    icon: "📚",
    items: [
      { label: "Member Guide", href: "/guide", icon: "📖" },
      { label: "Userscripts", href: "/scripts", icon: "🔧" },
      { label: "FAQ", href: "/faq", icon: "❓" },
      { label: "Changelog", href: "/changelog", icon: "📋" },
    ],
  },
];

/** All nav items flattened and deduplicated by href — used by search/command palette */
export const ALL_NAV_ITEMS: NavItem[] = (() => {
  const seen = new Set<string>();
  const items: NavItem[] = [DASHBOARD_ITEM];
  seen.add(DASHBOARD_ITEM.href);
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (!seen.has(item.href)) {
        seen.add(item.href);
        items.push(item);
      }
    }
  }
  return items;
})();

/** Find which group a path belongs to */
export function findGroupForPath(pathname: string): string | null {
  for (const group of NAV_GROUPS) {
    if (group.items.some((item) => pathname.startsWith(item.href))) {
      return group.id;
    }
  }
  return null;
}

/** All nav item hrefs, used for "most specific match wins" active-state logic */
export const ALL_NAV_HREFS: string[] = ALL_NAV_ITEMS.map((i) => i.href);

/**
 * Is this nav item "active" for the current pathname?
 * True when:
 *   - pathname equals itemHref (exact match), OR
 *   - pathname is a descendant of itemHref (pathname.startsWith(itemHref + "/"))
 *     AND no OTHER nav item is a more specific match for that pathname.
 *
 * Prevents `/company` from staying lit when viewing `/company/director`
 * (where `/company/director` is itself a separate nav item).
 */
export function isNavItemActive(
  pathname: string,
  itemHref: string,
  allHrefs: string[] = ALL_NAV_HREFS,
): boolean {
  if (pathname === itemHref) return true;
  if (!pathname.startsWith(`${itemHref}/`)) return false;
  // descendant match — only valid if no longer nav item also matches
  for (const other of allHrefs) {
    if (other === itemHref) continue;
    if (other.length <= itemHref.length) continue;
    if (pathname === other || pathname.startsWith(`${other}/`)) {
      return false;
    }
  }
  return true;
}

/** Simple fuzzy match — checks if all query chars appear in order in the target */
export function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

/** Search nav items with fuzzy matching, return with group labels */
export function searchNavItems(
  query: string,
): Array<NavItem & { group: string }> {
  if (!query.trim()) return [];
  const results: Array<NavItem & { group: string }> = [];
  const seen = new Set<string>();
  // Include dashboard
  if (fuzzyMatch(query, DASHBOARD_ITEM.label)) {
    results.push({ ...DASHBOARD_ITEM, group: "Home" });
    seen.add(DASHBOARD_ITEM.href);
  }
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (!seen.has(item.href) && fuzzyMatch(query, item.label)) {
        seen.add(item.href);
        results.push({ ...item, group: group.label });
      }
    }
  }
  return results;
}
