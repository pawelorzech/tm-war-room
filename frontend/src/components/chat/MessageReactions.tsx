"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Reaction } from "@/types/chat";
import { api } from "@/lib/api-client";

interface Props {
  messageId: number;
  reactions?: Reaction[];
  /** Logged-in player ID — used to highlight "I reacted with this" chips. */
  selfId: number | null;
  /** Compact mode for the companion / mobile — drop names from tooltip. */
  compact?: boolean;
}

/** Curated shortlist — covers ack / agreement / war-room / chain patterns. */
const QUICK_EMOJIS = [
  "👍", "❤️", "😂", "🎉", "🔥",
  "✅", "❌", "👀", "💀", "🚀",
  "🟢", "🟡", "🔴",
] as const;

export function MessageReactions({ messageId, reactions, selfId, compact = false }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [pickerOpen]);

  const toggle = useCallback(
    async (emoji: string, mineAlready: boolean) => {
      if (pending.has(emoji)) return;
      setPending(prev => new Set(prev).add(emoji));
      try {
        if (mineAlready) {
          await api.chatRemoveReaction(messageId, emoji);
        } else {
          await api.chatAddReaction(messageId, emoji);
        }
      } catch { /* websocket will reconcile */ }
      finally {
        setPending(prev => {
          const next = new Set(prev);
          next.delete(emoji);
          return next;
        });
        setPickerOpen(false);
      }
    },
    [messageId, pending],
  );

  const list = reactions ?? [];
  if (list.length === 0 && !pickerOpen) {
    // Show just the "+" trigger on hover via parent's group-hover.
    return (
      <div ref={wrapRef} className="mt-0.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setPickerOpen(true); }}
          className="h-6 px-1.5 rounded-full border border-border bg-bg-surface text-text-muted text-[11px] hover:text-text-primary hover:border-torn-green/40"
          aria-label="Add reaction"
          title="Add reaction"
        >
          + 😊
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="mt-1 flex items-center flex-wrap gap-1 relative">
      {list.map(r => {
        const mine = selfId != null && r.players.some(p => p.id === selfId);
        const isPending = pending.has(r.emoji);
        const names = compact || !r.players.length
          ? `${r.count} reacted with ${r.emoji}`
          : r.players.map(p => p.name).join(", ") + ` reacted with ${r.emoji}`;
        return (
          <button
            key={r.emoji}
            type="button"
            disabled={isPending}
            onClick={(e) => { e.stopPropagation(); toggle(r.emoji, mine); }}
            title={names}
            className={`h-6 inline-flex items-center gap-1 px-1.5 rounded-full border text-[12px] leading-none transition-colors ${
              mine
                ? "border-torn-green/50 bg-torn-green/10 text-torn-green"
                : "border-border bg-bg-surface text-text-primary hover:border-torn-green/30 hover:bg-bg-elevated"
            } ${isPending ? "opacity-50 cursor-wait" : ""}`}
          >
            <span aria-hidden>{r.emoji}</span>
            <span className="font-medium tabular-nums">{r.count}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setPickerOpen(o => !o); }}
        className="h-6 px-1.5 rounded-full border border-border bg-bg-surface text-text-muted text-[11px] hover:text-text-primary hover:border-torn-green/40 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        aria-label="Add reaction"
        title="Add reaction"
      >
        +
      </button>
      {pickerOpen && (
        <div className="absolute z-20 bottom-full left-0 mb-1 flex flex-wrap gap-1 max-w-[14rem] p-1.5 bg-bg-surface border border-border rounded-lg shadow-lg">
          {QUICK_EMOJIS.map(emoji => {
            const existing = list.find(r => r.emoji === emoji);
            const mine = !!(existing && selfId != null && existing.players.some(p => p.id === selfId));
            return (
              <button
                key={emoji}
                type="button"
                onClick={(e) => { e.stopPropagation(); toggle(emoji, mine); }}
                className={`w-7 h-7 rounded text-base leading-none hover:bg-bg-elevated ${mine ? "bg-torn-green/15" : ""}`}
                aria-label={`React with ${emoji}`}
                title={emoji}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
