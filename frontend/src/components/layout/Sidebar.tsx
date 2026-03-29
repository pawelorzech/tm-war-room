"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  disabled?: boolean;
}

interface NavSection {
  title: string;
  dimmed?: boolean;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "FACTION",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "\uD83C\uDFE0" },
      { label: "Our Team", href: "/team", icon: "\uD83D\uDC65" },
      { label: "Enemies", href: "/enemies", icon: "\u2694\uFE0F" },
      { label: "Activity", href: "/activity", icon: "\uD83D\uDFE2" },
      { label: "Stakeout", href: "/stakeout", icon: "\uD83D\uDC41\uFE0F" },
      { label: "Bounties", href: "/bounties", icon: "\uD83D\uDCB5" },
      { label: "Notifications", href: "/notifications", icon: "\uD83D\uDD14" },
    ],
  },
  {
    title: "TRAINING",
    items: [
      { label: "Training Guide", href: "/training", icon: "\uD83D\uDCAA" },
    ],
  },
  {
    title: "TOOLS",
    items: [
      {
        label: "Stat Growth",
        href: "/stats",
        icon: "\uD83D\uDCC8",
      },
      {
        label: "Market",
        href: "/market",
        icon: "\uD83D\uDED2",
      },
      {
        label: "Spy Central",
        href: "/spy",
        icon: "\uD83D\uDD0D",
      },
      {
        label: "Chain Tracker",
        href: "/chain",
        icon: "\uD83D\uDD17",
      },
      {
        label: "Awards",
        href: "/awards",
        icon: "\uD83C\uDFC6",
      },
      {
        label: "Targets",
        href: "/targets",
        icon: "\uD83C\uDFAF",
      },
      {
        label: "NPC Loot",
        href: "/loot",
        icon: "\uD83D\uDCB0",
      },
      {
        label: "Revives",
        href: "/revives",
        icon: "\uD83D\uDC9A",
      },
      {
        label: "Stocks",
        href: "/stocks",
        icon: "\uD83D\uDCC9",
      },
      {
        label: "Travel",
        href: "/travel",
        icon: "\u2708\uFE0F",
      },
      {
        label: "OC Planner",
        href: "/oc",
        icon: "\uD83D\uDD74\uFE0F",
      },
      {
        label: "War Reports",
        href: "/wars",
        icon: "\uD83D\uDCCA",
      },
    ],
  },
];

interface SidebarProps {
  unreadCount?: number;
}

export function Sidebar({ unreadCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const { playerName, playerId, role, logout } = useAuth();
  const { theme, toggle } = useTheme();

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <div className="flex flex-col h-full bg-bg-surface border-r border-border">
      {/* Header / Logo */}
      <div className="p-4 border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
        <h1
          className="text-lg font-extrabold tracking-tight text-torn-green"
          style={{ animation: "tm-glow-pulse 4s ease-in-out infinite" }}
        >
          TM Hub
        </h1>
        <p className="text-[10px] text-text-muted tracking-wide">The Masters [TM]</p>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-3">
            <p
              className={`px-4 py-1 text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${
                section.dimmed ? "text-text-muted" : "text-text-secondary"
              }`}
            >
              {section.title}
            </p>
            <div className="mx-3 border-b border-border-light/50 mb-1" />
            {section.items.map((item) =>
              item.disabled ? (
                <span
                  key={item.href}
                  className="flex items-center gap-2 px-4 py-1.5 text-sm text-text-muted opacity-40 cursor-not-allowed transition-all duration-200"
                >
                  <span>{item.icon}</span>
                  <span className="italic">{item.label}</span>
                  <span className="ml-auto text-[9px] italic font-medium bg-bg-elevated/80 text-text-muted px-1.5 py-0.5 rounded-full">
                    soon
                  </span>
                </span>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-1.5 text-sm transition-all duration-200 ${
                    isActive(item.href)
                      ? "border-l-2 border-torn-green bg-torn-green/10 text-text-primary shadow-[inset_3px_0_8px_-4px_rgba(63,185,80,0.25)]"
                      : "border-l-2 border-transparent hover:bg-bg-elevated hover:text-text-primary hover:border-border text-text-secondary"
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ),
            )}
          </div>
        ))}

        {/* Inbox */}
        <div className="mb-3">
          <Link
            href="/inbox"
            className={`flex items-center gap-2 px-4 py-1.5 text-sm transition-all duration-200 ${
              isActive("/inbox")
                ? "border-l-2 border-torn-green bg-torn-green/10 text-text-primary shadow-[inset_3px_0_8px_-4px_rgba(63,185,80,0.25)]"
                : "border-l-2 border-transparent hover:bg-bg-elevated hover:text-text-primary hover:border-border text-text-secondary"
            }`}
          >
            <span>{"\uD83D\uDCE8"}</span>
            <span>Inbox</span>
            {unreadCount > 0 && (
              <span
                className="ml-auto text-[10px] bg-torn-green/20 text-torn-green px-1.5 py-0.5 rounded-full font-bold shadow-[0_0_8px_-2px_rgba(63,185,80,0.3)]"
                style={{ animation: "tm-badge-pop 2s ease-in-out infinite" }}
              >
                {unreadCount}
              </span>
            )}
          </Link>
        </div>

        {/* Admin */}
        {role && role !== "member" && (
          <div className="mb-3">
            <Link
              href="/admin"
              className={`flex items-center gap-2 px-4 py-1.5 text-sm transition-all duration-200 ${
                isActive("/admin")
                  ? "border-l-2 border-torn-green bg-torn-green/10 text-text-primary shadow-[inset_3px_0_8px_-4px_rgba(63,185,80,0.25)]"
                  : "border-l-2 border-transparent hover:bg-bg-elevated hover:text-text-primary hover:border-border text-text-secondary"
              }`}
            >
              <span>{"\u2699\uFE0F"}</span>
              <span>Admin</span>
            </Link>
          </div>
        )}
      </nav>

      {/* User panel */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 mb-2 group">
          <div className="w-7 h-7 rounded-full bg-torn-green-dim text-white text-xs font-bold flex items-center justify-center ring-2 ring-transparent group-hover:ring-torn-green/40 transition-all duration-200">
            {playerName?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {playerName || "Unknown"}
            </p>
            <p className="text-[10px] text-text-muted">
              [{playerId || "..."}]
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            className="text-xs text-text-secondary hover:text-text-primary transition-all duration-200 px-2 py-1 rounded hover:bg-bg-elevated"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? "\u2600\uFE0F Light" : "\uD83C\uDF19 Dark"}
          </button>
          <button
            onClick={logout}
            className="text-xs text-text-secondary hover:text-torn-red transition-all duration-200 px-2 py-1 rounded hover:bg-bg-elevated ml-auto"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
