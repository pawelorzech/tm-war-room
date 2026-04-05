// frontend/src/components/nav/InboxBadge.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface InboxBadgeProps {
  unreadCount: number;
}

export function InboxBadge({ unreadCount }: InboxBadgeProps) {
  const pathname = usePathname();
  const active = pathname.startsWith("/inbox");

  return (
    <Link
      href="/inbox"
      className={`relative flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 ${
        active
          ? "bg-torn-green/10 text-torn-green"
          : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
      }`}
      title="Inbox"
    >
      <span className="text-base">📨</span>
      {unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center text-[9px] bg-torn-green/20 text-torn-green px-1 rounded-full font-bold shadow-[0_0_8px_-2px_rgba(63,185,80,0.3)]"
          style={{ animation: "tm-badge-pop 2s ease-in-out infinite" }}
        >
          {unreadCount}
        </span>
      )}
    </Link>
  );
}
