"use client";

import { useRef, useEffect, useLayoutEffect } from "react";
import type { Message } from "@/types/chat";
import { MessageBubble } from "./MessageBubble";

interface Props {
  messages: Message[];
  loading: boolean;
  loadingOlder?: boolean;
  hasMoreOlder?: boolean;
  playerId: number;
  isAdmin: boolean;
  onLoadOlder: () => void;
  onMessageDeleted?: (id: number) => void;
  typingNames: string[];
  memberMap?: Record<number, string>;
  adminIds?: Set<number>;
}

function formatDateSeparator(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today.getTime() - msgDay.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export function MessageList({
  messages,
  loading,
  loadingOlder = false,
  hasMoreOlder = true,
  playerId,
  isAdmin,
  onLoadOlder,
  onMessageDeleted,
  typingNames,
  memberMap = {},
  adminIds,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);
  const prevLenRef = useRef(0);
  const prependSnapshotRef = useRef<{ height: number; scrollTop: number; firstId: number | null } | null>(null);
  const loadingOlderRef = useRef(loadingOlder);
  loadingOlderRef.current = loadingOlder;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !loadingOlder) return;
    prependSnapshotRef.current = {
      height: el.scrollHeight,
      scrollTop: el.scrollTop,
      firstId: messages[0]?.id ?? null,
    };
  }, [loadingOlder, messages]);

  useEffect(() => {
    const el = containerRef.current;
    const snapshot = prependSnapshotRef.current;
    if (!el || !snapshot || loadingOlder) return;

    if (messages[0]?.id !== snapshot.firstId) {
      el.scrollTop = snapshot.scrollTop + (el.scrollHeight - snapshot.height);
    }
    prependSnapshotRef.current = null;
  }, [loadingOlder, messages]);

  useLayoutEffect(() => {
    if (messages.length === 0) {
      prevLenRef.current = 0;
      return;
    }
    const wasEmpty = prevLenRef.current === 0;
    prevLenRef.current = messages.length;

    if (wasEmpty) {
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      return;
    }
    if (wasAtBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Re-pin only when user is at bottom and no prepend is in flight.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let rafPending = false;
    const ro = new ResizeObserver(() => {
      if (rafPending) return;
      if (!wasAtBottom.current) return;
      if (prependSnapshotRef.current !== null) return;
      if (loadingOlderRef.current) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const node = containerRef.current;
        if (!node) return;
        node.scrollTop = node.scrollHeight;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    wasAtBottom.current = atBottom;
    // Load older when scrolled to top
    if (el.scrollTop < 50 && messages.length > 0 && hasMoreOlder && !loadingOlder) {
      onLoadOlder();
    }
  };

  // Group messages by date AND by author proximity.
  // Two consecutive messages from the same author within GROUP_WINDOW seconds
  // collapse: only the first shows avatar + nick + timestamp.
  const GROUP_WINDOW = 5 * 60; // 5 minutes
  let lastDate = "";

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto min-h-0 overscroll-contain touch-pan-y"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="text-text-muted text-sm">Loading messages...</div>
        </div>
      )}

      {!loading && messages.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <div className="text-text-muted text-sm">No messages yet. Start the conversation!</div>
        </div>
      )}

      <div className="py-2">
        {loadingOlder && (
          <div className="px-3 pb-2 text-center text-xs text-text-muted">Loading older messages...</div>
        )}
        {messages.map((msg, i) => {
          const msgDate = formatDateSeparator(msg.created_at);
          const showSeparator = msgDate !== lastDate;
          lastDate = msgDate;
          const prev = i > 0 ? messages[i - 1] : null;
          // Group when: same author (human OR same bot id), within window,
          // and no date separator between them.
          const sameAuthor =
            !!prev &&
            prev.player_id === msg.player_id &&
            (prev.bot_id ?? null) === (msg.bot_id ?? null);
          const withinWindow =
            !!prev && msg.created_at - prev.created_at <= GROUP_WINDOW;
          const grouped = !showSeparator && sameAuthor && withinWindow;
          return (
            <div key={msg.id}>
              {showSeparator && (
                <div className="sticky top-1 z-10 flex justify-center py-1 my-2 pointer-events-none">
                  <span className="pointer-events-auto text-[11px] font-semibold uppercase tracking-wider text-text-secondary bg-bg-elevated/95 backdrop-blur-sm border border-border rounded-full px-3 py-1 shadow-sm">
                    {msgDate}
                  </span>
                </div>
              )}
              <MessageBubble
                message={msg}
                isOwn={msg.player_id === playerId}
                isAdmin={isAdmin}
                onDeleted={onMessageDeleted}
                memberMap={memberMap}
                adminIds={adminIds}
                selfId={playerId}
                grouped={grouped}
              />
            </div>
          );
        })}
      </div>

      {typingNames.length > 0 && (
        <div className="px-3 py-1 text-xs text-text-muted italic">
          {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing...
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
