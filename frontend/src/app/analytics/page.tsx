'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { useSort } from '@/hooks/useSort';
import { SortableHeader } from '@/components/layout/SortableHeader';
import { ExportButton } from '@/components/layout/ExportButton';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';

interface TopAttacker {
  attacker_id: number;
  attacker_name: string;
  total_hits: number;
  total_respect: number;
  wins: number;
  losses: number;
  active_days: number;
}

interface DailyBucket {
  bucket_start: number;
  hits: number;
  respect: number;
  wins: number;
  losses: number;
  active_members: number;
}

interface AnalyticsData {
  period_days: number;
  top_attackers: TopAttacker[];
  daily_timeline: DailyBucket[];
}

function fmtResp(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(1);
}

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const loadData = useCallback(() => {
    setLoading(true);
    api.chainAnalytics(days)
      .then(d => setData(d as AnalyticsData))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { loadData(); }, [loadData]);

  const top = data?.top_attackers || [];
  const timeline = data?.daily_timeline || [];
  const { sorted, sortCol, sortDir, toggle } = useSort(top, 'total_respect');

  const totalHits = timeline.reduce((s, t) => s + t.hits, 0);
  const totalRespect = timeline.reduce((s, t) => s + t.respect, 0);
  const totalWins = timeline.reduce((s, t) => s + t.wins, 0);
  const maxDayHits = Math.max(...timeline.map(t => t.hits), 1);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Faction Analytics</h1>
            <p className="text-text-secondary text-sm mt-1">Attack trends and member contributions.</p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="analytics" title="Faction Analytics — What's here?" bullets={[
          "Top attackers ranked by respect earned — see who's contributing most to faction growth.",
          "Daily attack chart shows faction activity over time — spot patterns and quiet periods.",
          "Use the period selector to focus on recent days or broader trends.",
          "Active days shows how consistently each member attacks — more days = more reliable.",
        ]}
        dataSources={["Attack log from Torn API, stored locally"]}
        />

        {/* Period selector */}
        <div className="flex gap-2 items-center">
          <span className="text-xs text-text-muted">Period:</span>
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                days === d ? 'bg-torn-green/20 text-torn-green font-semibold' : 'bg-bg-card text-text-secondary hover:bg-bg-elevated'
              }`}>
              {d}d
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-text-secondary text-sm animate-pulse">Loading analytics...</p>
        ) : data ? (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-text-primary">{totalHits}</p>
                <p className="text-[10px] text-text-muted uppercase">Total Attacks</p>
              </div>
              <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-torn-green">{fmtResp(totalRespect)}</p>
                <p className="text-[10px] text-text-muted uppercase">Respect Earned</p>
              </div>
              <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-text-primary">{totalWins}</p>
                <p className="text-[10px] text-text-muted uppercase">Wins</p>
              </div>
              <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-text-primary">{top.length}</p>
                <p className="text-[10px] text-text-muted uppercase">Active Members</p>
              </div>
            </div>

            {/* Daily chart */}
            {timeline.length > 0 && (
              <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-3">Daily Attack Activity</h3>
                <div className="flex gap-1 h-28">
                  {timeline.map(t => {
                    const pct = (t.hits / maxDayHits) * 100;
                    return (
                      <div key={t.bucket_start} className="flex-1 flex flex-col items-center justify-end h-full group"
                        title={`${fmtDate(t.bucket_start)}: ${t.hits} attacks, ${fmtResp(t.respect)} respect, ${t.active_members} members`}>
                        <div className="w-full bg-torn-green/60 hover:bg-torn-green rounded-t transition-colors"
                          style={{ height: `${Math.max(4, pct)}%` }} />
                        <span className="text-[8px] text-text-muted mt-1">{fmtDate(t.bucket_start)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top attackers table */}
            {sorted.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text-primary">Top Attackers</h3>
                  <ExportButton rows={sorted as unknown as Record<string, unknown>[]}
                    columns={[
                      { key: 'attacker_name', label: 'Name' },
                      { key: 'total_hits', label: 'Hits' },
                      { key: 'wins', label: 'Wins' },
                      { key: 'losses', label: 'Losses' },
                      { key: 'total_respect', label: 'Respect' },
                      { key: 'active_days', label: 'Active Days' },
                    ]} filename="tm-hub-analytics.csv" />
                </div>
                <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                          <th className="py-2 px-3 w-8">#</th>
                          <SortableHeader label="Member" column="attacker_name" currentCol={sortCol} currentDir={sortDir} onSort={toggle} />
                          <SortableHeader label="Hits" column="total_hits" currentCol={sortCol} currentDir={sortDir} onSort={toggle} className="text-right" />
                          <SortableHeader label="Wins" column="wins" currentCol={sortCol} currentDir={sortDir} onSort={toggle} className="text-right" />
                          <SortableHeader label="Losses" column="losses" currentCol={sortCol} currentDir={sortDir} onSort={toggle} className="text-right" />
                          <SortableHeader label="Respect" column="total_respect" currentCol={sortCol} currentDir={sortDir} onSort={toggle} className="text-right" />
                          <SortableHeader label="Active Days" column="active_days" currentCol={sortCol} currentDir={sortDir} onSort={toggle} className="text-right" />
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((m, i) => (
                          <tr key={m.attacker_id} className="border-b border-border-light hover:bg-bg-elevated/50 transition-colors">
                            <td className="py-1.5 px-3 text-text-muted text-xs">{i + 1}</td>
                            <td className="py-1.5 px-3">
                              <a href={`https://www.torn.com/profiles.php?XID=${m.attacker_id}`} target="_blank"
                                className="font-medium text-text-primary hover:text-torn-green transition-colors">
                                {m.attacker_name || `#${m.attacker_id}`}
                              </a>
                            </td>
                            <td className="py-1.5 px-3 text-right tabular-nums">{m.total_hits}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-torn-green">{m.wins}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-danger">{m.losses}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums font-medium text-torn-green">{fmtResp(m.total_respect)}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-text-muted">{m.active_days}/{days}d</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
