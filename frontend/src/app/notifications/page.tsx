'use client';

import Link from "next/link";
import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { ErrorBanner } from '@/components/layout/ErrorBanner';
import { AppIcon } from '@/components/ui/AppIcon';

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
  stakeout: 'eye',
  war: 'sword',
  loot: 'cash',
  system: 'bell',
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
  const [error, setError] = useState<string | null>(null);
  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    api.notifications()
      .then(d => {
        const data = d as { notifications: Notification[]; unread: number };
        setNotifications(data.notifications);
        setUnread(data.unread);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load notifications'))
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
            <p className="text-xs text-text-muted">Manage notification preferences in <Link href="/settings" className="text-torn-green hover:underline">Settings</Link>.</p>
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

        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-bg-card border border-text-secondary/20 rounded-xl p-4">
                <div className="h-4 w-48 bg-bg-elevated rounded mb-2" />
                <div className="h-3 w-64 bg-bg-elevated rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorBanner message={error} onRetry={loadData} />
        ) : notifications.length > 0 ? (
          <div className="space-y-2">
            {notifications.map(n => (
              <div key={n.id}
                className={`border rounded-xl p-4 transition-colors ${
                  n.read ? 'bg-bg-card border-text-secondary/10 opacity-70' : `bg-bg-card ${TYPE_COLORS[n.type] || 'border-text-secondary/20'}`
                }`}>
                <div className="flex items-start gap-2">
                  <AppIcon name={TYPE_ICONS[n.type] || 'bell'} size={19} className="text-text-muted mt-0.5" />
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
