"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useChat } from "@/hooks/useChat";
import { useAuth } from "@/hooks/useAuth";
import { ChannelList } from "./ChannelList";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ThreadList } from "./ThreadList";
import { ThreadPanel } from "./ThreadPanel";
import { CreateThreadDialog } from "./CreateThreadDialog";
import { ChatAdmin } from "./ChatAdmin";
import { api } from "@/lib/api-client";
import type { Thread, Channel } from "@/types/chat";

export function ChatLayout() {
  const { playerId, role } = useAuth();
  const {
    channels, activeChannelId, messages, loading, loadingMessages,
    unreadCounts, totalUnread, onlinePlayers, typingPlayers,
    selectChannel, sendMessage, sendTyping, loadOlder, loadChannels, removeMessage,
  } = useChat();

  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [showCreateThread, setShowCreateThread] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [mobileView, setMobileView] = useState<"channels" | "chat">("channels");

  // Update URL when channel/thread changes (without full navigation)
  const updateUrl = useCallback((channelId: number | null, threadId: number | null) => {
    const params = new URLSearchParams();
    if (channelId) params.set("channel", String(channelId));
    if (threadId) params.set("thread", String(threadId));
    const qs = params.toString();
    window.history.replaceState(null, "", `/chat${qs ? `?${qs}` : ""}`);
  }, []);
  const [members, setMembers] = useState<{ player_id: number; name: string }[]>([]);
  const memberMap = useMemo<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    for (const mem of members) m[mem.player_id] = mem.name;
    return m;
  }, [members]);

  const [adminIds, setAdminIds] = useState<Set<number>>(new Set());
  const [travelers, setTravelers] = useState<{ player_id: number; name: string; status: string }[]>([]);

  useEffect(() => {
    api.listKeys().then(res => setMembers(res.keys)).catch(() => {});
    api.chatAdminIds().then(res => setAdminIds(new Set(res.admin_ids))).catch(() => {});
  }, []);

  const isAdmin = role === "admin" || role === "superadmin";
  const pid = playerId ? Number(playerId) : 0;
  const activeChannel: Channel | undefined = channels.find(c => c.id === activeChannelId);

  useEffect(() => {
    if (!activeChannel || activeChannel.name !== "traveling") {
      setTravelers([]);
      return;
    }
    let cancelled = false;
    const fetchTravelers = () => {
      api.chatTraveling()
        .then(data => { if (!cancelled) setTravelers(data.travelers); })
        .catch(() => {});
    };
    fetchTravelers();
    const interval = setInterval(fetchTravelers, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeChannel]);

  const typingNames = useMemo(() => {
    return Object.values(typingPlayers)
      .filter(t => Date.now() - t.ts < 4000)
      .map(t => t.player_name);
  }, [typingPlayers]);

  // Restore channel/thread from URL on first load
  const restoredRef = useMemo(() => ({ done: false }), []);
  useEffect(() => {
    if (restoredRef.done || channels.length === 0) return;
    restoredRef.done = true;
    const chParam = searchParams.get("channel");
    if (chParam) {
      const chId = Number(chParam);
      if (channels.some(c => c.id === chId)) {
        selectChannel(chId);
        setMobileView("chat");
        // Thread restore happens after channel is loaded — handled by threadParam below
        const thParam = searchParams.get("thread");
        if (thParam) {
          const thId = Number(thParam);
          const ch = channels.find(c => c.id === chId);
          if (ch?.type === "forum") {
            // Fetch thread info and select it
            api.chatThreadMessages(thId).then(data => {
              if (data.thread) setSelectedThread(data.thread);
            }).catch(() => {});
          }
        }
      }
    }
  }, [channels, searchParams, selectChannel, restoredRef]);

  const selectThread = useCallback((thread: Thread | null) => {
    setSelectedThread(thread);
    updateUrl(activeChannelId, thread?.id ?? null);
  }, [activeChannelId, updateUrl]);

  const handleSelectChannel = (id: number) => {
    setSelectedThread(null);
    setShowAdmin(false);
    selectChannel(id);
    setMobileView("chat");
    updateUrl(id, null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-muted text-sm">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 lg:h-[calc(100vh-4rem)] lg:flex-none">
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
      <div className={`flex-1 flex flex-col min-w-0 min-h-0
        ${mobileView === "chat" ? "flex" : "hidden"} lg:flex`}
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
              onBack={() => selectThread(null)}
              onThreadDeleted={() => selectThread(null)}
              memberMap={memberMap}
              adminIds={adminIds}
              members={members}
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
                canWrite={!activeChannel.write_restricted || isAdmin}
                onSelectThread={selectThread}
                onCreateThread={() => setShowCreateThread(true)}
              />
              {showCreateThread && (
                <CreateThreadDialog
                  channelId={activeChannel.id}
                  onCreated={(thread) => {
                    setShowCreateThread(false);
                    selectThread(thread);
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
            <div className="border-b border-border">
              <div className="p-3 flex items-center gap-2">
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
              {activeChannel.name === "traveling" && (
                <div className="px-3 pb-2 flex items-center gap-2 overflow-x-auto scrollbar-hide">
                  <span className="text-[11px] text-text-muted shrink-0">✈️ Now traveling:</span>
                  {travelers.length === 0 ? (
                    <span className="text-[11px] text-text-muted italic">No members traveling right now</span>
                  ) : (
                    travelers.map(t => (
                      <span
                        key={t.player_id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-torn-blue/10 text-torn-blue text-[11px] whitespace-nowrap shrink-0"
                      >
                        {t.name}
                        <span className="text-torn-blue/60">{t.status.replace(/^(Traveling|In )/, "→").replace(/Abroad in /, "")}</span>
                      </span>
                    ))
                  )}
                </div>
              )}
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
              memberMap={memberMap}
              adminIds={adminIds}
            />

            {/* Input */}
            <MessageInput
              onSend={sendMessage}
              onTyping={sendTyping}
              disabled={(activeChannel.admin_only === 1 || activeChannel.write_restricted === 1) && !isAdmin}
              placeholder={
                (activeChannel.admin_only === 1 || activeChannel.write_restricted === 1) && !isAdmin
                  ? "Only admins can post in this channel"
                  : `Message #${activeChannel.name}`
              }
              members={members}
            />
          </>
        )}
      </div>

    </div>
  );
}
