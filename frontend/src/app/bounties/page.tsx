'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { api } from '@/lib/api-client';
import { useSort } from '@/hooks/useSort';
import { SortableHeader } from '@/components/layout/SortableHeader';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { TableSkeleton } from '@/components/layout/LoadingSkeleton';

interface Bounty {
  target_id: number;
  target_name: string;
  target_level: number;
  lister_id: number;
  lister_name: string;
  reward: number;
  reason: string;
  quantity: number;
  threat_score: number;
  threat_label: string;
  threat_source: string;
  estimated_total: number | null;
  target_status: string;
}

interface BountyResponse {
  bounties: Bounty[];
  total_value: number;
  count: number;
  threat_mode: string;
}

interface GroupedBounty {
  target_id: number;
  target_name: string;
  target_level: number;
  target_status: string;
  threat_score: number;
  threat_label: string;
  threat_source: string;
  estimated_total: number | null;
  total_reward: number;
  total_quantity: number;
  bounty_count: number;
  lister_count: number;
  bounties: Bounty[];
}

function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtStats(n: number | null): string {
  if (!n) return '?';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString();
}

const UNAVAILABLE_STATES = ['hospital', 'jail', 'traveling', 'fallen'];

const THREAT_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  easy: { bg: 'bg-torn-green/15', text: 'text-torn-green', ring: 'ring-torn-green/30' },
  medium: { bg: 'bg-torn-yellow/15', text: 'text-torn-yellow', ring: 'ring-torn-yellow/30' },
  hard: { bg: 'bg-orange-500/15', text: 'text-orange-400', ring: 'ring-orange-500/30' },
  avoid: { bg: 'bg-danger/15', text: 'text-danger', ring: 'ring-danger/30' },
  unknown: { bg: 'bg-bg-elevated', text: 'text-text-muted', ring: 'ring-text-muted/20' },
};

const THREAT_TIPS: Record<string, string> = {
  easy: 'You should win easily — go collect!',
  medium: 'Winnable but bring supplies',
  hard: 'Risky fight — use SE/armor',
  avoid: 'Way above your level — skip',
  unknown: 'No data — scout first',
};

