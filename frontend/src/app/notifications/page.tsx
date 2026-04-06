'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { usePushNotifications, PushPreferences } from '@/hooks/usePushNotifications';
import { usePDA } from '@/contexts/PDAContext';

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  read: number;
  created_at: number;
}

const TYPE_ICONS: Record<string, string> = {
  stakeout: '\uD83D\uDC41\uFE0F',
  war: '\u2694\uFE0F',
  loot: '\uD83D\uDCB0',
  system: '\u2139\uFE0F',
};

const TYPE_COLORS: Record<string, string> = {
  stakeout: 'border-torn-blue/20',
  war: 'border-torn-red/20',
  loot: 'border-torn-yellow/20',
  system: 'border-text-secondary/20',
};

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const push = usePushNotifications();
  const { isPDA } = usePDA();

  const loadData = useCallback(() => {
    setLoading(true);
    api.notifications()
      .then(d => {
        const data = d as { notifications: Notification[]; unread: number };
        setNotifications(data.notifications);
        setUnread(data.unread);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMarkAllRead = async () => {
    await api.notificationsReadAll();
    setUnread(0);
    setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-text-secondary text-sm mt-1">
              {unread > 0 ? `${unread} unread` : 'All caught up'}
            </p>
          </div>
          <div className="flex gap-2">
            {unread > 0 && (
              <button onClick={handleMarkAllRead}
                className="px-3 py-1.5 text-xs rounded-lg text-text-secondary hover:text-text-primary border border-text-secondary/20 hover:border-text-secondary/40 transition-colors">
                Mark all read
              </button>
            )}
            <RefreshButton onRefresh={loadData} />
          </div>
        </div>

        {/* Push Notification Settings */}
        <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Push Notifications</h2>
              <p className="text-[10px] text-text-muted mt-0.5">
                {isPDA ? 'Native notifications via Torn PDA.' : 'Get alerts even when the app is closed.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isPDA ? (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-green/15 text-torn-green font-medium">Connected via PDA</span>
              ) : push.permission === 'granted' && push.subscribed ? (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-green/15 text-torn-green font-medium">Enabled</span>
              ) : push.permission === 'denied' ? (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-red/15 text-torn-red font-medium">Blocked</span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-torn-yellow/15 text-torn-yellow font-medium">Disabled</span>
              )}
            </div>
          </div>

          {isPDA ? (
            <div className="space-y-2">
              <p className="text-[10px] text-text-muted uppercase">Notify me about:</p>
              {[
                { key: 'loot_level4' as const, label: 'NPC Loot Level 4+', desc: 'When an NPC reaches loot level 4 or higher' },
                { key: 'war_start' as const, label: 'War Started', desc: 'When a ranked war begins' },
                { key: 'stakeout_change' as const, label: 'Stakeout Alert', desc: 'When a stakeout target changes status' },
              ].map(({ key, label, desc }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={push.preferences[key]}
                    onChange={() => push.updatePreferences({ ...push.preferences, [key]: !push.preferences[key] })}
                    className="w-4 h-4 rounded border-text-secondary/30 text-torn-green focus:ring-torn-green/50" />
                  <div>
                    <p className="text-xs font-medium text-text-primary group-hover:text-torn-green transition-colors">{label}</p>
                    <p className="text-[10px] text-text-muted">{desc}</p>
                  </div>
                </label>
              ))}
              <div className="pt-2 border-t border-border-light">
                <p className="text-[10px] text-text-muted">Notifications are delivered as native PDA alerts while the hub is open in a tab.</p>
              </div>
            </div>
          ) : !push.supported ? (
            <p className="text-xs text-text-muted">Push notifications are not supported in this browser.</p>
          ) : push.permission === 'denied' ? (
            <div className="bg-torn-red/5 border border-torn-red/20 rounded-lg p-3 text-xs text-text-secondary">
              <p className="font-medium text-torn-red mb-1">Notifications blocked</p>
              <p>You previously denied notification permission. To re-enable: click the lock icon in your browser&apos;s address bar &rarr; Notifications &rarr; Allow.</p>
            </div>
          ) : !push.subscribed ? (
            <button onClick={push.subscribe}
              className="px-4 py-2 text-sm rounded-lg bg-torn-green/15 text-torn-green font-medium hover:bg-torn-green/25 transition-colors">
              Enable Push Notifications
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] text-text-muted uppercase">Notify me about:</p>
              {[
                { key: 'loot_level4' as const, label: 'NPC Loot Level 4+', desc: 'When an NPC reaches loot level 4 or higher' },
                { key: 'war_start' as const, label: 'War Started', desc: 'When a ranked war begins' },
                { key: 'stakeout_change' as const, label: 'Stakeout Alert', desc: 'When a stakeout target changes status' },
              ].map(({ key, label, desc }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={push.preferences[key]}
                    onChange={() => push.updatePreferences({ ...push.preferences, [key]: !push.preferences[key] })}
                    className="w-4 h-4 rounded border-text-secondary/30 text-torn-green focus:ring-torn-green/50" />
                  <div>
                    <p className="text-xs font-medium text-text-primary group-hover:text-torn-green transition-colors">{label}</p>
                    <p className="text-[10px] text-text-muted">{desc}</p>
                  </div>
                </label>
              ))}
              <div className="flex gap-2 pt-2 border-t border-border-light">
                <button onClick={push.sendTest}
                  className="px-3 py-1 text-[10px] rounded text-text-secondary hover:text-text-primary border border-text-secondary/20 hover:border-text-secondary/40 transition-colors">
                  Send Test
                </button>
                <button onClick={push.unsubscribe}
                  className="px-3 py-1 text-[10px] rounded text-danger hover:text-danger/80 border border-danger/20 hover:border-danger/40 transition-colors">
                  Disable Push
                </button>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-bg-card border border-text-secondary/20 rounded-xl p-4">
                <div className="h-4 w-48 bg-bg-elevated rounded mb-2" />
                <div className="h-3 w-64 bg-bg-elevated rounded" />
              </div>
            ))}
          </div>
        ) : notifications.length > 0 ? (
          <div className="space-y-2">
            {notifications.map(n => (
              <div key={n.id}
                className={`border rounded-xl p-4 transition-colors ${
                  n.read ? 'bg-bg-card border-text-secondary/10 opacity-70' : `bg-bg-card ${TYPE_COLORS[n.type] || 'border-text-secondary/20'}`
                }`}>
                <div className="flex items-start gap-2">
                  <span className="text-lg shrink-0">{TYPE_ICONS[n.type] || '\uD83D\uDD14'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium ${n.read ? 'text-text-secondary' : 'text-text-primary'}`}>{n.title}</p>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-torn-green shrink-0" />}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">{n.message}</p>
                    <p className="text-[10px] text-text-muted mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-8 text-center text-text-secondary">
            <p className="text-lg mb-1">No notifications yet</p>
            <p className="text-xs text-text-muted">Notifications appear when stakeout targets change status or wars start/end.</p>
          </div>
        )}
      </div>
    </div>
  );
}
