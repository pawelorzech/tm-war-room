'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';

interface Award {
  id: number;
  name: string;
  description: string;
  type: number;
  rarity?: string;
  circulation: number;
  earned: boolean;
  earned_at?: number | null;
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

type Tab = 'honors' | 'medals';
type Filter = 'all' | 'earned' | 'missing';

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ProgressBar({ earned, total, label }: { earned: number; total: number; label: string }) {
  const pct = total > 0 ? (earned / total) * 100 : 0;
  return (
    <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-4">
      <div className="flex items-end justify-between mb-2">
        <span className="text-sm text-text-secondary">{label}</span>
        <span className="text-lg font-bold text-text-primary">
          {earned}<span className="text-text-muted font-normal text-sm">/{total}</span>
        </span>
      </div>
      <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
        <div className="h-full bg-torn-green rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-text-muted mt-1 text-right">{pct.toFixed(1)}%</p>
    </div>
  );
}

export default function AwardsPage() {
  const [data, setData] = useState<AwardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('honors');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const loadData = () => {
    setLoading(true);
    setError(null);
    api.awardsMe().then(d => {
      setData(d as AwardsData);
    }).catch(e => {
      setError(e.message || 'Failed to load awards');
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleTabChange = (t: Tab) => {
    setTab(t);
    setFilter('all');
    setSearch('');
  };

  const items = useMemo(() => {
    if (!data) return [];
    const list = tab === 'honors' ? data.honors : data.medals;
    return list.filter(a => {
      // Filter out default/empty honor bars
      if (!a.name || a.name.toLowerCase() === 'default') return false;
      if (a.description?.toLowerCase().includes('default honor bar')) return false;
      if (filter === 'earned' && !a.earned) return false;
      if (filter === 'missing' && a.earned) return false;
      if (search) {
        const q = search.toLowerCase();
        return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [data, tab, filter, search]);

  // Group by type
  const grouped = useMemo(() => {
    const groups: Record<number, Award[]> = {};
    for (const item of items) {
      const t = item.type || 0;
      if (!groups[t]) groups[t] = [];
      groups[t].push(item);
    }
    // Sort groups by type number
    return Object.entries(groups)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([type, awards]) => ({
        type: Number(type),
        awards: awards.sort((a, b) => a.id - b.id),
      }));
  }, [items]);

  const earnedInView = items.filter(a => a.earned).length;
  const totalInView = items.length;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Awards Tracker</h1>
            <p className="text-text-secondary text-sm mt-1">
              Track your honors and medals progress.
              {data && <span className="ml-2 text-text-muted">({data.name})</span>}
            </p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="awards" title="Awards Tracker — What's here?" bullets={[
          "See all Torn honors and medals with your earned/missing status.",
          "Progress bars show your completion percentage for honors and medals.",
          "Filter by earned, missing, or search by name/description.",
          "Grouped by award type/category for easy browsing.",
          "Rarity and circulation numbers help identify rare achievements.",
        ]} />

        {loading ? (
          <div className="text-text-secondary text-sm animate-pulse">Loading awards data from Torn API...</div>
        ) : error ? (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-danger text-sm">{error}</div>
        ) : data ? (
          <>
            {/* Progress cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ProgressBar earned={data.honors_earned} total={data.honors_total} label="Honors" />
              <ProgressBar earned={data.medals_earned} total={data.medals_total} label="Medals" />
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Tab toggle */}
              <div className="flex gap-2">
                {([['honors', 'Honors'], ['medals', 'Medals']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => handleTabChange(key)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${tab === key ? 'bg-torn-green/20 text-torn-green font-semibold' : 'text-text-secondary hover:text-text-primary'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Filter */}
              <div className="flex gap-1.5">
                {([['all', 'All'], ['earned', 'Earned'], ['missing', 'Missing']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setFilter(key)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${filter === key ? 'bg-bg-elevated text-text-primary font-medium' : 'text-text-muted hover:text-text-secondary'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <input
                type="text"
                placeholder="Search awards..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 min-w-[180px] bg-bg-card border border-text-secondary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50"
              />
            </div>

            {/* Count */}
            <p className="text-xs text-text-muted">
              Showing {totalInView} {tab} ({earnedInView} earned, {totalInView - earnedInView} missing)
            </p>

            {/* Awards grid */}
            {grouped.length > 0 ? (
              <div className="space-y-6">
                {grouped.map(group => (
                  <div key={group.type}>
                    <h3 className="text-xs uppercase tracking-wider text-text-muted mb-2">
                      {tab === 'honors' ? 'Honor' : 'Medal'} Type {group.type}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {group.awards.map(award => (
                        <div
                          key={award.id}
                          className={`rounded-lg border p-3 transition-colors ${
                            award.earned
                              ? 'bg-torn-green/5 border-torn-green/20'
                              : 'bg-bg-card border-text-secondary/10 opacity-60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-medium ${award.earned ? 'text-text-primary' : 'text-text-secondary'}`}>
                                {award.name}
                              </p>
                              <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{award.description}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              {award.earned ? (
                                <span className="text-torn-green text-xs font-semibold">Earned</span>
                              ) : (
                                <span className="text-text-muted text-[10px]">Missing</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-muted">
                            {award.rarity && (
                              <span className={`uppercase font-medium ${
                                award.rarity === 'Very Rare' ? 'text-torn-yellow' :
                                award.rarity === 'Extremely Rare' ? 'text-torn-red' :
                                'text-text-muted'
                              }`}>{award.rarity}</span>
                            )}
                            <span>{award.circulation.toLocaleString()} players</span>
                            {award.earned && award.earned_at && (
                              <span>Earned {fmtDate(award.earned_at)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
                No {tab} match your filters.
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
