'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { usePageVisible } from '@/hooks/usePageVisible';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { CardSkeleton } from '@/components/layout/LoadingSkeleton';
import { Avatar } from '@/components/ui/Avatar';

interface Stakeout {
  player_id: number;
  player_name: string | null;
  added_by: number;
  last_status: string;
  last_action: string;
  last_checked: number;
  last_change: number;
  notes: string;
}

function timeAgo(ts: number): string {
  if (!ts) return 'never';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'okay') return 'text-torn-green';
  if (s.includes('hospital')) return 'text-torn-red';
  if (s.includes('jail')) return 'text-warning';
  if (s.includes('travel') || s.includes('abroad')) return 'text-torn-blue';
  return 'text-text-muted';
}

function statusBg(status: string): string {
  const s = status.toLowerCase();
  if (s === 'okay') return 'bg-torn-green/10 border-torn-green/20';
  if (s.includes('hospital')) return 'bg-torn-red/10 border-torn-red/20';
  if (s.includes('jail')) return 'bg-warning/10 border-warning/20';
  if (s.includes('travel') || s.includes('abroad')) return 'bg-torn-blue/10 border-torn-blue/20';
  return 'bg-bg-card border-text-secondary/15';
}

export default function StakeoutPage() {
  const [stakeouts, setStakeouts] = useState<Stakeout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addId, setAddId] = useState('');
  const [addName, setAddName] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    api.stakeoutList()
      .then(d => setStakeouts((d as { stakeouts: Stakeout[] }).stakeouts))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = usePageVisible();

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(loadData, 15000); // Refresh every 15s
    return () => clearInterval(timer);
  }, [loadData, visible]);

  const handleAdd = async () => {
    const pid = parseInt(addId);
    if (!pid) return;
    setSubmitting(true);
    try {
      await api.stakeoutAdd({ player_id: pid, player_name: addName || undefined, notes: addNotes });
      setShowAdd(false);
      setAddId(''); setAddName(''); setAddNotes('');
      loadData();
    } catch {} finally { setSubmitting(false); }
  };

  const handleRemove = async (pid: number) => {
    await api.stakeoutRemove(pid);
    loadData();
  };

  const inputClass = "w-full bg-bg-card border border-text-secondary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50";

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Stakeout</h1>
            <p className="text-text-secondary text-sm mt-1">
              Watch specific players — get alerted when they come online or leave hospital.
              <span className="ml-2 text-text-muted">({stakeouts.length} watched)</span>
            </p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="stakeout" title="Stakeout — What's here?" bullets={[
          "Stakeout lets you watch specific players and get alerted when their status changes — like a surveillance camera on your enemies.",
          "Common use cases: wait for an enemy to leave hospital so you can attack immediately, track high-value war targets, monitor bounty targets before they go offline.",
          "The system polls each watched player every 30 seconds (15s during war) and records every status change, so you never miss a window of opportunity.",
          "Status changes are logged with timestamps — see exactly when someone came online, got hospitalized, started traveling, or went to jail.",
        ]} dataSources={["Torn API v2 user profiles, polled every 30s", "Status change notifications generated automatically"]} links={[["Torn Wiki: Profiles", "https://wiki.torn.com/wiki/Profile"]]} />

        <button onClick={() => setShowAdd(!showAdd)}
          className="px-3 py-1.5 text-sm rounded-lg bg-torn-green/20 text-torn-green font-semibold hover:bg-torn-green/30 transition-colors">
          + Add Player
        </button>

        {showAdd && (
          <div className="bg-bg-card border border-torn-green/20 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input type="number" placeholder="Player ID *" value={addId} onChange={e => setAddId(e.target.value)} className={inputClass} />
              <input type="text" placeholder="Name (optional)" value={addName} onChange={e => setAddName(e.target.value)} className={inputClass} />
              <input type="text" placeholder="Notes (optional)" value={addNotes} onChange={e => setAddNotes(e.target.value)} className={inputClass} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={!addId || submitting}
                className="px-4 py-1.5 text-sm rounded-lg bg-torn-green text-white font-medium hover:bg-torn-green-dim transition-colors disabled:opacity-50">
                {submitting ? 'Adding...' : 'Watch'}
              </button>
              <button onClick={() => setShowAdd(false)} className="px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary">Cancel</button>
            </div>
          </div>
        )}

        {loading && stakeouts.length === 0 ? (
          <CardSkeleton count={3} />
        ) : stakeouts.length > 0 ? (
          <div className="space-y-2">
            {stakeouts.map(s => (
              <div key={s.player_id} className={`border rounded-xl p-4 transition-colors ${statusBg(s.last_status)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Avatar playerId={s.player_id} name={s.player_name ?? undefined} size="sm" />
                      <a href={`https://www.torn.com/profiles.php?XID=${s.player_id}`} target="_blank" rel="noopener noreferrer"
                        className="font-semibold text-text-primary hover:text-torn-green transition-colors">
                        {s.player_name || `#${s.player_id}`}
                      </a>
                      <span className="text-[10px] text-text-muted">[{s.player_id}]</span>
                      <span className={`px-2 py-0.5 text-xs font-bold rounded ${statusColor(s.last_status)}`}>
                        {s.last_status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-text-muted">
                      {s.last_action && <span>Last action: {s.last_action}</span>}
                      {s.last_change > 0 && <span>Status changed: {timeAgo(s.last_change)}</span>}
                      {s.last_checked > 0 && <span>Checked: {timeAgo(s.last_checked)}</span>}
                    </div>
                    {s.notes && <p className="text-xs text-text-muted mt-1">{s.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a href={`https://www.torn.com/loader.php?sid=attack&user2ID=${s.player_id}`} target="_blank" rel="noopener noreferrer"
                      className="px-2 py-1 text-xs rounded-md bg-torn-red/15 text-torn-red hover:bg-torn-red/25 transition-colors font-medium">
                      Attack
                    </a>
                    <button onClick={() => handleRemove(s.player_id)}
                      className="px-2 py-1 text-xs rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors">
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
            No players being watched. Add a player ID to start tracking.
          </div>
        )}
      </div>
    </div>
  );
}
