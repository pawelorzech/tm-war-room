"use client";

import { useState, useMemo } from "react";
import { useChat } from "@/hooks/useChat";
import { useAuth } from "@/hooks/useAuth";
import { ChannelList } from "./ChannelList";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ThreadList } from "./ThreadList";
import { ThreadPanel } from "./ThreadPanel";
import { CreateThreadDialog } from "./CreateThreadDialog";
import { ChatAdmin } from "./ChatAdmin";
import type { Thread, Channel } from "@/types/chat";

export function ChatLayout() {
  const { playerId, role } = useAuth();
  const {
    channels, activeChannelId, messages, loading, loadingMessages,
    unreadCounts, totalUnread, onlinePlayers, typingPlayers,
    selectChannel, sendMessage, sendTyping, loadOlder, loadChannels, removeMessage,
  } = useChat();

  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [showCreateThread, setShowCreateThread] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [mobileView, setMobileView] = useState<"channels" | "chat">("channels");

  const isAdmin = role === "admin" || role === "superadmin";
  const pid = playerId ? Number(playerId) : 0;
  const activeChannel: Channel | undefined = channels.find(c => c.id === activeChannelId);

  const typingNames = useMemo(() => {
    return Object.values(typingPlayers)
      .filter(t => Date.now() - t.ts < 4000)
      .map(t => t.player_name);
  }, [typingPlayers]);

  const handleSelectChannel = (id: number) => {
    setSelectedThread(null);
    setShowAdmin(false);
    selectChannel(id);
    setMobileView("chat");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-muted text-sm">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] lg:h-[calc(100vh-4rem)]">
      {/* Channel sidebar */}
      <div className={`w-full lg:w-56 shrink-0 border-r border-border bg-bg-surface
        ${mobileView === "channels" ? "block" : "hidden"} lg:block`}
      >
        <ChannelList
          channels={channels}
          activeChannelId={activeChannelId}
          unreadCounts={unreadCounts}
          onSelect={handleSelectChannel}
        />
        {/* Online count + admin */}
        <div className="p-3 border-t border-border flex items-center justify-between">
          <div className="text-[11px] text-text-muted">
            {onlinePlayers.length} online
          </div>
          {isAdmin && (
            <button
              onClick={() => { setShowAdmin(!showAdmin); setMobileView("chat"); }}
              className={`text-[11px] px-1.5 py-0.5 rounded ${showAdmin ? "bg-torn-green/20 text-torn-green" : "text-text-muted hover:text-text-primary"}`}
            >
              admin
            </button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className={`flex-1 flex flex-col min-w-0
        ${mobileView === "chat" ? "block" : "hidden"} lg:block`}
      >
        {showAdmin ? (
          <ChatAdmin channels={channels} onChannelCreated={loadChannels} />
        ) : !activeChannel ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            Select a channel to start chatting
          </div>
        ) : activeChannel.type === "forum" ? (
          /* Forum view */
          selectedThread ? (
            <ThreadPanel
              thread={selectedThread}
              playerId={pid}
              isAdmin={isAdmin}
              onBack={() => setSelectedThread(null)}
            />
          ) : (
            <>
              <div className="p-3 border-b border-border flex items-center gap-2">
                <button
                  onClick={() => setMobileView("channels")}
                  className="lg:hidden text-text-muted hover:text-text-primary text-sm"
                >
                  &larr;
                </button>
                <div className="flex-1">
                  <h2 className="text-sm font-bold text-text-primary">#{activeChannel.name}</h2>
                  {activeChannel.description && (
                    <div className="text-[11px] text-text-muted">{activeChannel.description}</div>
                  )}
                </div>
              </div>
              <ThreadList
                channelId={activeChannel.id}
                isAdmin={isAdmin}
                onSelectThread={setSelectedThread}
                onCreateThread={() => setShowCreateThread(true)}
              />
              {showCreateThread && (
                <CreateThreadDialog
                  channelId={activeChannel.id}
                  onCreated={(thread) => {
                    setShowCreateThread(false);
                    setSelectedThread(thread);
                  }}
                  onCancel={() => setShowCreateThread(false)}
                />
              )}
            </>
          )
        ) : (
          /* Chat view */
          <>
            {/* Channel header */}
            <div className="p-3 border-b border-border flex items-center gap-2">
              <button
                onClick={() => setMobileView("channels")}
                className="lg:hidden text-text-muted hover:text-text-primary text-sm"
              >
                &larr;
              </button>
              <div className="flex-1">
                <h2 className="text-sm font-bold text-text-primary">#{activeChannel.name}</h2>
                {activeChannel.description && (
                  <div className="text-[11px] text-text-muted">{activeChannel.description}</div>
                )}
              </div>
            </div>

            {/* Messages */}
            <MessageList
              messages={messages}
              loading={loadingMessages}
              playerId={pid}
              isAdmin={isAdmin}
              onLoadOlder={loadOlder}
              onMessageDeleted={removeMessage}
              typingNames={typingNames}
            />

            {/* Input */}
            <MessageInput
              onSend={sendMessage}
              onTyping={sendTyping}
              disabled={activeChannel.admin_only === 1 && !isAdmin}
              placeholder={
                activeChannel.admin_only === 1 && !isAdmin
                  ? "Only admins can post in this channel"
                  : `Message #${activeChannel.name}`
              }
            />
          </>
        )}
      </div>

    </div>
  );
}
