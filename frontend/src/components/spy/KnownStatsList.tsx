'use client';

import { useState, useEffect, useMemo } from 'react';
import type { SpyEstimate } from '@/types/spy';
import { api } from '@/lib/api-client';

const CONFIDENCE_DOT = {
  exact: 'bg-green-500',
  estimate: 'bg-yellow-500',
  stale: 'bg-red-500',
};

function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

type SortCol = 'total' | 'strength' | 'defense' | 'speed' | 'dexterity' | 'age_days';

export function KnownStatsList() {
  const [estimates, setEstimates] = useState<SpyEstimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState<SortCol>('total');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.spyKnown()
      .then(d => setEstimates(d.estimates))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    let list = estimates;
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(e =>
        (e.player_name?.toLowerCase().includes(q)) ||
        String(e.player_id).includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const va = a[sortCol] ?? 0;
      const vb = b[sortCol] ?? 0;
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [estimates, sortCol, sortAsc, filter]);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  const SortArrow = ({ col }: { col: SortCol }) =>
    sortCol === col ? <span className="ml-1 text-torn-green">{sortAsc ? '▲' : '▼'}</span> : null;

  if (loading) {
    return <div className="text-text-secondary text-sm animate-pulse py-4">Loading known stats...</div>;
  }

  if (estimates.length === 0) {
    return (
      <div className="text-text-secondary text-sm py-4">
        No spy data yet. Data will appear as the scheduler collects estimates from TornStats, or when members submit spy reports.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
          Known Stats ({sorted.length})
        </h3>
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter by name or ID..."
          className="bg-bg-card border border-text-secondary/30 rounded-lg px-3 py-1.5 text-sm text-text-primary w-48 focus:outline-none focus:border-torn-green focus:ring-1 focus:ring-torn-green"
        />
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {sorted.slice(0, 50).map(e => (
          <div key={e.player_id} className="bg-bg-card border border-text-secondary/20 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${CONFIDENCE_DOT[e.confidence]}`} title={e.confidence} />
                <a href={`https://www.torn.com/profiles.php?XID=${e.player_id}`} target="_blank"
                   className="text-sm font-medium text-text-primary hover:text-torn-green">
                  {e.player_name || `#${e.player_id}`}
                </a>
              </div>
              <span className="text-lg font-bold text-torn-green">{fmt(e.total)}</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs text-center">
              <div><span className="text-text-secondary">STR</span><br/><span className="font-medium">{fmt(e.strength)}</span></div>
              <div><span className="text-text-secondary">DEF</span><br/><span className="font-medium">{fmt(e.defense)}</span></div>
              <div><span className="text-text-secondary">SPD</span><br/><span className="font-medium">{fmt(e.speed)}</span></div>
              <div><span className="text-text-secondary">DEX</span><br/><span className="font-medium">{fmt(e.dexterity)}</span></div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
              <th className="py-2 px-2 w-5"></th>
              <th className="py-2 px-2">Player</th>
              <th className="py-2 px-2 cursor-pointer hover:text-text-primary select-none" onClick={() => toggleSort('total')}>
                Total<SortArrow col="total" />
              </th>
              <th className="py-2 px-2 cursor-pointer hover:text-text-primary select-none" onClick={() => toggleSort('strength')}>
                STR<SortArrow col="strength" />
              </th>
              <th className="py-2 px-2 cursor-pointer hover:text-text-primary select-none" onClick={() => toggleSort('defense')}>
                DEF<SortArrow col="defense" />
              </th>
              <th className="py-2 px-2 cursor-pointer hover:text-text-primary select-none" onClick={() => toggleSort('speed')}>
                SPD<SortArrow col="speed" />
              </th>
              <th className="py-2 px-2 cursor-pointer hover:text-text-primary select-none" onClick={() => toggleSort('dexterity')}>
                DEX<SortArrow col="dexterity" />
              </th>
              <th className="py-2 px-2">Source</th>
              <th className="py-2 px-2 cursor-pointer hover:text-text-primary select-none" onClick={() => toggleSort('age_days')}>
                Age<SortArrow col="age_days" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(e => (
              <tr key={e.player_id} className="border-b border-border-light hover:bg-bg-elevated/50 transition-colors">
                <td className="py-1.5 px-2">
                  <span className={`w-2 h-2 rounded-full inline-block ${CONFIDENCE_DOT[e.confidence]}`} title={e.confidence} />
                </td>
                <td className="py-1.5 px-2">
                  <a href={`https://www.torn.com/profiles.php?XID=${e.player_id}`} target="_blank"
                     className="text-text-primary hover:text-torn-green transition-colors">
                    {e.player_name || `#${e.player_id}`}
                  </a>
                  <span className="ml-1 text-xs text-text-muted">[{e.player_id}]</span>
                </td>
                <td className="py-1.5 px-2 font-semibold text-torn-green">{fmt(e.total)}</td>
                <td className="py-1.5 px-2">{fmt(e.strength)}</td>
                <td className="py-1.5 px-2">{fmt(e.defense)}</td>
                <td className="py-1.5 px-2">{fmt(e.speed)}</td>
                <td className="py-1.5 px-2">{fmt(e.dexterity)}</td>
                <td className="py-1.5 px-2 text-text-muted text-xs">{e.source}</td>
                <td className="py-1.5 px-2 text-text-muted text-xs">{e.age_days === 0 ? 'today' : `${e.age_days}d`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
