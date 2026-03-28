"use client";

import { useState, useEffect } from "react";
import { AuthGate } from "./AuthGate";
import { Sidebar } from "./Sidebar";
import { MobileDrawer } from "./MobileDrawer";
import { api } from "@/lib/api-client";
import { useAuth } from "@/hooks/useAuth";

function ShellContent({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isLoggedIn) return;
    api
      .announcements()
      .then((data) => setUnreadCount(data.announcements.length))
      .catch(() => {});
  }, [isLoggedIn]);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden lg:block fixed top-0 left-0 w-[200px] h-full z-40">
        <Sidebar unreadCount={unreadCount} />
      </div>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-12 bg-bg-surface border-b border-border z-40 flex items-center px-3 gap-3">
        <button
          onClick={() => setDrawerOpen(true)}
          className="text-text-secondary hover:text-text-primary p-1"
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
        <span className="text-sm font-bold text-torn-green">TM Hub</span>
      </div>

      {/* Mobile drawer */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        unreadCount={unreadCount}
      />

      {/* Main content */}
      <main className="lg:ml-[200px] pt-12 lg:pt-0">{children}</main>
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
