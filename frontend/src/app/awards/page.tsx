'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';

/* ── Types ── */

interface Award {
  id: number;
  name: string;
  description: string;
  type: number;
  rarity?: string;
  circulation: number;
  earned: boolean;
  earned_at?: number | null;
  kind?: 'honor' | 'medal';
}

interface AwardsData {
  player_id: number;
  name: string;
  honors: Award[];
  medals: Award[];
  honors_earned: number;
  honors_total: number;
  medals_earned: number;
  medals_total: number;
}

type MainTab = 'honors' | 'medals' | 'incomplete';
type SortCol = 'name' | 'circulation' | 'type';

/* ── Helpers ── */

function isDefault(a: Award): boolean {
  if (!a.name) return true;
  const n = a.name.toLowerCase();
  const d = (a.description || '').toLowerCase();
  return n === 'default' || d.includes('default honor bar') || d.includes('default medal');
}

const HONOR_TYPES: Record<number, string> = {
  1: 'Attacks', 2: 'Missions', 3: 'Items', 4: 'Travel',
  5: 'Crimes', 6: 'Drugs', 7: 'Job', 8: 'Social',
  9: 'Gambling', 10: 'Hospital', 11: 'Education', 12: 'Other',
  13: 'Gym', 14: 'Racing', 15: 'Faction', 16: 'Forum',
};

function typeName(type: number): string {
  return HONOR_TYPES[type] || `Type ${type}`;
}

/* ── Component ── */

