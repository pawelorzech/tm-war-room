"use client";

import { useState } from "react";
import { AuthGate } from "./AuthGate";
import { Sidebar } from "./Sidebar";
import { MobileDrawer } from "./MobileDrawer";
import { AnnouncementCarousel } from "./AnnouncementCarousel";
import { useAuth } from "@/hooks/useAuth";
import { useAnnouncements } from "@/hooks/useAnnouncements";

function ShellContent({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { active, unreadCount, dismiss } = useAnnouncements();

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
        <button
          onClick={() => setDrawerOpen(true)}
          className="text-text-secondary hover:text-text-primary p-1.5 rounded-md hover:bg-bg-elevated transition-all duration-200 active:scale-95"
          aria-label="Open menu"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <span
          className="text-sm font-extrabold tracking-tight text-torn-green"
          style={{ textShadow: "0 0 12px rgba(63, 185, 80, 0.35)" }}
        >
          TM Hub
        </span>
      </div>

      {/* Mobile drawer */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        unreadCount={unreadCount}
      />

      {/* Main content */}
      <main className="lg:ml-[200px] pt-12 lg:pt-0 min-h-screen flex flex-col">
        <AnnouncementCarousel announcements={active} onDismiss={dismiss} />
        <div className="flex-1">{children}</div>
        <footer className="px-4 py-3 text-text-muted text-[10px] text-center border-t border-border">
          TM Hub v1.0.0 — by{" "}
          <a
            href="https://www.torn.com/profiles.php?XID=2362436"
            target="_blank"
            className="text-torn-green hover:underline"
          >
            Bombel [2362436]
          </a>
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
