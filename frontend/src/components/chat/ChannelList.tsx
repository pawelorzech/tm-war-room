"use client";

import type { Channel } from "@/types/chat";

interface Props {
  channels: Channel[];
  activeChannelId: number | null;
  unreadCounts: Record<number, number>;
  onSelect: (id: number) => void;
}

const CHANNEL_ICONS: Record<string, string> = {
  general: "💬",
  "war-room": "⚔️",
  trading: "💰",
  "off-topic": "🎲",
  announcements: "📢",
  "hub-feedback": "💡",
  traveling: "✈️",
};

export function ChannelList({ channels, activeChannelId, unreadCounts, onSelect }: Props) {
  const chatChannels = channels.filter(c => c.type === "chat");
  const forumChannels = channels.filter(c => c.type === "forum");

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">Channels</h2>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {chatChannels.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1 text-xs text-text-muted uppercase tracking-wider">Chat</div>
            {chatChannels.map(ch => (
              <ChannelItem
                key={ch.id} channel={ch}
                active={ch.id === activeChannelId}
                unread={unreadCounts[ch.id] ?? 0}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
        {forumChannels.length > 0 && (
          <div>
            <div className="px-3 py-1 text-xs text-text-muted uppercase tracking-wider">Forum</div>
            {forumChannels.map(ch => (
              <ChannelItem
                key={ch.id} channel={ch}
                active={ch.id === activeChannelId}
                unread={unreadCounts[ch.id] ?? 0}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelItem({ channel, active, unread, onSelect }: {
  channel: Channel; active: boolean; unread: number; onSelect: (id: number) => void;
}) {
  const icon = CHANNEL_ICONS[channel.name] || "💬";
  return (
    <button
      onClick={() => onSelect(channel.id)}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors
        ${active
          ? "bg-torn-green/15 text-torn-green font-medium"
          : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
        }`}
    >
      <span className="text-sm w-5 text-center shrink-0">{icon}</span>
      <span className="truncate flex-1">{channel.name}</span>
      {channel.admin_only === 1 && (
        <span className="text-[10px] text-torn-yellow px-1 rounded bg-torn-yellow/10">admin</span>
      )}
      {unread > 0 && (
        <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-torn-green text-bg-primary rounded-full px-1">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
