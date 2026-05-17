"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Message } from "@/types/chat";
import { api } from "@/lib/api-client";
import { Avatar } from "@/components/ui/Avatar";
import { MessageReactions } from "./MessageReactions";
import { EntityCard } from "./entities/EntityCard";
import { useEntityResolver } from "./entities/useEntityResolver";
import { ChainAssistCard, CHAIN_ASSIST_MARKER_RE } from "./cards/ChainAssistCard";

interface Props {
  message: Message;
  isOwn: boolean;
  isAdmin: boolean;
  onDeleted?: (id: number) => void;
  memberMap?: Record<number, string>;
  adminIds?: Set<number>;
  /** Current player ID — used to highlight their own reactions. */
  selfId?: number | null;
  /** When true, this message immediately follows another from the same author
   *  within the grouping window — hide the avatar + header, only show the body
   *  with a hover-revealed timestamp in the gutter. */
  grouped?: boolean;
}

function formatHoverTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((today.getTime() - msgDay.getTime()) / 86400000);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (dayDiff === 0) return time;
  if (dayDiff === 1) return `Yesterday ${time}`;
  if (dayDiff < 7) return `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + time;
}

// Match URLs and @mentions in one pass. Same patterns as the companion's
// lib/chat-render.ts — keep them in sync so both surfaces linkify the same way.
const URL_RE = /\b(https?:\/\/[^\s<>"]+|(?:www\.)?torn\.com\/[^\s<>"]+)/gi;
const TRAILING_PUNCT_RE = /[)\].,;:!?'"]+$/;

function normaliseUrl(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function renderContent(
  content: string,
  mentions: number[],
  memberMap: Record<number, string> = {},
  hiddenUrls: Set<string> = new Set()
): React.ReactNode {
  // Build a name→id lookup from mentions + memberMap
  const nameToId: Record<string, number> = {};
  for (const pid of mentions) {
    const name = memberMap[pid];
    if (name) nameToId[name.toLowerCase()] = pid;
  }

  // First pass: split on URLs. Each "match" chunk becomes an <a>; each
  // non-match chunk is then split on @mentions (existing behaviour).
  const out: React.ReactNode[] = [];
  let key = 0;
  let lastIndex = 0;
  for (const m of content.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    if (start > lastIndex) {
      pushMentionParts(content.slice(lastIndex, start));
    }
    let raw = m[0];
    let trailing = "";
    const trail = raw.match(TRAILING_PUNCT_RE);
    if (trail) {
      trailing = trail[0];
      raw = raw.slice(0, raw.length - trailing.length);
    }
    if (!hiddenUrls.has(raw)) {
      out.push(
        <a
          key={key++}
          href={normaliseUrl(raw)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-torn-blue underline underline-offset-2 break-all hover:text-torn-green"
        >
          {raw}
        </a>,
      );
    }
    if (trailing) out.push(trailing);
    lastIndex = start + m[0].length;
  }
  if (lastIndex < content.length) pushMentionParts(content.slice(lastIndex));

  return out;

  function pushMentionParts(slice: string): void {
    const parts = slice.split(/(@[\w[\]]+)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith("@")) {
        const name = part.slice(1);
        const pid = nameToId[name.toLowerCase()];
        if (pid) {
          out.push(
            <a
              key={key++}
              href={`https://www.torn.com/profiles.php?XID=${pid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-torn-green font-medium bg-torn-green/10 px-0.5 rounded hover:underline cursor-pointer"
            >
              {part}
            </a>,
          );
        } else {
          out.push(
            <span key={key++} className="text-torn-green font-medium bg-torn-green/10 px-0.5 rounded">
              {part}
            </span>,
          );
        }
      } else {
        out.push(part);
      }
    }
  }
}

