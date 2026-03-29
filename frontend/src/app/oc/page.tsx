'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';

interface Participant {
  player_id: number;
  player_name: string;
  role: string;
  checkpoint_pass_rate: number;
  planning_complete: boolean;
}

interface Crime {
  id: number;
  name: string;
  status: string;
  difficulty: string;
  initiated_at: number;
  executed_at: number;
  ready_at: number;
  success: boolean | null;
  money_gain: number;
  respect_gain: number;
  participants: Participant[];
  participant_count: number;
}

interface OCData {
  crimes: Crime[];
  count: number;
  category: string;
}

type Tab = 'planning' | 'completed';

function timeAgo(ts: number): string {
  if (!ts) return '—';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtMoney(n: number): string {
  if (!n) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function tornProfile(id: number) {
  return `https://www.torn.com/profiles.php?XID=${id}`;
}

export default function OCPage() {
  const [tab, setTab] = useState<Tab>('planning');
  const [data, setData] = useState<OCData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadData = useCallback((cat?: string) => {
    setLoading(true);
    api.ocOverview(cat || tab)
      .then(d => setData(d as OCData))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { loadData(); }, [loadData]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setExpandedId(null);
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">OC Planner</h1>
            <p className="text-text-secondary text-sm mt-1">Organized Crime coordination and history.</p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="oc" title="OC Planner — What's here?" bullets={[
          "Planning: crimes currently being organized — who's in what role, readiness status.",
          "Completed: recent OC results with money earned, respect, and success/fail.",
          "Click a crime to see participant roles and checkpoint pass rates.",
          "Data from Torn API v2 faction crimes endpoint.",
        ]} />

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border">
          {([['planning', 'Planning'], ['completed', 'Completed']] as const).map(([key, label]) => (
            <button key={key} onClick={() => switchTab(key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key ? 'border-torn-green text-torn-green' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}>
              {label} {data?.category === key ? `(${data.count})` : ''}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-text-secondary text-sm animate-pulse">Loading OC data...</p>
        ) : data && data.crimes.length > 0 ? (
          <div className="space-y-2">
            {data.crimes.map(crime => {
              const isOpen = expandedId === crime.id;
              return (
                <div key={crime.id} className="bg-bg-card border border-text-secondary/15 rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedId(isOpen ? null : crime.id)}
                    className="w-full text-left p-4 hover:bg-bg-elevated/50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-text-primary">{crime.name}</span>
                          {crime.difficulty && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-bg-elevated text-text-muted font-medium">
                              {crime.difficulty}
                            </span>
                          )}
                          {crime.success !== null && (
                            <span className={`px-1.5 py-0.5 text-[10px] rounded font-bold ${
                              crime.success ? 'bg-torn-green/15 text-torn-green' : 'bg-danger/15 text-danger'
                            }`}>
                              {crime.success ? 'SUCCESS' : 'FAILED'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">
                          {crime.participant_count} participants
                          {crime.initiated_at ? ` · Started ${timeAgo(crime.initiated_at)}` : ''}
                          {crime.executed_at ? ` · Executed ${timeAgo(crime.executed_at)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {(crime.money_gain > 0 || crime.respect_gain > 0) && (
                          <div className="text-right">
                            {crime.money_gain > 0 && <p className="text-sm font-semibold text-torn-green">{fmtMoney(crime.money_gain)}</p>}
                            {crime.respect_gain > 0 && <p className="text-[10px] text-text-muted">+{crime.respect_gain.toFixed(1)} respect</p>}
                          </div>
                        )}
                        <span className="text-text-muted text-xs">{isOpen ? '▾' : '▸'}</span>
                      </div>
                    </div>
                  </button>

                  {isOpen && crime.participants.length > 0 && (
                    <div className="border-t border-border-light px-4 pb-3">
                      <table className="w-full text-sm mt-2">
                        <thead>
                          <tr className="text-left text-text-muted text-xs uppercase tracking-wider">
                            <th className="py-1.5 pr-3">Member</th>
                            <th className="py-1.5 pr-3">Role</th>
                            <th className="py-1.5 pr-3 text-right">CPR</th>
                            <th className="py-1.5 text-right">Planning</th>
                          </tr>
                        </thead>
                        <tbody>
                          {crime.participants.map(p => (
                            <tr key={p.player_id} className="border-t border-border-light/50">
                              <td className="py-1.5 pr-3">
                                <a href={tornProfile(p.player_id)} target="_blank"
                                  className="text-text-primary hover:text-torn-green transition-colors">
                                  {p.player_name || `#${p.player_id}`}
                                </a>
                              </td>
                              <td className="py-1.5 pr-3 text-text-secondary">{p.role || '—'}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">
                                {p.checkpoint_pass_rate > 0 ? (
                                  <span className={p.checkpoint_pass_rate >= 80 ? 'text-torn-green' : p.checkpoint_pass_rate >= 50 ? 'text-torn-yellow' : 'text-danger'}>
                                    {p.checkpoint_pass_rate}%
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="py-1.5 text-right">
                                {p.planning_complete
                                  ? <span className="text-torn-green text-xs">Done</span>
                                  : <span className="text-text-muted text-xs">In progress</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
            No {tab} crimes found.
          </div>
        )}
      </div>
    </div>
  );
}
