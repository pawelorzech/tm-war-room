"use client";

import { useState } from "react";
import { AuthGate } from "./AuthGate";
import { ErrorBoundary } from "./ErrorBoundary";
import { Sidebar } from "./Sidebar";
import { AnnouncementCarousel } from "./AnnouncementCarousel";
import { BottomNavBar } from "@/components/nav/BottomNavBar";
import { MobileSearch } from "@/components/nav/MobileSearch";
import { useAuth } from "@/hooks/useAuth";
import { useAnnouncements } from "@/hooks/useAnnouncements";

function ShellContent({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, role } = useAuth();
  const { active, unreadCount, dismiss } = useAnnouncements();
  const [searchOpen, setSearchOpen] = useState(false);

  if (!isLoggedIn) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden lg:block fixed top-0 left-0 w-[200px] h-full z-40">
        <Sidebar unreadCount={unreadCount} />
      </div>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-12 bg-bg-surface/80 backdrop-blur-md border-b border-border z-40 flex items-center px-3 gap-3">
        <span
          className="text-sm font-extrabold tracking-tight text-torn-green"
          style={{ textShadow: "0 0 12px rgba(63, 185, 80, 0.35)" }}
        >
          TM Hub
        </span>
        <div className="flex-1" />
        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="text-text-secondary hover:text-text-primary p-1.5 rounded-md hover:bg-bg-elevated transition-all duration-200"
          aria-label="Search"
        >
          <span className="text-base">🔍</span>
        </button>
        {/* Inbox */}
        <a
          href="/inbox"
          className="relative text-text-secondary hover:text-text-primary p-1.5 rounded-md hover:bg-bg-elevated transition-all duration-200"
        >
          <span className="text-base">📨</span>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 flex items-center justify-center text-[8px] bg-torn-green/20 text-torn-green px-1 rounded-full font-bold">
              {unreadCount}
            </span>
          )}
        </a>
      </div>

      {/* Mobile search overlay */}
      <MobileSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Mobile bottom nav */}
      <BottomNavBar unreadCount={unreadCount} role={role} />

      {/* Main content */}
      <main className="lg:ml-[200px] pt-12 lg:pt-0 pb-20 lg:pb-0 min-h-screen flex flex-col">
        <AnnouncementCarousel announcements={active} onDismiss={dismiss} />
        <ErrorBoundary>
          <div className="flex-1">{children}</div>
        </ErrorBoundary>
        <footer className="px-4 py-3 text-text-muted text-[10px] text-center border-t border-border">
          TM Hub v1.0.0 — by{" "}
          <a
            href="https://www.torn.com/profiles.php?XID=2362436"
            target="_blank"
            className="text-torn-green hover:underline"
          >
            Bombel [2362436]
          </a>
          {role && role !== "member" && (
            <>
              {" · "}
              <a
                href="https://analityka.tri.ovh"
                target="_blank"
                className="text-torn-blue hover:underline"
              >
                Analytics
              </a>
            </>
          )}
        </footer>
      </main>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <ShellContent>{children}</ShellContent>
    </AuthGate>
  );
}
