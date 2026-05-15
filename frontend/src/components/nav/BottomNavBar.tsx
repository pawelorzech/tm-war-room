// frontend/src/components/nav/BottomNavBar.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useChatAccess } from "@/hooks/useChatAccess";
import { usePinnedNav } from "@/hooks/usePinnedNav";
import { isNavItemActive } from "@/lib/nav-data";
import { BrowseSheet } from "./BrowseSheet";
import { AppIcon } from "@/components/ui/AppIcon";

interface BottomNavBarProps {
  unreadCount?: number;
  chatUnread?: number;
  showVersionBadge?: boolean;
}

export function BottomNavBar({ unreadCount = 0, chatUnread = 0, showVersionBadge = false }: BottomNavBarProps) {
  const pathname = usePathname();
  const { canAccess: canAccessChat } = useChatAccess();
  const { pinnedItems, pin, unpin, isPinned, isFull } = usePinnedNav();
  const [browseOpen, setBrowseOpen] = useState(false);

  // Favorite slots: first 2 pins (or 3 if no chat), excluding /dashboard (Home tab covers it)
  const favSlotCount = canAccessChat ? 2 : 3;
  const favSlots = pinnedItems
    .filter(item => item.href !== "/dashboard" && item.href !== "/chat")
    .slice(0, favSlotCount);

  const isActive = (href: string) => isNavItemActive(pathname, href);

  const tabClass = (active: boolean) =>
    `flex-1 flex flex-col items-center gap-0.5 py-2 pt-2.5 transition-colors duration-200 relative ${
      active ? "text-torn-green" : "text-text-muted"
    }`;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t border-border bg-bg-surface/95 backdrop-blur-md keyboard-open-chat-hide">
        <div className="flex">
          {/* Home — always first */}
          <Link href="/dashboard" className={tabClass(isActive("/dashboard"))}>
            <AppIcon name="home" size={19} />
            <span className="text-[10px] font-medium">Home</span>
          </Link>

          {/* Favorite slots */}
          {favSlots.map((item) => (
            <Link key={item.href} href={item.href} className={tabClass(isActive(item.href))}>
              <span className="absolute top-1 right-1/4 text-[7px] text-torn-yellow leading-none">{"\u2605"}</span>
              <AppIcon name={item.icon} size={19} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          ))}

          {/* Empty fav slots (if not enough pins) */}
          {Array.from({ length: favSlotCount - favSlots.length }).map((_, i) => (
            <button
              key={`empty-${i}`}
              onClick={() => setBrowseOpen(true)}
              className={tabClass(false)}
              type="button"
            >
              <AppIcon name="star" size={19} className="opacity-30" />
              <span className="text-[10px] font-medium opacity-50">Pin</span>
            </button>
          ))}

          {/* Chat — if accessible */}
          {canAccessChat && (
            <Link href="/chat" className={tabClass(isActive("/chat"))}>
              {chatUnread > 0 && (
                <span
                  className="absolute top-1 right-1/4 min-w-[14px] h-3.5 flex items-center justify-center text-[8px] bg-torn-green text-white px-1 rounded-full font-bold"
                  style={{ animation: "tm-badge-pop 2s ease-in-out infinite" }}
                >
                  {chatUnread > 99 ? "99+" : chatUnread}
                </span>
              )}
              <AppIcon name="chat" size={19} />
              <span className="text-[10px] font-medium">Chat</span>
            </Link>
          )}

          {/* Browse — always last */}
          <button
            onClick={() => setBrowseOpen(prev => !prev)}
            className={tabClass(browseOpen)}
            type="button"
          >
            {unreadCount > 0 && (
              <span
                className="absolute top-1 right-1/4 min-w-[14px] h-3.5 flex items-center justify-center text-[8px] bg-torn-green/20 text-torn-green px-1 rounded-full font-bold"
                style={{ animation: "tm-badge-pop 2s ease-in-out infinite" }}
              >
                {unreadCount}
              </span>
            )}
            <AppIcon name="browse" size={19} />
            <span className="text-[10px] font-medium">Browse</span>
          </button>
        </div>
        {/* Safe area padding for iPhones with home indicator */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>

      <BrowseSheet
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        isPinned={isPinned}
        isFull={isFull}
        onPin={pin}
        onUnpin={unpin}
        showVersionBadge={showVersionBadge}
      />
    </>
  );
}
