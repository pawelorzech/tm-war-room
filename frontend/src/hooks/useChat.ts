"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api-client";
import type { Channel, Message, ChatWSMessage } from "@/types/chat";

export function useChat() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [onlinePlayers, setOnlinePlayers] = useState<number[]>([]);
  const [typingPlayers, setTypingPlayers] = useState<Record<number, { player_name: string; ts: number }>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const activeChannelRef = useRef<number | null>(null);
  const myPlayerIdRef = useRef<number>(0);
  const myPlayerNameRef = useRef<string>("");

  // Keep ref in sync
  activeChannelRef.current = activeChannelId;

  // Update refs from localStorage on mount
  useEffect(() => {
    const pid = localStorage.getItem("myKeyPlayer");
    const name = localStorage.getItem("myKeyName");
    if (pid) myPlayerIdRef.current = Number(pid);
    if (name) myPlayerNameRef.current = name;
  }, []);

  // ── Load channels ──────────────────────────────────────
  const loadChannels = useCallback(async () => {
    try {
      const data = await api.chatChannels();
      setChannels(data.channels);
      const counts: Record<number, number> = {};
      for (const ch of data.channels) counts[ch.id] = ch.unread ?? 0;
      setUnreadCounts(counts);
    } catch {
      /* ignore */
    }
  }, []);

  // ── Load messages for active channel ───────────────────
  const loadMessages = useCallback(async (channelId: number, before?: number) => {
    if (!before) setLoadingMessages(true);
    try {
      const data = await api.chatMessages(channelId, before);
      if (before) {
        setMessages(prev => [...data.messages, ...prev]);
      } else {
        setMessages(data.messages);
      }
      // Mark as read
      if (data.messages.length > 0) {
        const last = data.messages[data.messages.length - 1];
        api.chatUpdateRead(channelId, last.id).catch(() => {});
        setUnreadCounts(prev => ({ ...prev, [channelId]: 0 }));
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // ── Select channel ─────────────────────────────────────
  const selectChannel = useCallback((channelId: number) => {
    setActiveChannelId(channelId);
    setMessages([]);
    loadMessages(channelId);
  }, [loadMessages]);

  // ── Send message ───────────────────────────────────────
  const sendMessage = useCallback(async (content: string, mentions: number[] = []) => {
    if (!activeChannelRef.current) return;

    // Optimistic rendering — show message immediately
    const tempId = -Date.now();
    const tempMsg: Message = {
      id: tempId,
      channel_id: activeChannelRef.current,
      thread_id: null,
      player_id: myPlayerIdRef.current,
      player_name: myPlayerNameRef.current,
      content,
      bot_id: null,
      mentions,
      pinned: 0,
      deleted: 0,
      created_at: Math.floor(Date.now() / 1000),
      edited_at: null,
      _optimistic: true,
    };
    setMessages(prev => [...prev, tempMsg]);

    // Try WebSocket first
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "message",
        payload: { channel_id: activeChannelRef.current, content, mentions },
      }));
    } else {
      // REST fallback — replace optimistic with server response
      try {
        const msg = await api.chatSendMessage(activeChannelRef.current, content, mentions);
        setMessages(prev => prev.map(m => m.id === tempId ? msg : m));
      } catch {
        // Mark as failed
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...m, _optimistic: false, deleted: 1 } : m
        ));
      }
    }
  }, []);

  // ── Send typing indicator ──────────────────────────────
  const lastTypingSent = useRef(0);
  const sendTyping = useCallback(() => {
    if (!activeChannelRef.current || !wsRef.current) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 3000) return;
    lastTypingSent.current = now;
    wsRef.current.send(JSON.stringify({
      type: "typing",
      payload: { channel_id: activeChannelRef.current },
    }));
  }, []);

  // ── Load older messages (infinite scroll) ──────────────
  const loadOlder = useCallback(() => {
    if (!activeChannelRef.current || messages.length === 0) return;
    loadMessages(activeChannelRef.current, messages[0].id);
  }, [messages, loadMessages]);

  // ── WebSocket connection ───────────────────────────────
  const connectWS = useCallback(() => {
    const pid = typeof window !== "undefined" ? localStorage.getItem("myKeyPlayer") : null;
    if (!pid) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/chat/ws?player_id=${pid}`);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempt.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg: ChatWSMessage = JSON.parse(event.data);
        handleWSMessage(msg);
      } catch {
        /* ignore */
      }
    };

    ws.onclose = (event) => {
      wsRef.current = null;
      if (event.code === 4001) return; // Replaced by new connection
      // Reconnect with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempt.current), 30000);
      reconnectAttempt.current++;
      reconnectTimer.current = setTimeout(connectWS, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  const handleWSMessage = useCallback((msg: ChatWSMessage) => {
    const p = msg.payload;
    switch (msg.type) {
      case "message": {
        const m = p as unknown as Message;
        if (m.channel_id === activeChannelRef.current) {
          // Deduplicate: if this is the echo of our own optimistic message, replace it
          setMessages(prev => {
            const optimisticIdx = prev.findIndex(
              msg => msg._optimistic &&
              msg.player_id === m.player_id &&
              msg.content === m.content
            );
            if (optimisticIdx !== -1) {
              // Replace optimistic with server-confirmed message
              const next = [...prev];
              next[optimisticIdx] = m;
              return next;
            }
            return [...prev, m];
          });
          // Mark as read
          api.chatUpdateRead(m.channel_id, m.id).catch(() => {});
        } else {
          setUnreadCounts(prev => ({
            ...prev,
            [m.channel_id]: (prev[m.channel_id] ?? 0) + 1,
          }));
        }
        break;
      }
      case "thread_message":
        // Update thread's last_message_at in a thread view (handled by ThreadPanel)
        break;
      case "typing": {
        const chId = p.channel_id as number;
        const pid = p.player_id as number;
        const name = p.player_name as string;
        if (chId === activeChannelRef.current) {
          setTypingPlayers(prev => ({ ...prev, [pid]: { player_name: name, ts: Date.now() } }));
        }
        break;
      }
      case "delete": {
        const msgId = p.message_id as number;
        setMessages(prev => prev.filter(m => m.id !== msgId));
        break;
      }
      case "edit": {
        const editId = p.id as number;
        const editContent = p.content as string;
        setMessages(prev => prev.map(m =>
          m.id === editId ? { ...m, content: editContent, edited_at: Math.floor(Date.now() / 1000) } : m
        ));
        break;
      }
      case "pin": {
        const pinId = p.message_id as number;
        const pinned = p.pinned as boolean;
        setMessages(prev => prev.map(m =>
          m.id === pinId ? { ...m, pinned: pinned ? 1 : 0 } : m
        ));
        break;
      }
    }
  }, []);

  // Clean up stale typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingPlayers(prev => {
        const next: typeof prev = {};
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.ts < 4000) next[Number(k)] = v;
        }
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // ── Init ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      await loadChannels();
      setLoading(false);
    })();
    connectWS();

    // Poll online players every 30s
    const pollOnline = setInterval(async () => {
      try {
        const data = await api.chatOnline();
        setOnlinePlayers(data.online);
      } catch { /* ignore */ }
    }, 30000);
    // Initial fetch
    api.chatOnline().then(d => setOnlinePlayers(d.online)).catch(() => {});

    return () => {
      clearInterval(pollOnline);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [loadChannels, connectWS]);

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  const removeMessage = useCallback((id: number) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  return {
    channels, activeChannelId, messages, loading, loadingMessages,
    unreadCounts, totalUnread, onlinePlayers, typingPlayers,
    selectChannel, sendMessage, sendTyping, loadOlder,
    loadChannels, removeMessage,
  };
}
