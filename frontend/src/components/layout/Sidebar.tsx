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
    title: "WAR",
    items: [{ label: "War Room", href: "/war", icon: "\u2694\uFE0F" }],
  },
  {
    title: "TRAINING",
    items: [
      { label: "Training Guide", href: "/training", icon: "\uD83D\uDCAA" },
    ],
  },
  {
    title: "TOOLS (coming)",
    dimmed: true,
    items: [
      {
        label: "Spy Central",
        href: "/spy",
        icon: "\uD83D\uDD0D",
        disabled: true,
      },
      {
        label: "Chain Tracker",
        href: "/chain",
        icon: "\uD83D\uDD17",
        disabled: true,
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
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-bold text-torn-green">TM Hub</h1>
        <p className="text-xs text-text-muted">The Masters [TM]</p>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-2">
            <p
              className={`px-4 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                section.dimmed ? "text-text-muted" : "text-text-secondary"
              }`}
            >
              {section.title}
            </p>
            {section.items.map((item) =>
              item.disabled ? (
                <span
                  key={item.href}
                  className="flex items-center gap-2 px-4 py-1.5 text-sm text-text-muted opacity-40 cursor-not-allowed"
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                  <span className="ml-auto text-[10px] bg-bg-elevated px-1.5 py-0.5 rounded">
                    soon
                  </span>
                </span>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-1.5 text-sm transition-colors ${
                    isActive(item.href)
                      ? "border-l-2 border-torn-green bg-torn-green/10 text-text-primary"
                      : "border-l-2 border-transparent hover:bg-bg-elevated hover:text-text-primary text-text-secondary"
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
        <div className="mb-2">
          <Link
            href="/inbox"
            className={`flex items-center gap-2 px-4 py-1.5 text-sm transition-colors ${
              isActive("/inbox")
                ? "border-l-2 border-torn-green bg-torn-green/10 text-text-primary"
                : "border-l-2 border-transparent hover:bg-bg-elevated hover:text-text-primary text-text-secondary"
            }`}
          >
            <span>{"\uD83D\uDCE8"}</span>
            <span>Inbox</span>
            {unreadCount > 0 && (
              <span className="ml-auto text-[10px] bg-torn-green/20 text-torn-green px-1.5 py-0.5 rounded-full font-medium">
                {unreadCount}
              </span>
            )}
          </Link>
        </div>

        {/* Admin */}
        {role && role !== "member" && (
          <div className="mb-2">
            <Link
              href="/admin"
              className={`flex items-center gap-2 px-4 py-1.5 text-sm transition-colors ${
                isActive("/admin")
                  ? "border-l-2 border-torn-green bg-torn-green/10 text-text-primary"
                  : "border-l-2 border-transparent hover:bg-bg-elevated hover:text-text-primary text-text-secondary"
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
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-torn-green-dim text-white text-xs font-bold flex items-center justify-center">
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
            className="text-xs text-text-secondary hover:text-text-primary transition-colors px-2 py-1 rounded hover:bg-bg-elevated"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? "\u2600\uFE0F Light" : "\uD83C\uDF19 Dark"}
          </button>
          <button
            onClick={logout}
            className="text-xs text-text-secondary hover:text-torn-red transition-colors px-2 py-1 rounded hover:bg-bg-elevated ml-auto"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
