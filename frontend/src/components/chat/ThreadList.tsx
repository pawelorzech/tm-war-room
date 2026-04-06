"use client";

import { useState, useEffect, useCallback } from "react";
import type { Thread } from "@/types/chat";
import { api } from "@/lib/api-client";

interface Props {
  channelId: number;
  isAdmin: boolean;
  canWrite?: boolean;
  onSelectThread: (thread: Thread) => void;
  onCreateThread: () => void;
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function ThreadList({ channelId, isAdmin, canWrite = true, onSelectThread, onCreateThread }: Props) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  const loadThreads = useCallback(async () => {
    try {
      const data = await api.chatThreads(channelId);
      setThreads(data.threads);
    } catch { /* ignore */ }
    setLoading(false);
  }, [channelId]);

  useEffect(() => {
    setLoading(true);
    loadThreads();
  }, [loadThreads]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-bold text-text-primary">Topics</h3>
        {canWrite && (
          <button
            onClick={onCreateThread}
            className="text-xs px-2 py-1 bg-torn-green text-bg-primary rounded hover:bg-torn-green/90 transition-colors"
          >
            New Topic
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {loading && (
          <div className="p-4 text-sm text-text-muted text-center">Loading...</div>
        )}
        {!loading && threads.length === 0 && (
          <div className="p-4 text-sm text-text-muted text-center">
            No topics yet. Create the first one!
          </div>
        )}
        {threads.map(thread => (
          <button
            key={thread.id}
            onClick={() => onSelectThread(thread)}
            className="w-full text-left p-3 border-b border-border hover:bg-bg-elevated transition-colors"
          >
            <div className="flex items-center gap-2">
              {thread.pinned === 1 && (
                <span className="text-[10px] px-1 py-px rounded bg-torn-yellow/20 text-torn-yellow shrink-0">
                  pinned
                </span>
              )}
              {thread.locked === 1 && (
                <span className="text-[10px] px-1 py-px rounded bg-torn-red/20 text-torn-red shrink-0">
                  locked
                </span>
              )}
              <span className="text-sm font-medium text-text-primary truncate">
                {thread.title}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-text-muted">
              <span>{thread.player_name}</span>
              <span>-</span>
              <span>{timeAgo(thread.last_message_at)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
