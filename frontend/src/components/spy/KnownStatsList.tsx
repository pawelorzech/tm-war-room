'use client';

import { useState, useEffect, useMemo } from 'react';
import type { SpyEstimate } from '@/types/spy';
import { api } from '@/lib/api-client';
import { formatTotalRange, type Bucket } from '@/lib/spy-display';

const BUCKET_DOT: Record<Bucket, string> = {
  verified: 'bg-green-500',
  estimate: 'bg-yellow-500',
  rough_guess: 'bg-orange-500',
  // Endgame: brighter red than danger-red so the dot reads as "warning, not a
  // hard error" against bg-bg-card. Same hue family as the badge in
  // SpyResultCard for visual consistency.
  endgame: 'bg-rose-600',
};

function fmt(n: number | null | undefined): string {
  if (n == null || n <= 0) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

function fmtTotal(e: SpyEstimate): string {
  // formatTotalRange returns '' for the endgame bucket because the card view
  // suppresses the number entirely. In a list/table cell we still need *some*
  // glyph so the row isn't visually broken — use a short label that mirrors
  // the badge wording.
  if (e.bucket === 'endgame') return 'endgame';
  return formatTotalRange(e.total, e.total_range, e.bucket ?? 'estimate');
}

function isEmptyRow(e: SpyEstimate): boolean {
  return (e.total ?? 0) <= 0
    && (e.strength ?? 0) <= 0
    && (e.defense ?? 0) <= 0
    && (e.speed ?? 0) <= 0
    && (e.dexterity ?? 0) <= 0;
}

function renderName(e: SpyEstimate): { display: string; muted: boolean } {
  const name = e.player_name?.trim();
  if (name) return { display: name, muted: false };
  return { display: 'Unknown player', muted: true };
}

type SortCol = 'total' | 'strength' | 'defense' | 'speed' | 'dexterity' | 'age_days';

export function KnownStatsList() {
  const [estimates, setEstimates] = useState<SpyEstimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState<SortCol>('total');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);

  useEffect(() => {
    api.spyKnown()
      .then(d => setEstimates(d.estimates))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const emptyCount = useMemo(() => estimates.filter(isEmptyRow).length, [estimates]);

  const sorted = useMemo(() => {
    let list = estimates;
    if (!showEmpty) {
      list = list.filter(e => !isEmptyRow(e));
    }
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
      return sortAsc ? va - vb : vb - va;
    });
  }, [estimates, sortCol, sortAsc, filter, showEmpty]);

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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
          Known Stats ({sorted.length}{!showEmpty && emptyCount > 0 ? ` · ${emptyCount} hidden` : ''})
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          {emptyCount > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showEmpty}
                onChange={e => setShowEmpty(e.target.checked)}
                className="accent-torn-green"
              />
              Show {emptyCount} rows with no stats
            </label>
          )}
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter by name or ID..."
            className="bg-bg-card border border-text-secondary/30 rounded-lg px-3 py-1.5 text-sm text-text-primary w-48 focus:outline-none focus:border-torn-green focus:ring-1 focus:ring-torn-green"
          />
        </div>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {sorted.slice(0, 50).map(e => {
          const { display, muted } = renderName(e);
          return (
            <div key={e.player_id} className={`bg-bg-card border border-text-secondary/20 rounded-lg p-3 ${isEmptyRow(e) ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-none ${BUCKET_DOT[e.bucket ?? 'estimate']}`} title={e.bucket ?? 'estimate'} />
                  <a href={`/spy?id=${e.player_id}`}
                     className={`text-sm font-medium hover:text-torn-green truncate ${muted ? 'text-text-muted italic' : 'text-text-primary'}`}>
                    {display}
                  </a>
                  <a href={`https://www.torn.com/profiles.php?XID=${e.player_id}`} target="_blank" rel="noopener noreferrer"
                     className="text-xs text-text-muted hover:text-torn-green flex-none">
                    [{e.player_id}]
                  </a>
                </div>
                <span className={`text-lg font-bold flex-none ml-2 tabular-nums ${e.bucket === 'endgame' ? 'text-rose-400 italic' : 'text-torn-green'}`}>{fmtTotal(e)}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs text-center">
                <div><span className="text-text-secondary">STR</span><br/><span className="font-medium">{fmt(e.strength)}</span></div>
                <div><span className="text-text-secondary">DEF</span><br/><span className="font-medium">{fmt(e.defense)}</span></div>
                <div><span className="text-text-secondary">SPD</span><br/><span className="font-medium">{fmt(e.speed)}</span></div>
                <div><span className="text-text-secondary">DEX</span><br/><span className="font-medium">{fmt(e.dexterity)}</span></div>
              </div>
            </div>
          );
        })}
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
            {sorted.map(e => {
              const { display, muted } = renderName(e);
              const empty = isEmptyRow(e);
              return (
                <tr key={e.player_id} className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors ${empty ? 'opacity-60' : ''}`}>
                  <td className="py-1.5 px-2">
                    <span className={`w-2 h-2 rounded-full inline-block ${BUCKET_DOT[e.bucket ?? 'estimate']}`} title={e.bucket ?? 'estimate'} />
                  </td>
                  <td className="py-1.5 px-2">
                    <a href={`/spy?id=${e.player_id}`}
                       className={`hover:text-torn-green transition-colors ${muted ? 'text-text-muted italic' : 'text-text-primary'}`}>
                      {display}
                    </a>
                    <a href={`https://www.torn.com/profiles.php?XID=${e.player_id}`} target="_blank" rel="noopener noreferrer"
                       className="ml-1.5 text-xs text-text-muted hover:text-torn-green">
                      [{e.player_id}]
                    </a>
                  </td>
                  <td className={`py-1.5 px-2 font-semibold tabular-nums whitespace-nowrap ${e.bucket === 'endgame' ? 'text-rose-400 italic' : 'text-torn-green'}`}>{fmtTotal(e)}</td>
                  <td className="py-1.5 px-2">{fmt(e.strength)}</td>
                  <td className="py-1.5 px-2">{fmt(e.defense)}</td>
                  <td className="py-1.5 px-2">{fmt(e.speed)}</td>
                  <td className="py-1.5 px-2">{fmt(e.dexterity)}</td>
                  <td className="py-1.5 px-2 text-text-muted text-xs">{e.source}</td>
                  <td className="py-1.5 px-2 text-text-muted text-xs">{e.age_days === 0 ? 'today' : e.age_days != null ? `${e.age_days}d` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
