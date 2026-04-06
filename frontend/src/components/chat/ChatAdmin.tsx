"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import type { Channel, Bot } from "@/types/chat";

interface Props {
  channels: Channel[];
  onChannelCreated: () => void;
}

export function ChatAdmin({ channels, onChannelCreated }: Props) {
  const [bots, setBots] = useState<Bot[]>([]);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [showNewBot, setShowNewBot] = useState(false);
  const [newBotToken, setNewBotToken] = useState<string | null>(null);

  // Channel form
  const [chName, setChName] = useState("");
  const [chDesc, setChDesc] = useState("");
  const [chType, setChType] = useState<"chat" | "forum">("chat");
  const [chAdminOnly, setChAdminOnly] = useState(false);

  // Bot form
  const [botName, setBotName] = useState("");
  const [botChannels, setBotChannels] = useState("*");

  const loadBots = useCallback(async () => {
    try {
      const data = await api.chatBotsList();
      setBots(data.bots);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadBots(); }, [loadBots]);

  const handleCreateChannel = async () => {
    if (!chName.trim()) return;
    try {
      await api.chatCreateChannel({
        name: chName.trim().toLowerCase().replace(/\s+/g, "-"),
        description: chDesc.trim(),
        type: chType,
        admin_only: chAdminOnly,
      });
      setChName(""); setChDesc(""); setShowNewChannel(false);
      onChannelCreated();
    } catch { /* ignore */ }
  };

  const handleDeleteChannel = async (channelId: number) => {
    if (!confirm("Delete this channel and all its messages?")) return;
    try {
      await api.chatDeleteChannel(channelId);
      onChannelCreated();
    } catch { /* ignore */ }
  };

  const handleCreateBot = async () => {
    if (!botName.trim()) return;
    try {
      const data = await api.chatCreateBot(botName.trim(), botChannels);
      setNewBotToken(data.token);
      setBotName(""); setShowNewBot(false);
      loadBots();
    } catch { /* ignore */ }
  };

  const handleDeleteBot = async (botId: number) => {
    if (!confirm("Revoke this bot?")) return;
    try {
      await api.chatDeleteBot(botId);
      loadBots();
    } catch { /* ignore */ }
  };

  return (
    <div className="p-4 space-y-6">
      {/* Channels */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-text-primary">Channels</h3>
          <button
            onClick={() => setShowNewChannel(!showNewChannel)}
            className="text-xs px-2 py-1 bg-torn-green text-bg-primary rounded"
          >
            {showNewChannel ? "Cancel" : "Add Channel"}
          </button>
        </div>
        {showNewChannel && (
          <div className="border border-border rounded p-3 mb-3 space-y-2">
            <input value={chName} onChange={e => setChName(e.target.value)}
              placeholder="Channel name" className="w-full bg-bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary" />
            <input value={chDesc} onChange={e => setChDesc(e.target.value)}
              placeholder="Description" className="w-full bg-bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary" />
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1 text-text-secondary">
                <input type="radio" checked={chType === "chat"} onChange={() => setChType("chat")} /> Chat
              </label>
              <label className="flex items-center gap-1 text-text-secondary">
                <input type="radio" checked={chType === "forum"} onChange={() => setChType("forum")} /> Forum
              </label>
              <label className="flex items-center gap-1 text-text-secondary">
                <input type="checkbox" checked={chAdminOnly} onChange={e => setChAdminOnly(e.target.checked)} /> Admin only
              </label>
            </div>
            <button onClick={handleCreateChannel} className="text-xs px-2 py-1 bg-torn-green text-bg-primary rounded">
              Create
            </button>
          </div>
        )}
        <div className="space-y-1">
          {channels.map(ch => (
            <div key={ch.id} className="flex items-center justify-between p-2 bg-bg-elevated rounded text-sm">
              <div>
                <span className="text-text-primary font-medium">#{ch.name}</span>
                <span className="text-text-muted ml-2 text-xs">{ch.type}</span>
                {ch.admin_only === 1 && <span className="text-torn-yellow ml-2 text-xs">admin-only</span>}
              </div>
              <button onClick={() => handleDeleteChannel(ch.id)} className="text-xs text-torn-red hover:underline">
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Bots */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-text-primary">Bots</h3>
          <button
            onClick={() => setShowNewBot(!showNewBot)}
            className="text-xs px-2 py-1 bg-torn-green text-bg-primary rounded"
          >
            {showNewBot ? "Cancel" : "Add Bot"}
          </button>
        </div>
        {newBotToken && (
          <div className="border border-torn-green/30 bg-torn-green/5 rounded p-3 mb-3">
            <div className="text-xs text-text-muted mb-1">Bot token (copy now, shown only once):</div>
            <code className="text-xs text-torn-green break-all select-all">{newBotToken}</code>
            <button onClick={() => setNewBotToken(null)} className="block mt-2 text-xs text-text-muted hover:underline">
              Dismiss
            </button>
          </div>
        )}
        {showNewBot && (
          <div className="border border-border rounded p-3 mb-3 space-y-2">
            <input value={botName} onChange={e => setBotName(e.target.value)}
              placeholder="Bot name (e.g. Revive Bot)" className="w-full bg-bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary" />
            <input value={botChannels} onChange={e => setBotChannels(e.target.value)}
              placeholder='Allowed channels (* for all, or [1,2,3])' className="w-full bg-bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary" />
            <button onClick={handleCreateBot} className="text-xs px-2 py-1 bg-torn-green text-bg-primary rounded">
              Create Bot
            </button>
          </div>
        )}
        <div className="space-y-1">
          {bots.map(bot => (
            <div key={bot.id} className="flex items-center justify-between p-2 bg-bg-elevated rounded text-sm">
              <div>
                <span className="text-torn-blue font-medium">{bot.name}</span>
                <span className="text-[10px] ml-1 px-1 rounded bg-torn-blue/20 text-torn-blue">BOT</span>
                {bot.active === 0 && <span className="text-torn-red ml-2 text-xs">inactive</span>}
              </div>
              <button onClick={() => handleDeleteBot(bot.id)} className="text-xs text-torn-red hover:underline">
                Revoke
              </button>
            </div>
          ))}
          {bots.length === 0 && <div className="text-xs text-text-muted">No bots created yet.</div>}
        </div>
      </section>
    </div>
  );
}
