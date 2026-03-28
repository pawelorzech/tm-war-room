'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api-client';

interface ChainMember {
  attacker_id: number;
  attacker_name: string;
  hits: number;
  wins: number;
  losses: number;
  total_respect: number;
  max_chain: number;
  last_attack: number;
}

interface ChainReport {
  period_hours: number;
  members: ChainMember[];
  total_hits: number;
  total_respect: number;
  member_count: number;
  attacks_in_db: number;
}

interface RecentAttack {
  id: number;
  attacker_name: string;
  defender_name: string;
  defender_faction_name: string | null;
  result: string;
  respect_gain: number;
  chain: number;
  started: number;
}

function fmtResp(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toFixed(1);
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const RESULT_COLOR: Record<string, string> = {
  Hospitalized: 'text-torn-green', Attacked: 'text-torn-green', Mugged: 'text-torn-green',
  Lost: 'text-danger', Stalemate: 'text-warning', Assist: 'text-blue-400', Escape: 'text-text-muted',
};

type SortCol = 'hits' | 'wins' | 'losses' | 'total_respect' | 'max_chain' | 'last_attack';

export default function ChainPage() {
  const [report, setReport] = useState<ChainReport | null>(null);
  const [recent, setRecent] = useState<RecentAttack[]>([]);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'report' | 'recent'>('report');
  const [sortCol, setSortCol] = useState<SortCol>('total_respect');
  const [sortAsc, setSortAsc] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.chainReport(hours),
      api.chainRecent(100),
    ]).then(([r, a]) => {
      setReport(r as ChainReport);
      setRecent((a as { attacks: RecentAttack[] }).attacks);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [hours]);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };
  const Arrow = ({ col }: { col: SortCol }) =>
    sortCol === col ? <span className="ml-1 text-torn-green">{sortAsc ? '▲' : '▼'}</span> : null;

  const sorted = useMemo(() => {
    if (!report) return [];
    return [...report.members].sort((a, b) => {
      const va = a[sortCol] ?? 0;
      const vb = b[sortCol] ?? 0;
      return sortAsc ? va - vb : vb - va;
    });
  }, [report, sortCol, sortAsc]);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Chain Tracker</h1>
          <p className="text-text-secondary text-sm mt-1">Track faction attacks, chain hits, and respect earned per member.</p>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            {(['report', 'recent'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${tab === t ? 'bg-torn-green/20 text-torn-green font-semibold' : 'text-text-secondary hover:text-text-primary'}`}>
                {t === 'report' ? 'Chain Report' : 'Recent Attacks'}
              </button>
            ))}
          </div>
          {tab === 'report' && (
            <select value={hours} onChange={e => setHours(Number(e.target.value))}
              className="bg-bg-card border border-text-secondary/30 rounded-lg px-3 py-1.5 text-sm text-text-primary">
              <option value={6}>Last 6h</option>
              <option value={12}>Last 12h</option>
              <option value={24}>Last 24h</option>
              <option value={48}>Last 48h</option>
              <option value={168}>Last 7 days</option>
            </select>
          )}
        </div>

        {loading && !report ? (
          <div className="text-text-secondary text-sm animate-pulse">Loading attack data...</div>
        ) : tab === 'report' && report ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Hits', value: report.total_hits, color: 'text-text-primary' },
                { label: 'Total Respect', value: fmtResp(report.total_respect), color: 'text-torn-green' },
                { label: 'Active Members', value: report.member_count, color: 'text-text-primary' },
                { label: 'In Database', value: report.attacks_in_db, color: 'text-text-muted' },
              ].map(c => (
                <div key={c.label} className="bg-bg-card border border-text-secondary/20 rounded-lg p-3 text-center">
                  <p className="text-xs text-text-secondary">{c.label}</p>
                  <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                </div>
              ))}
            </div>

            {sorted.length > 0 ? (
              <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Member</th>
                        <th className="py-2 px-3 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('hits')}>Hits<Arrow col="hits" /></th>
                        <th className="py-2 px-3 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('wins')}>Wins<Arrow col="wins" /></th>
                        <th className="py-2 px-3 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('losses')}>Losses<Arrow col="losses" /></th>
                        <th className="py-2 px-3 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('total_respect')}>Respect<Arrow col="total_respect" /></th>
                        <th className="py-2 px-3 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('max_chain')}>Best Chain<Arrow col="max_chain" /></th>
                        <th className="py-2 px-3 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('last_attack')}>Last Hit<Arrow col="last_attack" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((m, i) => (
                        <tr key={m.attacker_id} className="border-b border-border-light hover:bg-bg-elevated/50 transition-colors">
                          <td className="py-1.5 px-3 text-text-muted">{i + 1}</td>
                          <td className="py-1.5 px-3">
                            <a href={`https://www.torn.com/profiles.php?XID=${m.attacker_id}`} target="_blank"
                              className="text-text-primary hover:text-torn-green">{m.attacker_name || `#${m.attacker_id}`}</a>
                          </td>
                          <td className="py-1.5 px-3 font-semibold">{m.hits}</td>
                          <td className="py-1.5 px-3 text-torn-green">{m.wins}</td>
                          <td className="py-1.5 px-3 text-danger">{m.losses}</td>
                          <td className="py-1.5 px-3 font-semibold text-torn-green">{fmtResp(m.total_respect)}</td>
                          <td className="py-1.5 px-3 text-text-muted">{m.max_chain}</td>
                          <td className="py-1.5 px-3 text-text-muted text-xs">{timeAgo(m.last_attack)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
                No attacks recorded in the last {hours} hours.
              </div>
            )}
          </>
        ) : tab === 'recent' ? (
          recent.length > 0 ? (
            <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                      <th className="py-2 px-3">Attacker</th>
                      <th className="py-2 px-3">Defender</th>
                      <th className="py-2 px-3">Result</th>
                      <th className="py-2 px-3">Respect</th>
                      <th className="py-2 px-3">Chain</th>
                      <th className="py-2 px-3">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map(a => (
                      <tr key={a.id} className="border-b border-border-light hover:bg-bg-elevated/50 transition-colors">
                        <td className="py-1.5 px-3 text-text-primary">{a.attacker_name || '?'}</td>
                        <td className="py-1.5 px-3">
                          {a.defender_name || '?'}
                          {a.defender_faction_name && <span className="ml-1 text-xs text-text-muted">[{a.defender_faction_name}]</span>}
                        </td>
                        <td className={`py-1.5 px-3 font-medium ${RESULT_COLOR[a.result] || 'text-text-muted'}`}>{a.result}</td>
                        <td className="py-1.5 px-3 text-torn-green">{a.respect_gain > 0 ? `+${a.respect_gain.toFixed(2)}` : '—'}</td>
                        <td className="py-1.5 px-3 text-text-muted">{a.chain || '—'}</td>
                        <td className="py-1.5 px-3 text-text-muted text-xs">{timeAgo(a.started)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
              No recent attacks found. Attacks are fetched from Torn API on each page load.
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
