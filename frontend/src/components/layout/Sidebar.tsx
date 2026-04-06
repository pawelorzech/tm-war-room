// frontend/src/components/layout/Sidebar.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useChatAccess } from "@/hooks/useChatAccess";
import { useTheme } from "@/hooks/useTheme";
import { usePinnedNav } from "@/hooks/usePinnedNav";
import { NAV_GROUPS } from "@/lib/nav-data";
import { CollapsibleGroup } from "@/components/nav/CollapsibleGroup";
import { ContextMenu } from "@/components/nav/ContextMenu";
import { SearchBar } from "@/components/nav/SearchBar";
import { CommandPalette } from "@/components/nav/CommandPalette";
import { InboxBadge } from "@/components/nav/InboxBadge";

interface SidebarProps {
  unreadCount?: number;
  chatUnread?: number;
  showVersionBadge?: boolean;
}

interface MenuState {
  x: number;
  y: number;
  href: string;
}

export function Sidebar({ unreadCount = 0, chatUnread = 0, showVersionBadge = false }: SidebarProps) {
  const pathname = usePathname();
  const { playerName, playerId, role, logout } = useAuth();
  const { canAccess: canAccessChat } = useChatAccess();
  const { theme, toggle } = useTheme();
  const { pinnedItems, pin, unpin, isPinned, isFull } = usePinnedNav();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const isActive = (href: string) => pathname.startsWith(href);

  // Global Cmd+K to open palette
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const closePalette = useCallback(() => setPaletteOpen(false), []);

  return (
    <>
      <div className="flex flex-col h-full bg-bg-surface border-r border-border">
        {/* Header */}
        <div className="p-4 pb-3 border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between mb-2">
            <Link href="/dashboard">
              <h1
                className="text-lg font-extrabold tracking-tight text-torn-green"
                style={{ animation: "tm-glow-pulse 4s ease-in-out infinite" }}
              >
                TM Hub
              </h1>
              <p className="text-[10px] text-text-muted tracking-wide">
                The Masters [TM]
              </p>
            </Link>
            <InboxBadge unreadCount={unreadCount} />
          </div>
          <SearchBar onOpen={() => setPaletteOpen(true)} />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3">
          {/* Pinned items */}
          <div className="mb-2">
            <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-0.5">
              Pinned
            </p>
            <div className="mx-3 border-b border-border-light/50 mb-1" />
            {pinnedItems.length === 0 && (
              <p className="px-4 py-2 text-[11px] text-text-muted italic">
                Right-click any item to pin it here
              </p>
            )}
            {pinnedItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, href: item.href });
                }}
                className={`group/pin flex items-center gap-2 px-4 py-1.5 text-sm transition-all duration-200 ${
                  isActive(item.href)
                    ? "border-l-2 border-torn-green bg-torn-green/10 text-text-primary shadow-[inset_3px_0_8px_-4px_rgba(63,185,80,0.25)]"
                    : "border-l-2 border-transparent hover:bg-bg-elevated hover:text-text-primary hover:border-border text-text-secondary"
                }`}
              >
                <span>{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    unpin(item.href);
                  }}
                  className="text-[10px] opacity-0 group-hover/pin:opacity-40 hover:!opacity-70 transition-opacity duration-150"
                  title="Unpin"
                >
                  📌
                </button>
              </Link>
            ))}
          </div>

          {/* Chat — prominent, above groups */}
          {canAccessChat && (
            <div className="mb-2">
              <div className="mx-3 border-b border-border-light/50 mb-1" />
              <Link
                href="/chat"
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  isActive("/chat")
                    ? "border-l-2 border-torn-green bg-torn-green/10 text-torn-green shadow-[inset_3px_0_8px_-4px_rgba(63,185,80,0.25)]"
                    : "border-l-2 border-torn-green/40 hover:bg-torn-green/5 hover:text-torn-green text-text-primary"
                }`}
              >
                <span className="text-base">💬</span>
                <span>Faction Chat</span>
                {chatUnread > 0 && (
                  <span
                    className="ml-auto min-w-[20px] h-5 flex items-center justify-center text-[10px] bg-torn-green text-white px-1.5 rounded-full font-bold"
                    style={{ animation: "tm-badge-pop 2s ease-in-out infinite" }}
                  >
                    {chatUnread > 99 ? "99+" : chatUnread}
                  </span>
                )}
              </Link>
            </div>
          )}

          {/* Collapsible groups */}
          {NAV_GROUPS.map((group) => (
            <CollapsibleGroup
              key={group.id}
              group={group}
              isPinned={isPinned}
              isFull={isFull}
              onPin={pin}
              onUnpin={unpin}
              showVersionBadge={group.id === "resources" && showVersionBadge}
            />
          ))}

          {/* Admin */}
          {role && role !== "member" && (
            <div className="mt-2">
              <Link
                href="/admin"
                className={`flex items-center gap-2 px-4 py-1.5 text-sm transition-all duration-200 ${
                  isActive("/admin")
                    ? "border-l-2 border-torn-green bg-torn-green/10 text-text-primary shadow-[inset_3px_0_8px_-4px_rgba(63,185,80,0.25)]"
                    : "border-l-2 border-transparent hover:bg-bg-elevated hover:text-text-primary hover:border-border text-text-secondary"
                }`}
              >
                <span>⚙️</span>
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
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
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

      {/* Context menu for pinned items */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          isPinned={isPinned(menu.href)}
          isFull={isFull()}
          onPin={() => pin(menu.href)}
          onUnpin={() => unpin(menu.href)}
          onClose={() => setMenu(null)}
        />
      )}

      {/* Command palette portal */}
      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </>
  );
}
