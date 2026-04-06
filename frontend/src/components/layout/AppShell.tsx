"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { AuthGate } from "./AuthGate";
import { ErrorBoundary } from "./ErrorBoundary";
import { Sidebar } from "./Sidebar";
import { AnnouncementCarousel } from "./AnnouncementCarousel";
import { BottomNavBar } from "@/components/nav/BottomNavBar";
import { MobileSearch } from "@/components/nav/MobileSearch";
import { InstallPrompt } from "./InstallPrompt";
import { useAuth } from "@/hooks/useAuth";
import { useAnnouncements } from "@/hooks/useAnnouncements";
import { useVersionNotice } from "@/hooks/useVersionNotice";
import { useChatAccess } from "@/hooks/useChatAccess";
import { api } from "@/lib/api-client";
import { PDAProvider } from '@/contexts/PDAContext';
import { usePDAPolling } from '@/hooks/usePDAPolling';

function ShellContent({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, role } = useAuth();
  const { active, unreadCount, dismiss } = useAnnouncements();
  const { showNotice, currentVersion, latestEntry, dismiss: dismissVersion } = useVersionNotice();
  const [searchOpen, setSearchOpen] = useState(false);
  const { canAccess: canAccessChat } = useChatAccess();
  const [chatUnread, setChatUnread] = useState(0);
  const pathname = usePathname();
  const onChatPage = pathname.startsWith("/chat");

  // Clear badge immediately when navigating to /chat
  useEffect(() => {
    if (onChatPage) setChatUnread(0);
  }, [onChatPage]);

  // Poll chat unread (skip while on /chat — the chat hook handles its own state)
  useEffect(() => {
    if (!canAccessChat || !isLoggedIn || onChatPage) return;
    let cancelled = false;
    const poll = () => {
      api.chatUnread()
        .then((data) => { if (!cancelled) setChatUnread(data.total); })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [canAccessChat, isLoggedIn, onChatPage]);

  // Register service worker for all authenticated users (PWA + push)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js");
    }
  }, []);

  usePDAPolling();

  if (!isLoggedIn) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden lg:block fixed top-0 left-0 w-[200px] h-full z-40">
        <Sidebar unreadCount={unreadCount} chatUnread={chatUnread} showVersionBadge={showNotice} />
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
      <BottomNavBar unreadCount={unreadCount} chatUnread={chatUnread} role={role} showVersionBadge={showNotice} />

      {/* Main content */}
      <main className={`lg:ml-[200px] pt-12 lg:pt-0 pb-20 lg:pb-0 flex flex-col ${
        onChatPage
          ? "h-dvh lg:min-h-screen overflow-hidden"
          : "min-h-screen"
      }`}>
        <AnnouncementCarousel announcements={active} onDismiss={dismiss} />
        {showNotice && latestEntry && (
          <div className="mx-4 mt-2 flex items-center gap-3 bg-torn-green/10 border border-torn-green/30 rounded-lg px-4 py-2.5 text-sm">
            <span className="text-torn-green font-bold shrink-0">New version v{currentVersion}!</span>
            <span className="text-text-secondary truncate">{latestEntry.title}</span>
            <a
              href="/changelog"
              onClick={dismissVersion}
              className="text-torn-green hover:underline font-medium shrink-0 ml-auto"
            >
              See what&apos;s new &rarr;
            </a>
            <button
              onClick={dismissVersion}
              className="text-text-muted hover:text-text-primary transition-colors shrink-0"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
        <ErrorBoundary>
          <div className={onChatPage ? "flex-1 min-h-0 flex flex-col overflow-hidden" : "flex-1"}>
            {children}
          </div>
        </ErrorBoundary>
        {!onChatPage && (
          <footer className="px-4 py-3 text-text-muted text-[10px] text-center border-t border-border">
            TM Hub{" "}
            <a href="/changelog" className="text-torn-green hover:underline">
              v{currentVersion}
            </a>
            {" "}— by{" "}
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
        )}
      </main>
      <InstallPrompt />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <PDAProvider>
      <AuthGate>
        <ShellContent>{children}</ShellContent>
      </AuthGate>
    </PDAProvider>
  );
}
