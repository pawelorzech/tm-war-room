'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { StatCardsSkeleton, TableSkeleton } from '@/components/layout/LoadingSkeleton';

interface ReviveMember {
  reviver_id: number;
  reviver_name: string;
  revives_given: number;
  revives_received: number;
  successes: number;
  failures: number;
}

interface Revive {
  reviver_id: number;
  reviver_name: string;
  target_id: number;
  target_name: string;
  result: string;
  chance: number;
  timestamp: number;
}

interface ReviveData {
  revives: Revive[];
  members: ReviveMember[];
  total_revives: number;
  total_success: number;
  total_fail: number;
}

type Tab = 'leaderboard' | 'recent';

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function tornProfile(id: number) {
  return `https://www.torn.com/profiles.php?XID=${id}`;
}

export default function RevivesPage() {
  const [data, setData] = useState<ReviveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('leaderboard');

  const loadData = () => {
    setLoading(true);
    api.revives().then(d => setData(d as ReviveData))
      .catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const activeMembers = useMemo(() => {
    if (!data) return [];
    return data.members.filter(m => m.revives_given > 0);
  }, [data]);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Revive Tracker</h1>
            <p className="text-text-secondary text-sm mt-1">Faction revive stats and recent activity.</p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="revives" title="Revive Tracker — What's here?" bullets={[
          "Reviving restores a player from the hospital — it costs 25 energy and has a success chance based on your medical items and the target's injuries. In war, fast revives keep your team fighting.",
          "Tracking revives matters because revivers are your faction's lifeline during ranked wars. Knowing who's actively reviving helps leadership coordinate and recognize key contributors.",
          "Revive contracts let you hire external revivers (like NPC hospitals or revive services) — useful when your faction's own revivers are hospitalized or offline.",
          "Faction revive coordination is critical: assign dedicated revivers, ensure they have medical items stocked, and track who's pulling their weight on the leaderboard.",
          "A player is only 'revivable' if they have revives enabled in their Torn settings. Some players disable this — you cannot revive them no matter what.",
          "Revives cost 25 energy in a reviving faction, 75 energy without — joining a medical faction makes it worthwhile.",
          "Standard revive price: ~1M cash or 1 Xanax per revive.",
          "Brain Surgeon unlock path: Medical job, then 10K intel, 4K endurance, 2.6K manual labor, and ~25 days to reach.",
          "You keep the revive passive after leaving the medical job — train stats there, then move to a better company.",
        ]} dataSources={["Torn API v2 faction revives", "Recent revive activity from attack logs"]} links={[["Torn Wiki: Reviving", "https://wiki.torn.com/wiki/Revive"], ["Torn Wiki: Medical", "https://wiki.torn.com/wiki/Medical"]]} />

        {loading && !data ? (
          <>
            <StatCardsSkeleton count={3} />
            <TableSkeleton rows={8} cols={6} />
          </>
        ) : data ? (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total Revives', value: data.total_revives, color: 'text-text-primary' },
                { label: 'Successful', value: data.total_success, color: 'text-torn-green' },
                { label: 'Failed', value: data.total_fail, color: 'text-danger' },
              ].map(c => (
                <div key={c.label} className="bg-bg-card border border-text-secondary/20 rounded-lg p-3 text-center">
                  <p className="text-xs text-text-secondary">{c.label}</p>
                  <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
              {([['leaderboard', 'Leaderboard'], ['recent', 'Recent Revives']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${tab === key ? 'bg-torn-green/20 text-torn-green font-semibold' : 'text-text-secondary hover:text-text-primary'}`}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'leaderboard' ? (
              activeMembers.length > 0 ? (
                <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                          <th className="py-2 px-3">#</th>
                          <th className="py-2 px-3">Member</th>
                          <th className="py-2 px-3">Given</th>
                          <th className="py-2 px-3">Received</th>
                          <th className="py-2 px-3">Success</th>
                          <th className="py-2 px-3">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeMembers.map((m, i) => {
                          const rate = m.revives_given > 0 ? ((m.successes / m.revives_given) * 100).toFixed(0) : '0';
                          return (
                            <tr key={m.reviver_id} className="border-b border-border-light hover:bg-bg-elevated/50 transition-colors">
                              <td className="py-1.5 px-3 text-text-muted">{i + 1}</td>
                              <td className="py-1.5 px-3">
                                <a href={tornProfile(m.reviver_id)} target="_blank" rel="noopener noreferrer"
                                  className="text-text-primary hover:text-torn-green">{m.reviver_name || `#${m.reviver_id}`}</a>
                              </td>
                              <td className="py-1.5 px-3 font-semibold text-torn-green">{m.revives_given}</td>
                              <td className="py-1.5 px-3 text-text-secondary">{m.revives_received}</td>
                              <td className="py-1.5 px-3">{m.successes}<span className="text-text-muted">/{m.revives_given}</span></td>
                              <td className="py-1.5 px-3">
                                <span className={Number(rate) >= 80 ? 'text-torn-green' : Number(rate) >= 50 ? 'text-torn-yellow' : 'text-danger'}>
                                  {rate}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
                  No revive data available.
                </div>
              )
            ) : (
              data.revives.length > 0 ? (
                <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                          <th className="py-2 px-3">Reviver</th>
                          <th className="py-2 px-3">Target</th>
                          <th className="py-2 px-3">Result</th>
                          <th className="py-2 px-3">Chance</th>
                          <th className="py-2 px-3">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.revives.map((r, i) => (
                          <tr key={`${r.timestamp}-${i}`} className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors ${r.result !== 'success' ? 'bg-danger/5' : ''}`}>
                            <td className="py-1.5 px-3">
                              <a href={tornProfile(r.reviver_id)} target="_blank" rel="noopener noreferrer" className="text-text-primary hover:text-torn-green">
                                {r.reviver_name || `#${r.reviver_id}`}
                              </a>
                            </td>
                            <td className="py-1.5 px-3">
                              <a href={tornProfile(r.target_id)} target="_blank" rel="noopener noreferrer" className="text-text-primary hover:text-torn-green">
                                {r.target_name || `#${r.target_id}`}
                              </a>
                            </td>
                            <td className={`py-1.5 px-3 font-medium ${r.result === 'success' ? 'text-torn-green' : 'text-danger'}`}>
                              {r.result === 'success' ? 'Success' : 'Failed'}
                            </td>
                            <td className="py-1.5 px-3 text-text-muted">{r.chance > 0 ? `${r.chance}%` : '—'}</td>
                            <td className="py-1.5 px-3 text-text-muted text-xs">{timeAgo(r.timestamp)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
                  No recent revives found.
                </div>
              )
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
