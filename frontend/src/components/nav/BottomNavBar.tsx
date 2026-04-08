// frontend/src/components/nav/BottomNavBar.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "@/lib/nav-data";
import { BottomSheet } from "./BottomSheet";
import { useChatAccess } from "@/hooks/useChatAccess";
import type { NavGroup } from "@/lib/nav-data";

interface BottomNavBarProps {
  unreadCount?: number;
  chatUnread?: number;
  role?: string | null;
  showVersionBadge?: boolean;
}

type NavTab = {
  id: string;
  label: string;
  icon: string;
  href?: string;
  action?: () => void;
};

export function BottomNavBar({ unreadCount = 0, chatUnread = 0, role, showVersionBadge = false }: BottomNavBarProps) {
  const pathname = usePathname();
  const [activeSheet, setActiveSheet] = useState<NavGroup | null>(null);
  const { canAccess: canAccessChat } = useChatAccess();

  // Main groups shown as direct tabs
  const mainGroups = NAV_GROUPS.filter((g) =>
    ["warfare", "economy", "faction"].includes(g.id),
  );

  // Smaller groups folded into "More"
  const foldedGroups = NAV_GROUPS.filter((g) =>
    ["training", "resources"].includes(g.id),
  );

  const moreItems = [
    ...foldedGroups.flatMap((g) => g.items),
    { label: "Inbox", href: "/inbox", icon: "📨" },
    ...(role && role !== "member"
      ? [{ label: "Admin", href: "/admin", icon: "⚙️" }]
      : []),
  ];

  const moreGroup: NavGroup = {
    id: "more",
    label: "More",
    icon: "•••",
    items: moreItems,
  };

  const chatTab: NavTab[] = canAccessChat
    ? [
        {
          id: "chat",
          label: "Chat",
          icon: "💬",
          href: "/chat",
        },
      ]
    : [];

  const tabs: NavTab[] = [
    {
      id: "home",
      label: "Home",
      icon: "🏠",
      href: "/dashboard",
    },
    ...mainGroups.map((g) => ({
      id: g.id,
      label: g.label,
      icon: g.icon,
      action: () => setActiveSheet((prev) => (prev?.id === g.id ? null : g)),
    })),
    ...chatTab,
    {
      id: "more",
      label: "More",
      icon: "•••",
      action: () =>
        setActiveSheet((prev) => (prev?.id === "more" ? null : moreGroup)),
    },
  ];

  function isTabActive(tabId: string): boolean {
    if (tabId === "home") return pathname.startsWith("/dashboard");
    if (tabId === "chat") return pathname.startsWith("/chat");
    if (tabId === "more") {
      return moreGroup.items.some((item) => pathname.startsWith(item.href));
    }
    const group = NAV_GROUPS.find((g) => g.id === tabId);
    return group?.items.some((item) => pathname.startsWith(item.href)) ?? false;
  }

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t border-border bg-bg-surface/95 backdrop-blur-md keyboard-open-chat-hide">
        <div className="flex">
          {tabs.map((tab) => {
            const active = isTabActive(tab.id);
            const content = (
              <>
                <span className="text-lg leading-none">{tab.icon}</span>
                <span className="text-[10px] font-medium">{tab.label}</span>
                {tab.id === "more" && unreadCount > 0 && (
                  <span
                    className="absolute top-1 right-1/4 min-w-[14px] h-3.5 flex items-center justify-center text-[8px] bg-torn-green/20 text-torn-green px-1 rounded-full font-bold"
                    style={{ animation: "tm-badge-pop 2s ease-in-out infinite" }}
                  >
                    {unreadCount}
                  </span>
                )}
                {tab.id === "chat" && chatUnread > 0 && (
                  <span
                    className="absolute top-1 right-1/4 min-w-[14px] h-3.5 flex items-center justify-center text-[8px] bg-torn-green text-white px-1 rounded-full font-bold"
                    style={{ animation: "tm-badge-pop 2s ease-in-out infinite" }}
                  >
                    {chatUnread > 99 ? "99+" : chatUnread}
                  </span>
                )}
              </>
            );
            const className = `flex-1 flex flex-col items-center gap-0.5 py-2 pt-2.5 transition-colors duration-200 relative ${
              active ? "text-torn-green" : "text-text-muted"
            }`;

            if (tab.href) {
              return (
                <Link key={tab.id} href={tab.href} className={className}>
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={tab.id}
                onClick={tab.action}
                className={className}
                type="button"
              >
                {content}
              </button>
            );
          })}
        </div>
        {/* Safe area padding for iPhones with home indicator */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>

      <BottomSheet group={activeSheet} onClose={() => setActiveSheet(null)} showVersionBadge={showVersionBadge} />
    </>
  );
}
