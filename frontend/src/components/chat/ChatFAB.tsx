"use client";

import { useRouter, usePathname } from "next/navigation";

interface ChatFABProps {
  unread: number;
}

export function ChatFAB({ unread }: ChatFABProps) {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname.startsWith("/chat")) return null;

  return (
    <button
      onClick={() => router.push("/chat")}
      className="fixed z-50 right-6 bottom-6 lg:right-8 lg:bottom-8 max-lg:bottom-20 w-12 h-12 rounded-full bg-torn-green text-white shadow-lg shadow-torn-green/25 hover:shadow-torn-green/40 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
      aria-label="Open faction chat"
    >
      <span className="text-xl">💬</span>
      {unread > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center text-[10px] bg-white text-torn-green px-1 rounded-full font-bold shadow-sm"
          style={{ animation: "tm-badge-pop 2s ease-in-out infinite" }}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
      {unread > 0 && (
        <span className="absolute inset-0 rounded-full bg-torn-green animate-ping opacity-20 pointer-events-none" />
      )}
    </button>
  );
}
