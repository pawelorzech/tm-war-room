"use client";

import { useState, useEffect, useCallback } from "react";
import type { Thread, Message } from "@/types/chat";
import { api } from "@/lib/api-client";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";

interface Props {
  thread: Thread;
  playerId: number;
  isAdmin: boolean;
  onBack: () => void;
  onThreadDeleted?: () => void;
  memberMap?: Record<number, string>;
  members?: { player_id: number; name: string }[];
  adminIds?: Set<number>;
}

export function ThreadPanel({ thread, playerId, isAdmin, onBack, onThreadDeleted, memberMap = {}, members = [], adminIds }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMessages = useCallback(async (before?: number) => {
    try {
      const data = await api.chatThreadMessages(thread.id, before);
      if (before) {
        setMessages(prev => [...data.messages, ...prev]);
      } else {
        setMessages(data.messages);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [thread.id]);

  useEffect(() => {
    setLoading(true);
    loadMessages();
  }, [loadMessages]);

  const handleSend = async (content: string) => {
    try {
      const msg = await api.chatSendThreadMessage(thread.id, content);
      setMessages(prev => [...prev, msg]);
    } catch { /* ignore */ }
  };

  const handleToggleLock = async () => {
    try {
      await api.chatToggleThreadLock(thread.id);
    } catch { /* ignore */ }
  };

  const handleTogglePin = async () => {
    try {
      await api.chatToggleThreadPin(thread.id);
    } catch { /* ignore */ }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this thread and all its messages? This cannot be undone.")) return;
    try {
      await api.chatDeleteThread(thread.id);
      if (onThreadDeleted) onThreadDeleted();
      else onBack();
    } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="text-text-muted hover:text-text-primary text-sm"
          >
            &larr; Back
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-text-primary truncate">{thread.title}</h3>
            <div className="text-[11px] text-text-muted">
              by {thread.player_name}
              {thread.locked === 1 && <span className="text-torn-red ml-2">locked</span>}
              {thread.pinned === 1 && <span className="text-torn-yellow ml-2">pinned</span>}
            </div>
          </div>
          <div className="flex gap-1">
            {isAdmin && (
              <>
                <button
                  onClick={handleTogglePin}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                    thread.pinned
                      ? "bg-torn-yellow/15 border-torn-yellow/30 text-torn-yellow hover:bg-torn-yellow/25"
                      : "bg-bg-elevated border-border text-text-muted hover:text-torn-yellow hover:border-torn-yellow/30"
                  }`}
                  title={thread.pinned ? "Unpin thread" : "Pin thread"}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill={thread.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/>
                  </svg>
                  {thread.pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  onClick={handleToggleLock}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                    thread.locked
                      ? "bg-torn-red/15 border-torn-red/30 text-torn-red hover:bg-torn-red/25"
                      : "bg-bg-elevated border-border text-text-muted hover:text-torn-red hover:border-torn-red/30"
                  }`}
                  title={thread.locked ? "Unlock thread" : "Lock thread"}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {thread.locked ? (
                      <>
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0110 0v4"/>
                      </>
                    ) : (
                      <>
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 019.9-1"/>
                      </>
                    )}
                  </svg>
                  {thread.locked ? "Unlock" : "Lock"}
                </button>
              </>
            )}
            {(isAdmin || thread.player_id === playerId) && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border transition-colors bg-bg-elevated border-border text-text-muted hover:text-torn-red hover:border-torn-red/30"
                title="Delete thread"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6"/>
                  <path d="M14 11v6"/>
                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <MessageList
        messages={messages}
        loading={loading}
        playerId={playerId}
        isAdmin={isAdmin}
        onLoadOlder={() => {
          if (messages.length > 0) loadMessages(messages[0].id);
        }}
        onMessageDeleted={(id) => setMessages(prev => prev.filter(m => m.id !== id))}
        typingNames={[]}
        memberMap={memberMap}
        adminIds={adminIds}
      />

      {/* Input */}
      {thread.locked !== 1 ? (
        <MessageInput
          onSend={handleSend}
          onTyping={() => {}}
          placeholder="Reply to thread..."
          members={members}
        />
      ) : (
        <div className="p-3 border-t border-border text-sm text-text-muted text-center">
          This thread is locked.
        </div>
      )}
    </div>
  );
}
