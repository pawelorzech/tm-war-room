'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useSort } from '@/hooks/useSort';
import { SortableHeader } from '@/components/layout/SortableHeader';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { ExportButton } from '@/components/layout/ExportButton';

/* ── Types ── */

interface RawAward {
  id: number;
  name: string;
  description: string;
  type: number;
  rarity?: string;
  circulation: number;
  earned: boolean;
  earned_at?: number | null;
}

interface Award extends RawAward {
  kind: 'honor' | 'medal';
}

interface AwardsData {
  player_id: number;
  name: string;
  honors: RawAward[];
  medals: RawAward[];
  honors_earned: number;
  honors_total: number;
  medals_earned: number;
  medals_total: number;
}

type MainTab = 'honors' | 'medals' | 'incomplete';

/* ── Helpers ── */

function isJunk(a: RawAward): boolean {
  if (!a.name) return true;
  const n = a.name.toLowerCase();
  const d = (a.description || '').toLowerCase();
  return n === 'default' || d.includes('default honor bar') || d.includes('default medal');
}

const TYPE_NAMES: Record<number, string> = {
  1: 'Attacks', 2: 'Missions', 3: 'Items', 4: 'Travel',
  5: 'Crimes', 6: 'Drugs', 7: 'Job', 8: 'Social',
  9: 'Gambling', 10: 'Hospital', 11: 'Education', 12: 'Other',
  13: 'Gym', 14: 'Racing', 15: 'Faction', 16: 'Forum',
};

function typeName(t: number) { return TYPE_NAMES[t] || `Type ${t}`; }

/* ── Pure compute — no hooks, no memos ── */

function compute(data: AwardsData, tab: MainTab, catFilter: number | null, search: string) {
  // 1. Build clean lists with kind tag
  const honors: Award[] = data.honors.filter(a => !isJunk(a)).map(a => ({ ...a, kind: 'honor' }));
  const medals: Award[] = data.medals.filter(a => !isJunk(a)).map(a => ({ ...a, kind: 'medal' }));

  const honorsEarned = honors.filter(a => a.earned).length;
  const medalsEarned = medals.filter(a => a.earned).length;
  const allIncomplete = [...honors, ...medals].filter(a => !a.earned);

  // 2. Pick the right list
  let list: Award[];
  if (tab === 'honors') list = honors;
  else if (tab === 'medals') list = medals;
  else list = allIncomplete;

  // 3. Collect categories from this list
  const typeSet = new Set(list.map(a => a.type));
  const categories = Array.from(typeSet).sort((a, b) => a - b);

  // 4. Apply filters
  if (catFilter !== null) list = list.filter(a => a.type === catFilter);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
  }

  return { list, categories, honors, medals, honorsEarned, medalsEarned, allIncomplete };
}

/* ── Component ── */