export function MessageBubble({ message, isOwn, isAdmin, onDeleted, memberMap = {}, adminIds, selfId = null, grouped = false }: Props) {
  const [showActions, setShowActions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isBot = message.bot_id !== null;

  /* Track on-screen visibility — entity cards refresh only when in view. */
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !message.entities || message.entities.length === 0) return;
    const obs = new IntersectionObserver(
      entries => setVisible(entries.some(e => e.isIntersecting)),
      { rootMargin: "100px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [message.entities]);

  const resolvedCards = useEntityResolver(message.entities, visible);

  const hiddenUrls = (() => {
    if (!message.entities) return new Set<string>();
    const out = new Set<string>();
    for (const e of message.entities) {
      if (typeof e.id !== "number" || e.id <= 0) continue;
      if (!resolvedCards[`${e.kind}:${e.id}`]) continue;
      if (e.raw) out.add(e.raw);
    }
    return out;
  })();

  /* Touch support: tap message to toggle actions, tap outside to dismiss */
  const isCoarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

  const handleTouchToggle = useCallback(() => {
    if (isCoarse) setShowActions(prev => !prev);
  }, [isCoarse]);

  useEffect(() => {
    if (!showActions || !isCoarse) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [showActions, isCoarse]);

  const handleDelete = async () => {
    if (!confirm("Delete this message?")) return;
    try {
      await api.chatDeleteMessage(message.id);
      onDeleted?.(message.id);
    } catch { /* ignore */ }
  };

  const handleEdit = async () => {
    if (!editContent.trim()) return;
    try {
      await api.chatEditMessage(message.id, editContent.trim());
      setEditing(false);
    } catch { /* ignore */ }
  };

  const handlePin = async () => {
    try {
      await api.chatTogglePin(message.id);
    } catch { /* ignore */ }
  };

  return (
    <div
      ref={containerRef}
      className={`group relative flex gap-2 px-3 hover:bg-bg-elevated/50 transition-colors ${grouped ? "py-0.5" : "py-1 mt-1"}`}
      onMouseEnter={isCoarse ? undefined : () => setShowActions(true)}
      onMouseLeave={isCoarse ? undefined : () => setShowActions(false)}
      onClick={handleTouchToggle}
    >
      {/* Avatar / gutter — for grouped messages keep the same 32px column so
          message bodies line up, but show timestamp on hover instead of avatar. */}
      {grouped ? (
        <div className="w-8 shrink-0 flex justify-end pr-0.5 pt-0.5 text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity select-none leading-none">
          {formatHoverTime(message.created_at)}
        </div>
      ) : isBot ? (
        <div className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-torn-blue shrink-0 mt-0.5">
          B
        </div>
      ) : (
        <Avatar playerId={message.player_id} name={message.player_name} size="md" className="mt-0.5" />
      )}

      <div className="flex-1 min-w-0">
        {/* Header — hidden when grouped */}
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <a
              href={isBot ? undefined : `https://www.torn.com/profiles.php?XID=${message.player_id}`}
              target="_blank" rel="noopener noreferrer"

              className={`text-sm font-medium ${isBot ? "text-torn-blue" : "text-torn-green"} hover:underline`}
            >
              {message.player_name}
            </a>
            {isBot && (
              <span className="text-[10px] px-1 py-px rounded bg-torn-blue/20 text-torn-blue font-bold uppercase">
                bot
              </span>
            )}
            {!isBot && adminIds?.has(message.player_id) && (
              <span className="text-[10px] px-1 py-px rounded bg-torn-green/20 text-torn-green font-bold uppercase">
                admin
              </span>
            )}
            {message.pinned === 1 && (
              <span className="text-[10px] px-1 py-px rounded bg-torn-yellow/20 text-torn-yellow">
                pinned
              </span>
            )}
            <span className="text-[11px] text-text-muted" title={new Date(message.created_at * 1000).toLocaleString()}>
              {formatTime(message.created_at)}
            </span>
            {message.edited_at && (
              <span className="text-[10px] text-text-muted">(edited)</span>
            )}
          </div>
        )}

        {/* Content */}
        {editing ? (
          <div className="mt-1 flex gap-2">
            <input
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              className="flex-1 bg-bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary"
              autoFocus
            />
            <button onClick={handleEdit} className="text-xs text-torn-green hover:underline">Save</button>
            <button onClick={() => setEditing(false)} className="text-xs text-text-muted hover:underline">Cancel</button>
          </div>
        ) : (
          <div className="text-sm text-text-primary whitespace-pre-wrap break-words">
            {(() => {
              const m = message.content.match(CHAIN_ASSIST_MARKER_RE);
              if (m) {
                const assistId = Number(m[1]);
                // Strip the marker from displayed text; the card replaces the
                // verbose bot summary that follows it.
                const rest = message.content.slice(m[0].length).trim();
                return (
                  <>
                    {rest && (
                      <span className="block text-[11px] text-text-muted">
                        {renderContent(rest, message.mentions, memberMap, hiddenUrls)}
                      </span>
                    )}
                    <ChainAssistCard assistId={assistId} selfId={selfId} />
                  </>
                );
              }
              return renderContent(message.content, message.mentions, memberMap, hiddenUrls);
            })()}
            {grouped && message.edited_at && (
              <span className="ml-1 text-[10px] text-text-muted">(edited)</span>
            )}
            {message.ephemeral && (
              <div className="mt-1 text-[10px] text-text-muted italic">
                Only you can see this. Type a regular message to dismiss.
              </div>
            )}
            {message.entities && message.entities.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {message.entities.map((e, i) => {
                  if (typeof e.id !== "number" || e.id <= 0) return null;
                  const key = `${e.kind}:${e.id}`;
                  const card = resolvedCards[key];
                  if (!card) return null;
                  return <EntityCard key={`${key}-${i}`} card={card} />;
                })}
              </div>
            )}
          </div>
        )}
        {!editing && message.deleted !== 1 && (
          <MessageReactions
            messageId={message.id}
            reactions={message.reactions}
            selfId={selfId}
            pickerOpen={reactionPickerOpen}
            onPickerOpenChange={setReactionPickerOpen}
          />
        )}
      </div>

      {/* Actions — absolute pill at top-right */}
      {showActions && !editing && (
        <div className="absolute right-2 top-0 z-10 flex items-center gap-0.5 bg-bg-surface border border-border rounded-md shadow-sm px-1 py-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); setReactionPickerOpen(o => !o); }}
            className="relative p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-colors before:absolute before:inset-[-8px] before:content-['']"
            title="Add reaction"
            aria-label="Add reaction"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9"/>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/>
              <line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
          </button>
          {isOwn && !isBot && (
            <button
              onClick={(e) => { e.stopPropagation(); setEditContent(message.content); setEditing(true); }}
              className="relative p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-colors before:absolute before:inset-[-8px] before:content-['']"
              title="Edit"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={(e) => { e.stopPropagation(); handlePin(); }}
              className={`relative p-1 rounded hover:bg-bg-elevated transition-colors before:absolute before:inset-[-8px] before:content-[''] ${message.pinned ? "text-torn-yellow" : "text-text-muted hover:text-torn-yellow"}`}
              title={message.pinned ? "Unpin message" : "Pin message"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={message.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/>
              </svg>
            </button>
          )}
          {(isOwn || isAdmin) && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
              className="relative p-1 rounded hover:bg-torn-red/10 text-text-muted hover:text-torn-red transition-colors before:absolute before:inset-[-8px] before:content-['']"
              title="Delete message"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
