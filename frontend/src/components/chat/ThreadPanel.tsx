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
}

export function ThreadPanel({ thread, playerId, isAdmin, onBack }: Props) {
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
          {isAdmin && (
            <div className="flex gap-1">
              <button
                onClick={handleTogglePin}
                className="text-[11px] px-2 py-1 rounded bg-bg-elevated text-text-muted hover:text-torn-yellow"
              >
                {thread.pinned ? "unpin" : "pin"}
              </button>
              <button
                onClick={handleToggleLock}
                className="text-[11px] px-2 py-1 rounded bg-bg-elevated text-text-muted hover:text-torn-red"
              >
                {thread.locked ? "unlock" : "lock"}
              </button>
            </div>
          )}
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
        typingNames={[]}
      />

      {/* Input */}
      {thread.locked !== 1 ? (
        <MessageInput
          onSend={handleSend}
          onTyping={() => {}}
          placeholder="Reply to thread..."
        />
      ) : (
        <div className="p-3 border-t border-border text-sm text-text-muted text-center">
          This thread is locked.
        </div>
      )}
    </div>
  );
}