export default function AwardsPage() {
  const [data, setData] = useState<AwardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<MainTab>('honors');
  const [catFilter, setCatFilter] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const router = useRouter();

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    api.awardsMe()
      .then(d => setData(d as AwardsData))
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const switchTab = (t: MainTab) => {
    setTab(t);
    setCatFilter(null);
    setSearch('');
  };

  // Single computation — no chained memos
  const view = data ? compute(data, tab, catFilter, search) : null;

  const { sorted: sortedAwards, sortCol, sortDir, toggle: toggleSort } = useSort(view?.list ?? [], 'circulation', 'asc');

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Awards Tracker</h1>
            {data && <p className="text-text-muted text-sm">{data.name}</p>}
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="awards" title="Awards Tracker — What's here?" bullets={[
          "Honors and medals are two types of Torn awards. Honors are earned through gameplay achievements (attacks, crimes, travel, etc.) and display on your profile. Medals are rarer, often tied to faction activities or special events.",
          "Circulation shows how many players have earned each award — lower circulation means rarer and more prestigious. Sort by circulation to find the rarest awards you're missing and prioritize accordingly.",
          "Use the Incomplete tab to see all awards you haven't earned yet across both honors and medals. Filter by category (Attacks, Travel, Crimes, etc.) to focus your grinding strategy on one area at a time.",
          "Strategy tip: many honors have hidden progress thresholds. Check the description for clues, and focus on categories where you're close to completion for the most efficient honor grinding.",
        ]}
        dataSources={["Torn API v1 user honors/medals", "Torn API v1 honors list for circulation data"]}
        links={[["Torn Wiki: Awards", "https://wiki.torn.com/wiki/Awards"], ["Torn Wiki: Honors", "https://wiki.torn.com/wiki/Honors"]]}
        />

        {loading ? (
          <p className="text-text-secondary text-sm animate-pulse">Loading awards data from Torn API...</p>
        ) : error ? (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-danger text-sm">{error}</div>
        ) : view ? (
          <>
            {/* ── Tabs ── */}
            <div className="flex flex-wrap items-center border-b border-border">
              <TabBtn active={tab === 'honors'} onClick={() => switchTab('honors')}>
                Honors {view.honorsEarned}/{view.honors.length} ({pct(view.honorsEarned, view.honors.length)})
              </TabBtn>
              <TabBtn active={tab === 'medals'} onClick={() => switchTab('medals')}>
                Medals {view.medalsEarned}/{view.medals.length} ({pct(view.medalsEarned, view.medals.length)})
              </TabBtn>
              <TabBtn active={tab === 'incomplete'} onClick={() => switchTab('incomplete')} red>
                Incomplete {view.allIncomplete.length}/{view.honors.length + view.medals.length}
              </TabBtn>
              <div className="ml-auto -mb-px">
                <ExportButton
                  rows={sortedAwards as unknown as Record<string, unknown>[]}
                  columns={[
                    { key: 'name', label: 'Name' },
                    { key: 'description', label: 'Description' },
                    { key: 'circulation', label: 'Circulation' },
                    { key: 'type', label: 'Type' },
                    { key: 'earned', label: 'Earned' },
                  ]}
                  filename="tm-hub-awards.csv"
                />
              </div>
            </div>

            {/* ── Category chips ── */}
            {view.categories.length > 1 && (
              <div className="flex flex-wrap gap-1">
                <Chip active={catFilter === null} onClick={() => setCatFilter(null)}>All</Chip>
                {view.categories.map(t => (
                  <Chip key={t} active={catFilter === t} onClick={() => setCatFilter(catFilter === t ? null : t)}>
                    {typeName(t)}
                  </Chip>
                ))}
              </div>
            )}

            {/* ── Search ── */}
            <input type="text" placeholder="Search by name or description..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full max-w-sm bg-bg-card border border-text-secondary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50" />

            <p className="text-xs text-text-muted">{view.list.length} awards</p>

            {/* ── Table ── */}
            {view.list.length > 0 ? (
              <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
                <div className="md:hidden divide-y divide-border-light">
                  {sortedAwards.map(a => (
                    <button
                      key={`${a.kind}-${a.id}`}
                      onClick={() => router.push(`/awards/detail?kind=${a.kind}&id=${a.id}`)}
                      className={`w-full text-left p-3 transition-colors ${a.earned ? 'hover:bg-bg-elevated/50' : 'opacity-65 hover:opacity-100'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-text-primary truncate">{a.name}</p>
                          <p className="text-xs text-text-muted line-clamp-2">{a.description}</p>
                        </div>
                        <span className={a.earned ? "text-torn-green text-xs font-semibold shrink-0" : "text-danger text-xs font-semibold shrink-0"}>
                          {a.earned ? "Done" : "Missing"}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-text-muted">
                        <span>{typeName(a.type)}</span>
                        <span>·</span>
                        <span>{a.circulation.toLocaleString()} circulation</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                        <SortableHeader label="Name" column="name" currentCol={sortCol} currentDir={sortDir} onSort={toggleSort} />
                        <SortableHeader label="Circulation" column="circulation" currentCol={sortCol} currentDir={sortDir} onSort={toggleSort} className="text-right" />
                        <th className="py-2 px-3">Description</th>
                        <SortableHeader label="Category" column="type" currentCol={sortCol} currentDir={sortDir} onSort={toggleSort} />
                        <SortableHeader label="Status" column="earned" currentCol={sortCol} currentDir={sortDir} onSort={toggleSort} className="text-right" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAwards.map(a => (
                        <tr key={`${a.kind}-${a.id}`}
                          onClick={() => router.push(`/awards/detail?kind=${a.kind}&id=${a.id}`)}
                          className={`border-b border-border-light cursor-pointer transition-colors ${a.earned ? 'hover:bg-bg-elevated/50' : 'opacity-60 hover:opacity-100'}`}>
                          <td className="py-1.5 px-3 font-medium whitespace-nowrap text-text-primary">{a.name}</td>
                          <td className="py-1.5 px-3 text-text-secondary text-right tabular-nums">{a.circulation.toLocaleString()}</td>
                          <td className="py-1.5 px-3 text-text-muted text-xs max-w-xs truncate">{a.description}</td>
                          <td className="py-1.5 px-3 text-text-muted text-xs whitespace-nowrap">{typeName(a.type)}</td>
                          <td className="py-1.5 px-3 text-right whitespace-nowrap">
                            {a.earned
                              ? <span className="text-torn-green font-semibold text-xs">Completed!</span>
                              : <span className="text-danger font-semibold text-xs">Incomplete</span>}
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

/* ── Tiny sub-components ── */

function pct(n: number, total: number) {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : '0%';
}

function TabBtn({ active, onClick, children, red }: {
  active: boolean; onClick: () => void; children: React.ReactNode; red?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? 'border-torn-green text-torn-green'
               : `border-transparent hover:text-text-primary ${red ? 'text-danger/70' : 'text-text-secondary'}`
      }`}>
      {children}
    </button>
  );
}

function Chip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={`px-2 py-1 text-xs rounded transition-colors ${
        active ? 'bg-torn-green/20 text-torn-green font-medium' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated'
      }`}>
      {children}
    </button>
  );
}
