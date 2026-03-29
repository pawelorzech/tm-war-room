'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
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
  const [sortBy, setSortBy] = useState<'reward' | 'threat'>('reward');

  const loadData = useCallback(() => {
    setLoading(true);
    api.bounties()
      .then(d => setData(d as BountyResponse))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const bounties = data?.bounties || [];

  let filtered = search
    ? bounties.filter(b =>
        b.target_name.toLowerCase().includes(search.toLowerCase()) ||
        b.lister_name.toLowerCase().includes(search.toLowerCase())
      )
    : bounties;

  if (filterThreat !== 'all') {
    filtered = filtered.filter(b => b.threat_label === filterThreat);
  }

  const UNAVAILABLE_STATES = ['hospital', 'jail', 'traveling', 'fallen'];
  if (hideUnavailable) {
    filtered = filtered.filter(b => !UNAVAILABLE_STATES.includes(b.target_status));
  }

  if (sortBy === 'threat') {
    filtered = [...filtered].sort((a, b) => a.threat_score - b.threat_score);
  }

  const easyCount = bounties.filter(b => b.threat_label === 'easy').length;
  const mediumCount = bounties.filter(b => b.threat_label === 'medium').length;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Bounty Board</h1>
            <p className="text-text-secondary text-sm mt-1">
              {bounties.length} bounties worth {fmtMoney(data?.total_value || 0)} total
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

          <button onClick={() => setSortBy(s => s === 'reward' ? 'threat' : 'reward')}
            className="ml-auto px-2.5 py-1 text-xs bg-bg-card text-text-secondary rounded-lg hover:bg-bg-elevated transition-colors">
            Sort: {sortBy === 'reward' ? '$ Reward' : 'Threat ↑'}
          </button>
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
        ) : filtered.length > 0 ? (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                    <th className="py-2 px-3">Target</th>
                    <th className="py-2 px-3">Threat</th>
                    <th className="py-2 px-3 text-right">Reward</th>
                    <th className="py-2 px-3 hidden sm:table-cell">Listed by</th>
                    <th className="py-2 px-3 hidden md:table-cell">Reason</th>
                    <th className="py-2 px-3 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b, i) => {
                    const unavailable = UNAVAILABLE_STATES.includes(b.target_status);
                    return (
                    <tr key={`${b.target_id}-${i}`} className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors ${unavailable ? 'opacity-40' : ''}`}>
                      <td className="py-2 px-3">
                        <a href={`https://www.torn.com/loader.php?sid=attack&user2ID=${b.target_id}`} target="_blank"
                          className="font-medium text-text-primary hover:text-torn-green transition-colors">
                          {b.target_name || `#${b.target_id}`}
                        </a>
                        {b.target_level > 0 && (
                          <span className="text-text-muted text-[10px] ml-1">Lv{b.target_level}</span>
                        )}
                        {unavailable && (
                          <span className="ml-1 px-1.5 py-0.5 text-[9px] rounded bg-danger/15 text-danger font-medium uppercase">
                            {b.target_status}
                          </span>
                        )}
                        {b.estimated_total != null && b.estimated_total > 0 && (
                          <span className="text-text-muted text-[10px] ml-1" title="Estimated total battle stats">
                            ~{fmtStats(b.estimated_total)} stats
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <ThreatBadge label={b.threat_label} score={b.threat_score} source={b.threat_source} />
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-torn-green tabular-nums">{fmtMoney(b.reward)}</td>
                      <td className="py-2 px-3 text-text-secondary hidden sm:table-cell">
                        <a href={`https://www.torn.com/profiles.php?XID=${b.lister_id}`} target="_blank"
                          className="hover:text-torn-green transition-colors">
                          {b.lister_name || `#${b.lister_id}`}
                        </a>
                      </td>
                      <td className="py-2 px-3 text-text-muted text-xs max-w-[200px] truncate hidden md:table-cell">{b.reason || '—'}</td>
                      <td className="py-2 px-3 text-right text-text-secondary">{b.quantity > 1 ? `x${b.quantity}` : ''}</td>
                    </tr>
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
