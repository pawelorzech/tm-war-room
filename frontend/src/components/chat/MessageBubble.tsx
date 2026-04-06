"use client";

import { useState } from "react";
import type { Message } from "@/types/chat";
import { api } from "@/lib/api-client";

interface Props {
  message: Message;
  isOwn: boolean;
  isAdmin: boolean;
  onDeleted?: (id: number) => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderContent(content: string, mentions: number[]): React.ReactNode {
  if (mentions.length === 0) return content;
  // Highlight @mentions in the text
  const parts = content.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return (
        <span key={i} className="text-torn-green font-medium bg-torn-green/10 px-0.5 rounded">
          {part}
        </span>
      );
    }
    return part;
  });
}

export function MessageBubble({ message, isOwn, isAdmin, onDeleted }: Props) {
  const [showActions, setShowActions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const isBot = message.bot_id !== null;

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
      className="group flex gap-2 px-3 py-1 hover:bg-bg-elevated/50 transition-colors"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar area */}
      <div className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-text-muted shrink-0 mt-0.5">
        {isBot ? (
          <span className="text-torn-blue">B</span>
        ) : (
          message.player_name.charAt(0).toUpperCase()
        )}
      </div>

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-baseline gap-2">
          <a
            href={isBot ? undefined : `https://www.torn.com/profiles.php?XID=${message.player_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-sm font-medium ${isBot ? "text-torn-blue" : "text-torn-green"} hover:underline`}
          >
            {message.player_name}
          </a>
          {isBot && (
            <span className="text-[10px] px-1 py-px rounded bg-torn-blue/20 text-torn-blue font-bold uppercase">
              bot
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
            {renderContent(message.content, message.mentions)}
          </div>
        )}
      </div>

      {/* Actions */}
      {showActions && !editing && (isOwn || isAdmin) && (
        <div className="flex items-start gap-0.5 shrink-0 mt-1 bg-bg-surface border border-border rounded-md shadow-sm px-1 py-0.5">
          {isOwn && !isBot && (
            <button
              onClick={() => { setEditContent(message.content); setEditing(true); }}
              className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-colors"
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
              onClick={handlePin}
              className={`p-1 rounded hover:bg-bg-elevated transition-colors ${message.pinned ? "text-torn-yellow" : "text-text-muted hover:text-torn-yellow"}`}
              title={message.pinned ? "Unpin message" : "Pin message"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={message.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/>
              </svg>
            </button>
          )}
          {(isOwn || isAdmin) && (
            <button
              onClick={handleDelete}
              className="p-1 rounded hover:bg-torn-red/10 text-text-muted hover:text-torn-red transition-colors"
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
