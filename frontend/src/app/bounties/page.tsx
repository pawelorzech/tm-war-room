'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { TableSkeleton } from '@/components/layout/LoadingSkeleton';

interface Bounty {
  target_id: number;
  target_name: string;
  lister_id: number;
  lister_name: string;
  reward: number;
  reason: string;
  quantity: number;
}

function fmtMoney(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function BountiesPage() {
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadData = useCallback(() => {
    setLoading(true);
    api.bounties()
      .then(d => {
        const data = d as { bounties: Bounty[]; total_value: number };
        setBounties(data.bounties);
        setTotalValue(data.total_value);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = search
    ? bounties.filter(b => b.target_name.toLowerCase().includes(search.toLowerCase()) || b.lister_name.toLowerCase().includes(search.toLowerCase()))
    : bounties;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Bounty Board</h1>
            <p className="text-text-secondary text-sm mt-1">
              {bounties.length} bounties worth {fmtMoney(totalValue)} total
            </p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="bounties" title="Bounty Board — What's here?" bullets={[
          "Active bounties from Torn — sorted by highest reward.",
          "Click a target name to attack them and collect the bounty.",
          "Search by target or lister name.",
          "Data refreshes from Torn API (cached 1 min).",
        ]} />

        <input type="text" placeholder="Search by name..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm bg-bg-card border border-text-secondary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50" />

        {loading ? (
          <TableSkeleton rows={10} cols={5} />
        ) : filtered.length > 0 ? (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                    <th className="py-2 px-3">Target</th>
                    <th className="py-2 px-3 text-right">Reward</th>
                    <th className="py-2 px-3">Listed by</th>
                    <th className="py-2 px-3">Reason</th>
                    <th className="py-2 px-3 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b, i) => (
                    <tr key={`${b.target_id}-${i}`} className="border-b border-border-light hover:bg-bg-elevated/50 transition-colors">
                      <td className="py-1.5 px-3">
                        <a href={`https://www.torn.com/loader.php?sid=attack&user2ID=${b.target_id}`} target="_blank"
                          className="font-medium text-text-primary hover:text-torn-green transition-colors">
                          {b.target_name || `#${b.target_id}`}
                        </a>
                      </td>
                      <td className="py-1.5 px-3 text-right font-semibold text-torn-green tabular-nums">{fmtMoney(b.reward)}</td>
                      <td className="py-1.5 px-3 text-text-secondary">
                        <a href={`https://www.torn.com/profiles.php?XID=${b.lister_id}`} target="_blank"
                          className="hover:text-torn-green transition-colors">
                          {b.lister_name || `#${b.lister_id}`}
                        </a>
                      </td>
                      <td className="py-1.5 px-3 text-text-muted text-xs max-w-[200px] truncate">{b.reason || '—'}</td>
                      <td className="py-1.5 px-3 text-right text-text-secondary">{b.quantity > 1 ? `x${b.quantity}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
            No bounties available.
          </div>
        )}
      </div>
    </div>
  );
}
