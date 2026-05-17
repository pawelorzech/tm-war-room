"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import type { Reaction } from "@/types/chat";
import { api } from "@/lib/api-client";

interface Props {
  messageId: number;
  reactions?: Reaction[];
  /** Logged-in player ID — used to highlight "I reacted with this" chips. */
  selfId: number | null;
  /** Compact mode for the companion / mobile — drop names from tooltip. */
  compact?: boolean;
  /** Controlled picker visibility (the parent's action pill owns the button). */
  pickerOpen?: boolean;
  onPickerOpenChange?: (open: boolean) => void;
}

/** Curated shortlist — covers ack / agreement / war-room / chain patterns. */
const QUICK_EMOJIS_TOP = ["👍", "❤️", "😂", "🎉", "🔥", "✅", "👀"] as const;
const QUICK_EMOJIS_REST = ["❌", "💀", "🚀", "🟢", "🟡", "🔴"] as const;
const QUICK_EMOJIS_ALL = [...QUICK_EMOJIS_TOP, ...QUICK_EMOJIS_REST] as const;

export function MessageReactions({
  messageId,
  reactions,
  selfId,
  compact = false,
  pickerOpen: pickerOpenProp,
  onPickerOpenChange,
}: Props) {
  const [pickerOpenLocal, setPickerOpenLocal] = useState(false);
  const pickerOpen = pickerOpenProp ?? pickerOpenLocal;
  const setPickerOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof next === "function" ? next(pickerOpen) : next;
    if (onPickerOpenChange) onPickerOpenChange(resolved);
    else setPickerOpenLocal(resolved);
  }, [onPickerOpenChange, pickerOpen]);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Reset to top-7 view whenever the picker closes so the next open starts compact.
  useEffect(() => { if (!pickerOpen) setExpanded(false); }, [pickerOpen]);

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
  }, [pickerOpen, setPickerOpen]);

  // Clamp horizontal do viewportu — picker nie może wystawać poza prawą krawędź.
  // `left-0` z Tailwind to default; inline `left` w px nadpisuje go gdy overflow > 0.
  useLayoutEffect(() => {
    if (!pickerOpen || !pickerRef.current) return;
    const el = pickerRef.current;
    el.style.left = "";  // reset do CSS przed pomiarem (potrzebne przy re-measure on expand)
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const overflowRight = rect.right - (window.innerWidth - margin);
    if (overflowRight > 0) {
      el.style.left = `${-overflowRight}px`;
    }
  }, [pickerOpen, expanded]);

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

  // No chips AND no picker open → render nothing so messages stay tight.
  // The "add reaction" affordance lives in the message's action pill
  // (top-right of MessageBubble), so users still have a way in.
  if (list.length === 0 && !pickerOpen) return null;

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
      {pickerOpen && (
        <div ref={pickerRef} className="absolute z-20 bottom-full left-0 mb-1 flex items-center gap-1 p-1.5 bg-bg-surface border border-border rounded-full shadow-lg">
          {(expanded ? QUICK_EMOJIS_ALL : QUICK_EMOJIS_TOP).map(emoji => {
            const existing = list.find(r => r.emoji === emoji);
            const mine = !!(existing && selfId != null && existing.players.some(p => p.id === selfId));
            return (
              <button
                key={emoji}
                type="button"
                onClick={(e) => { e.stopPropagation(); toggle(emoji, mine); }}
                className={`w-7 h-7 rounded-md text-lg leading-none flex items-center justify-center transition-all hover:bg-bg-elevated hover:scale-110 ${mine ? "bg-torn-green/15" : ""}`}
                aria-label={`React with ${emoji}`}
                title={emoji}
              >
                {emoji}
              </button>
            );
          })}
          {!expanded && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
              className="w-7 h-7 rounded-md text-base font-bold text-text-muted hover:bg-bg-elevated transition-colors flex items-center justify-center"
              aria-label="More reactions"
              title="More reactions"
            >
              ⋯
            </button>
          )}
        </div>
      )}
    </div>
  );
}
