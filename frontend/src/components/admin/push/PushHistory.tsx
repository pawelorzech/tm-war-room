'use client';

import { useState, useEffect } from 'react';

interface Event {
  id: number;
  title: string;
  body: string;
  url: string | null;
  target_type: string;
  target_value: string | null;
  sent_by: string;
  created_at: string;
}

interface Delivery {
  id: number;
  player_id: number;
  channel: string;
  status: string;
  error_message: string | null;
  delivered_at: string | null;
}

interface EventDetail {
  event: Event;
  deliveries: Delivery[];
  stats: { delivered: number; pending: number; failed: number };
}

interface PushHistoryProps {
  adminFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}

export function PushHistory({ adminFetch }: PushHistoryProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch<{ events: Event[] }>('/api/admin/push/history')
      .then(d => setEvents(d.events))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [adminFetch]);

  const viewDetail = async (eventId: number) => {
    const d = await adminFetch<EventDetail>(`/api/admin/push/history/${eventId}`);
    setDetail(d);
  };

  if (loading) return <p className="text-text-secondary">Loading history...</p>;

  if (detail) {
    return (
      <div className="space-y-4">
        <button onClick={() => setDetail(null)} className="text-xs text-torn-blue hover:underline">&larr; Back to history</button>
        <div className="bg-bg-elevated rounded-lg border border-border p-4">
          <h4 className="text-sm font-semibold text-text-primary">{detail.event.title}</h4>
          <p className="text-xs text-text-secondary mt-1">{detail.event.body}</p>
          <div className="flex gap-4 mt-3 text-[10px] text-text-muted">
            <span>Target: {detail.event.target_type}{detail.event.target_value ? `:${detail.event.target_value}` : ''}</span>
            <span>Sent by: {detail.event.sent_by}</span>
            <span>{detail.event.created_at}</span>
          </div>
          <div className="flex gap-4 mt-2">
            <span className="text-xs text-torn-green">{detail.stats.delivered} delivered</span>
            <span className="text-xs text-torn-yellow">{detail.stats.pending} pending</span>
            <span className="text-xs text-torn-red">{detail.stats.failed} failed</span>
          </div>
        </div>

        <div className="space-y-1">
          {detail.deliveries.map(d => (
            <div key={d.id} className="flex items-center gap-3 bg-bg-elevated rounded border border-border px-3 py-2 text-xs">
              <span className="text-text-primary font-mono">{d.player_id}</span>
              <span className="text-text-muted">{d.channel}</span>
              <span className={d.status === 'delivered' ? 'text-torn-green' : d.status === 'failed' ? 'text-torn-red' : 'text-torn-yellow'}>
                {d.status}
              </span>
              {d.error_message && <span className="text-torn-red text-[10px]">{d.error_message}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-text-primary">Notification History</h3>
      {events.length === 0 ? (
        <p className="text-sm text-text-muted">No notifications sent yet.</p>
      ) : (
        <div className="space-y-2">
          {events.map(e => (
            <button key={e.id} onClick={() => viewDetail(e.id)}
              className="w-full text-left bg-bg-elevated rounded-lg border border-border p-3 hover:border-text-secondary/40 transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-text-primary">{e.title}</p>
                <span className="text-[10px] text-text-muted">{e.created_at}</span>
              </div>
              <div className="flex gap-3 mt-1 text-[10px] text-text-muted">
                <span>{e.target_type}{e.target_value ? `:${e.target_value}` : ''}</span>
                <span>by {e.sent_by}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