export default function AwardsPage() {
  const [data, setData] = useState<AwardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>('honors');
  const [activeType, setActiveType] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    api.awardsMe().then(d => {
      setData(d as AwardsData);
    }).catch(e => {
      setError(e.message || 'Failed to load awards');
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filtered & cleaned lists
  const honors = useMemo(() => (data?.honors.filter(a => !isDefault(a)) || []).map(a => ({ ...a, kind: 'honor' as const })), [data]);
  const medals = useMemo(() => (data?.medals.filter(a => !isDefault(a)) || []).map(a => ({ ...a, kind: 'medal' as const })), [data]);
  const honorsEarned = useMemo(() => honors.filter(a => a.earned).length, [honors]);
  const medalsEarned = useMemo(() => medals.filter(a => a.earned).length, [medals]);
  const incomplete = useMemo(() => [...honors, ...medals].filter(a => !a.earned), [honors, medals]);

  // Current list based on tab
  const rawList = useMemo(() => {
    if (mainTab === 'honors') return honors;
    if (mainTab === 'medals') return medals;
    return incomplete;
  }, [mainTab, honors, medals, incomplete]);

  // Available types for current tab
  const availableTypes = useMemo(() => {
    const types = new Set(rawList.map(a => a.type));
    return Array.from(types).sort((a, b) => a - b);
  }, [rawList]);

  // Reset type filter when switching tabs
  const handleTabChange = (t: MainTab) => {
    setMainTab(t);
    setActiveType(null);
    setSearch('');
  };

  // Final filtered + sorted list
  const items = useMemo(() => {
    let list = rawList;
    if (activeType !== null) list = list.filter(a => a.type === activeType);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortCol === 'circulation') cmp = a.circulation - b.circulation;
      else if (sortCol === 'type') cmp = a.type - b.type;
      return sortAsc ? cmp : -cmp;
    });
  }, [rawList, activeType, search, sortCol, sortAsc]);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  const SortArrow = ({ col }: { col: SortCol }) =>
    sortCol === col ? <span className="ml-0.5 text-torn-green">{sortAsc ? '▲' : '▼'}</span> : null;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Awards Tracker</h1>
            {data && <p className="text-text-muted text-sm">{data.name}</p>}
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="awards" title="Awards Tracker — What's here?" bullets={[
          "Track your Torn honors and medals — Completed or Incomplete status.",
          "Filter by category, search by name or description.",
          "Sortable columns: name, circulation.",
          "Incomplete tab shows all missing awards across honors and medals.",
        ]} />

        {loading ? (
          <div className="text-text-secondary text-sm animate-pulse">Loading awards data from Torn API...</div>
        ) : error ? (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-danger text-sm">{error}</div>
        ) : data ? (
          <>
            {/* Main tabs with counts */}
            <div className="flex flex-wrap gap-1 border-b border-border pb-1">
              <TabButton active={mainTab === 'honors'} onClick={() => handleTabChange('honors')}>
                Honors {honorsEarned}/{honors.length} ({honors.length > 0 ? Math.round((honorsEarned / honors.length) * 100) : 0}%)
              </TabButton>
              <TabButton active={mainTab === 'medals'} onClick={() => handleTabChange('medals')}>
                Medals {medalsEarned}/{medals.length} ({medals.length > 0 ? Math.round((medalsEarned / medals.length) * 100) : 0}%)
              </TabButton>
              <TabButton active={mainTab === 'incomplete'} onClick={() => handleTabChange('incomplete')}
                className="text-danger">
                Incomplete {incomplete.length}/{honors.length + medals.length} ({(honors.length + medals.length) > 0 ? Math.round((incomplete.length / (honors.length + medals.length)) * 100) : 0}%)
              </TabButton>
            </div>

            {/* Category filter bar */}
            {availableTypes.length > 1 && (
              <div className="flex flex-wrap gap-1">
                <button onClick={() => setActiveType(null)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${activeType === null ? 'bg-torn-green/20 text-torn-green font-medium' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated'}`}>
                  All
                </button>
                {availableTypes.map(t => {
                  const count = rawList.filter(a => a.type === t).length;
                  return (
                    <button key={t} onClick={() => setActiveType(activeType === t ? null : t)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${activeType === t ? 'bg-torn-green/20 text-torn-green font-medium' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated'}`}>
                      {typeName(t)} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search */}
            <input type="text" placeholder="Search by name or description..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full max-w-sm bg-bg-card border border-text-secondary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50" />

            {/* Results count */}
            <p className="text-xs text-text-muted">{items.length} awards shown</p>

            {/* Table */}
            {items.length > 0 ? (
              <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                        <th className="py-2 px-3 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('name')}>
                          Name<SortArrow col="name" />
                        </th>
                        <th className="py-2 px-3 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('circulation')}>
                          Circulation<SortArrow col="circulation" />
                        </th>
                        <th className="py-2 px-3">Description</th>
                        <th className="py-2 px-3 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('type')}>
                          Category<SortArrow col="type" />
                        </th>
                        <th className="py-2 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(a => (
                        <tr key={`${mainTab}-${a.id}`}
                          className={`border-b border-border-light transition-colors ${a.earned ? 'hover:bg-bg-elevated/50' : 'opacity-70 hover:opacity-100'}`}>
                          <td className="py-1.5 px-3 font-medium whitespace-nowrap">
                            <a href={`https://www.tornstats.com/${a.kind === 'medal' ? 'medals' : 'honors'}/${a.id}`}
                              target="_blank" className="text-text-primary hover:text-torn-green transition-colors">
                              {a.name} <span className="text-text-muted text-[10px]">↗</span>
                            </a>
                          </td>
                          <td className="py-1.5 px-3 text-text-secondary text-right tabular-nums">{a.circulation.toLocaleString()}</td>
                          <td className="py-1.5 px-3 text-text-muted text-xs max-w-xs truncate">{a.description}</td>
                          <td className="py-1.5 px-3 text-text-muted text-xs whitespace-nowrap">{typeName(a.type)}</td>
                          <td className="py-1.5 px-3 text-right whitespace-nowrap">
                            {a.earned ? (
                              <span className="text-torn-green font-semibold text-xs">Completed!</span>
                            ) : (
                              <span className="text-danger font-semibold text-xs">Incomplete</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
                No awards match your filters.
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ── Tab Button ── */

function TabButton({ active, onClick, children, className = '' }: {
  active: boolean; onClick: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button onClick={onClick}
      className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-[5px] ${
        active
          ? 'border-torn-green text-torn-green'
          : `border-transparent text-text-secondary hover:text-text-primary ${className}`
      }`}>
      {children}
    </button>
  );
}