function ThreatBadge({ label, score, source }: { label: string; score: number; source: string }) {
  const colors = THREAT_COLORS[label] || THREAT_COLORS.unknown;
  const tip = THREAT_TIPS[label] || '';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ring-1 ${colors.bg} ${colors.text} ${colors.ring}`}
      title={`${tip}${source !== 'none' ? ` (${source}, score: ${score})` : ''}`}
    >
      {label === 'easy' && '✓ '}
      {label === 'avoid' && '✕ '}
      {label}
    </span>
  );
}

export default function BountiesPage() {
  const [data, setData] = useState<BountyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterThreat, setFilterThreat] = useState<string>('all');
  const [hideUnavailable, setHideUnavailable] = useState(true);

  const loadData = useCallback(() => {
    setLoading(true);
    api.bounties()
      .then(d => setData(d as BountyResponse))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const bounties = data?.bounties || [];

  const grouped = useMemo(() => {
    let filtered: Bounty[] = search
      ? bounties.filter(b =>
          b.target_name.toLowerCase().includes(search.toLowerCase()) ||
          b.lister_name.toLowerCase().includes(search.toLowerCase())
        )
      : bounties;

    if (filterThreat !== 'all') {
      filtered = filtered.filter(b => b.threat_label === filterThreat);
    }
    if (hideUnavailable) {
      filtered = filtered.filter(b => !UNAVAILABLE_STATES.includes(b.target_status));
    }

    const map = new Map<number, GroupedBounty>();
    for (const b of filtered) {
      const existing = map.get(b.target_id);
      if (existing) {
        existing.total_reward += b.reward;
        existing.total_quantity += b.quantity;
        existing.bounty_count += 1;
        existing.bounties.push(b);
      } else {
        map.set(b.target_id, {
          target_id: b.target_id,
          target_name: b.target_name,
          target_level: b.target_level,
          target_status: b.target_status,
          threat_score: b.threat_score,
          threat_label: b.threat_label,
          threat_source: b.threat_source,
          estimated_total: b.estimated_total,
          total_reward: b.reward,
          total_quantity: b.quantity,
          bounty_count: 1,
          lister_count: 1,
          bounties: [b],
        });
      }
    }
    for (const g of map.values()) {
      g.lister_count = new Set(g.bounties.map(b => b.lister_id)).size;
    }
    return Array.from(map.values());
  }, [bounties, search, filterThreat, hideUnavailable]);

  const { sorted: sortedGroups, sortCol, sortDir, toggle: toggleSort } = useSort(grouped, 'total_reward');

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpand = useCallback((id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const easyCount = grouped.filter(g => g.threat_label === 'easy').length;
  const mediumCount = grouped.filter(g => g.threat_label === 'medium').length;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Bounty Board</h1>
            <p className="text-text-secondary text-sm mt-1">
              {grouped.length} target{grouped.length !== 1 ? 's' : ''} · {bounties.length} bounties worth {fmtMoney(data?.total_value || 0)}
              {data?.threat_mode === 'relative' && (
                <span className="text-torn-green"> · Threat relative to you</span>
              )}
            </p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="bounties" title="Bounty Board — How to use this" bullets={[
          "Bounties are placed by other players — you get paid for attacking the target. The reward is per-hit.",
          "THREAT LEVEL shows how tough each target is compared to you: Easy (green) = free money, Medium (yellow) = bring supplies, Hard (orange) = risky, Avoid (red) = you'll lose.",
          "Threat is calculated from spy data or estimated from personalstats (xanax taken, attacks won, etc). \"Unknown\" means we have no data — check their profile first.",
          "Click a target name to go directly to the attack page. Check their profile on Torn first if threat is unknown.",
          "Pro tip: Filter by 'Easy' to find quick cash. Bounties with multiple quantity (x2, x3) can be hit multiple times.",
          "Data: Torn API v2 bounties endpoint, cached 60s. Threat from spy database + personalstats estimates.",
        ]} />

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <input type="text" placeholder="Search by name..." value={search} onChange={e => setSearch(e.target.value)}
            className="max-w-[200px] bg-bg-card border border-text-secondary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50" />

          <div className="flex gap-1">
            {(['all', 'easy', 'medium', 'hard', 'avoid'] as const).map(f => (
              <button key={f} onClick={() => setFilterThreat(f)}
                className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                  filterThreat === f
                    ? 'bg-torn-green/20 text-torn-green font-semibold'
                    : 'bg-bg-card text-text-secondary hover:bg-bg-elevated'
                }`}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <button onClick={() => setHideUnavailable(h => !h)}
            className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
              hideUnavailable ? 'bg-torn-green/20 text-torn-green font-semibold' : 'bg-bg-card text-text-secondary hover:bg-bg-elevated'
            }`}>
            {hideUnavailable ? 'Available only' : 'Show all'}
          </button>

          <span className="ml-auto text-[10px] text-text-muted">Click column headers to sort</span>
        </div>

        {/* Quick stats */}
        {data && easyCount > 0 && (
          <div className="bg-torn-green/5 border border-torn-green/20 rounded-lg p-3 flex items-center gap-3">
            <span className="text-torn-green text-lg">💰</span>
            <div>
              <p className="text-sm font-medium text-text-primary">
                {easyCount} easy target{easyCount !== 1 ? 's' : ''} available
                {mediumCount > 0 && `, ${mediumCount} medium`}
              </p>
              <p className="text-xs text-text-secondary">
                Easy targets = free money. Filter by &ldquo;Easy&rdquo; to see them.
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <TableSkeleton rows={10} cols={5} />
        ) : sortedGroups.length > 0 ? (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                    <th className="py-2 px-2 w-8"></th>
                    <SortableHeader label="Target" column="target_name" currentCol={sortCol} currentDir={sortDir} onSort={toggleSort} />
                    <SortableHeader label="Threat" column="threat_score" currentCol={sortCol} currentDir={sortDir} onSort={toggleSort} />
                    <SortableHeader label="Total Reward" column="total_reward" currentCol={sortCol} currentDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortableHeader label="Listers" column="bounty_count" currentCol={sortCol} currentDir={sortDir} onSort={toggleSort} className="hidden sm:table-cell" />
                    <th className="py-2 px-3 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedGroups.map(g => {
                    const isExpanded = expanded.has(g.target_id);
                    const unavailable = UNAVAILABLE_STATES.includes(g.target_status);
                    const hasMultiple = g.bounty_count > 1;
                    return (
                    <Fragment key={g.target_id}>
                      <tr
                        onClick={hasMultiple ? () => toggleExpand(g.target_id) : undefined}
                        className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors ${
                          unavailable ? 'opacity-40' : ''
                        } ${hasMultiple ? 'cursor-pointer' : ''}`}
                      >
                        <td className="py-2 px-2 w-8 text-center text-text-muted">
                          {hasMultiple && (
                            <span className={`inline-block text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <a href={`https://www.torn.com/loader.php?sid=attack&user2ID=${g.target_id}`} target="_blank"
                            onClick={e => e.stopPropagation()}
                            className="font-medium text-text-primary hover:text-torn-green transition-colors">
                            {g.target_name || `#${g.target_id}`}
                          </a>
                          {g.target_level > 0 && (
                            <span className="text-text-muted text-[10px] ml-1">Lv{g.target_level}</span>
                          )}
                          {unavailable && (
                            <span className="ml-1 px-1.5 py-0.5 text-[9px] rounded bg-danger/15 text-danger font-medium uppercase">
                              {g.target_status}
                            </span>
                          )}
                          {g.estimated_total != null && g.estimated_total > 0 && (
                            <span className="text-text-muted text-[10px] ml-1" title="Estimated total battle stats">
                              ~{fmtStats(g.estimated_total)} stats
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <ThreatBadge label={g.threat_label} score={g.threat_score} source={g.threat_source} />
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-torn-green tabular-nums">
                          {fmtMoney(g.total_reward)}
                          {hasMultiple && (
                            <span className="text-text-muted text-[10px] font-normal ml-1">
                              ({g.bounty_count})
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-text-secondary text-xs hidden sm:table-cell">
                          {hasMultiple ? (
                            <span>{g.lister_count} lister{g.lister_count !== 1 ? 's' : ''}</span>
                          ) : (
                            <a href={`https://www.torn.com/profiles.php?XID=${g.bounties[0].lister_id}`} target="_blank"
                              onClick={e => e.stopPropagation()}
                              className="hover:text-torn-green transition-colors">
                              {g.bounties[0].lister_name || `#${g.bounties[0].lister_id}`}
                            </a>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right text-text-secondary">
                          {g.total_quantity > 1 ? `x${g.total_quantity}` : ''}
                        </td>
                      </tr>
                      {isExpanded && g.bounties.map((b, i) => (
                        <tr key={`${g.target_id}-d-${i}`} className="bg-bg-elevated/30 border-b border-border-light/50 text-xs">
                          <td className="py-1.5 px-2 text-text-muted/30 text-center">└</td>
                          <td className="py-1.5 px-3" colSpan={2}>
                            <span className="text-text-muted">by </span>
                            <a href={`https://www.torn.com/profiles.php?XID=${b.lister_id}`} target="_blank"
                              className="text-text-primary hover:text-torn-green transition-colors">
                              {b.lister_name || `#${b.lister_id}`}
                            </a>
                            {b.reason && (
                              <span className="text-text-muted ml-2">— {b.reason}</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-right text-torn-green/70 tabular-nums">{fmtMoney(b.reward)}</td>
                          <td className="py-1.5 px-3 hidden sm:table-cell"></td>
                          <td className="py-1.5 px-3 text-right text-text-muted">
                            {b.quantity > 1 ? `x${b.quantity}` : ''}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
            {search || filterThreat !== 'all' ? 'No bounties match your filter.' : 'No bounties available.'}
          </div>
        )}

        {/* Data source footer */}
        <p className="text-[10px] text-text-muted text-center">
          Data: Torn API v2 · Threat: {data?.threat_mode === 'relative' ? 'relative to your stats' : 'absolute estimate'} · Cached 60s
        </p>
      </div>
    </div>
  );
}
