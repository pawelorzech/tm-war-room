'use client';

import { useState, useMemo } from 'react';
import type { SpyEstimate, SpyFactionResponse } from '@/types/spy';
import { api } from '@/lib/api-client';

const CONFIDENCE_DOT: Record<string, string> = {
  exact: 'bg-green-500',
  estimate: 'bg-yellow-500',
  stale: 'bg-red-500',
  unknown: 'bg-gray-500',
};

function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n > 0 ? String(Math.round(n)) : '—';
}

type SortCol = 'total' | 'strength' | 'defense' | 'speed' | 'dexterity' | 'level';

export function FactionLookup() {
  const [factionId, setFactionId] = useState('');
  const [data, setData] = useState<SpyFactionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>('total');
  const [sortAsc, setSortAsc] = useState(false);

  const handleSearch = async () => {
    const fid = parseInt(factionId.trim(), 10);
    if (isNaN(fid) || fid <= 0) { setError('Enter a valid faction ID'); return; }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const result = await api.spyFaction(fid);
      setData(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Lookup failed';
      if (msg.includes('Missing X-Player-Id') || msg.includes('Unauthorized') || msg.includes('Token')) {
        setError('Authentication error — please log out and log back in.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data.members].sort((a, b) => {
      const va = (a[sortCol] ?? 0) as number;
      const vb = (b[sortCol] ?? 0) as number;
      return sortAsc ? va - vb : vb - va;
    });
  }, [data, sortCol, sortAsc]);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  const Arrow = ({ col }: { col: SortCol }) =>
    sortCol === col ? <span className="ml-1 text-torn-green">{sortAsc ? '▲' : '▼'}</span> : null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Faction Lookup</h3>
      <div className="flex gap-2">
        <input
          type="text" value={factionId} onChange={e => setFactionId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Faction ID (e.g. 11559)"
          className="flex-1 bg-bg-card border border-text-secondary/30 rounded-lg px-4 py-2.5 text-text-primary text-sm focus:outline-none focus:border-torn-green focus:ring-1 focus:ring-torn-green"
        />
        <button onClick={handleSearch} disabled={loading}
                className="px-5 py-2.5 bg-torn-green text-white text-sm font-semibold rounded-lg hover:bg-torn-green/90 transition-colors disabled:opacity-50">
          {loading ? 'Loading...' : 'Lookup'}
        </button>
      </div>

      {error && <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">{error}</div>}

      {data && (
        <div className="space-y-3">
          {data.faction && (
            <div className="flex items-center gap-3 text-sm">
              <span className="font-bold text-text-primary">{data.faction.name}</span>
              <span className="text-text-muted">[{data.faction.tag}]</span>
              <span className="text-text-secondary">
                {data.known_count}/{data.total_count} with spy data
              </span>
            </div>
          )}

          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {sorted.map(e => (
              <div key={e.player_id} className={`bg-bg-card border rounded-lg p-3 ${e.confidence === 'unknown' ? 'border-text-secondary/10 opacity-60' : 'border-text-secondary/20'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${CONFIDENCE_DOT[e.confidence]}`} />
                    <a href={`https://www.torn.com/profiles.php?XID=${e.player_id}`} target="_blank"
                       className="text-sm font-medium text-text-primary hover:text-torn-green">
                      {e.player_name || `#${e.player_id}`}
                    </a>
                    {e.level && <span className="text-xs text-text-muted">Lv{e.level}</span>}
                  </div>
                  <span className={`text-lg font-bold ${e.total > 0 ? 'text-torn-green' : 'text-text-muted'}`}>{fmt(e.total)}</span>
                </div>
                {e.total > 0 && (
                  <div className="grid grid-cols-4 gap-2 text-xs text-center">
                    <div><span className="text-text-secondary">STR</span><br/><span className="font-medium">{fmt(e.strength)}</span></div>
                    <div><span className="text-text-secondary">DEF</span><br/><span className="font-medium">{fmt(e.defense)}</span></div>
                    <div><span className="text-text-secondary">SPD</span><br/><span className="font-medium">{fmt(e.speed)}</span></div>
                    <div><span className="text-text-secondary">DEX</span><br/><span className="font-medium">{fmt(e.dexterity)}</span></div>
                  </div>
                )}
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
                  <th className="py-2 px-2 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('level')}>Lv<Arrow col="level" /></th>
                  <th className="py-2 px-2 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('total')}>Total<Arrow col="total" /></th>
                  <th className="py-2 px-2 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('strength')}>STR<Arrow col="strength" /></th>
                  <th className="py-2 px-2 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('defense')}>DEF<Arrow col="defense" /></th>
                  <th className="py-2 px-2 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('speed')}>SPD<Arrow col="speed" /></th>
                  <th className="py-2 px-2 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('dexterity')}>DEX<Arrow col="dexterity" /></th>
                  <th className="py-2 px-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(e => (
                  <tr key={e.player_id} className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors ${e.confidence === 'unknown' ? 'opacity-50' : ''}`}>
                    <td className="py-1.5 px-2"><span className={`w-2 h-2 rounded-full inline-block ${CONFIDENCE_DOT[e.confidence]}`} /></td>
                    <td className="py-1.5 px-2">
                      <a href={`https://www.torn.com/profiles.php?XID=${e.player_id}`} target="_blank"
                         className="text-text-primary hover:text-torn-green">{e.player_name || `#${e.player_id}`}</a>
                      <span className="ml-1 text-xs text-text-muted">[{e.player_id}]</span>
                    </td>
                    <td className="py-1.5 px-2 text-text-muted">{e.level ?? '—'}</td>
                    <td className="py-1.5 px-2 font-semibold text-torn-green">{fmt(e.total)}</td>
                    <td className="py-1.5 px-2">{fmt(e.strength)}</td>
                    <td className="py-1.5 px-2">{fmt(e.defense)}</td>
                    <td className="py-1.5 px-2">{fmt(e.speed)}</td>
                    <td className="py-1.5 px-2">{fmt(e.dexterity)}</td>
                    <td className="py-1.5 px-2 text-text-muted text-xs">{e.confidence === 'unknown' ? '—' : e.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
