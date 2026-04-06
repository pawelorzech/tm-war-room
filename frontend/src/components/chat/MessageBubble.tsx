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
        <div className="flex items-start gap-1 shrink-0 mt-0.5">
          {isOwn && !isBot && (
            <button
              onClick={() => { setEditContent(message.content); setEditing(true); }}
              className="text-[11px] text-text-muted hover:text-text-primary px-1"
              title="Edit"
            >
              edit
            </button>
          )}
          {isAdmin && (
            <button
              onClick={handlePin}
              className="text-[11px] text-text-muted hover:text-torn-yellow px-1"
              title={message.pinned ? "Unpin" : "Pin"}
            >
              {message.pinned ? "unpin" : "pin"}
            </button>
          )}
          {(isOwn || isAdmin) && (
            <button
              onClick={handleDelete}
              className="text-[11px] text-text-muted hover:text-torn-red px-1"
              title="Delete"
            >
              del
            </button>
          )}
        </div>
      )}
    </div>
  );
}
