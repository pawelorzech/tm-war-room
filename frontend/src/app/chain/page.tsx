'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';

/* ── Types ── */

interface ChainSummary {
  start_ts: number;
  end_ts: number;
  duration: number;
  max_chain: number;
  hits: number;
  total_respect: number;
  member_count: number;
  top_hitter_name: string;
  top_hitter_id: number;
  top_hitter_respect: number;
  starter_name: string;
  starter_id: number;
  ender_name: string;
  ender_id: number;
  bonus_hits: { chain: number; attacker_name: string; attacker_id: number }[];
}

interface ChainDetailMember {
  attacker_id: number;
  attacker_name: string;
  hits: number;
  wins: number;
  losses: number;
  total_respect: number;
  max_chain: number;
  first_attack: number;
  last_attack: number;
}

interface ChainDetailResponse {
  start_ts: number;
  end_ts: number;
  members: ChainDetailMember[];
  attacks: RecentAttack[];
  total_hits: number;
  total_respect: number;
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

/* ── Helpers ── */

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

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function tornProfile(id: number) {
  return `https://www.torn.com/profiles.php?XID=${id}`;
}

const RESULT_COLOR: Record<string, string> = {
  Hospitalized: 'text-torn-green', Attacked: 'text-torn-green', Mugged: 'text-torn-green',
  Lost: 'text-danger', Stalemate: 'text-warning', Assist: 'text-blue-400', Escape: 'text-text-muted',
};

type Tab = 'chains' | 'recent';
type DetailSort = 'hits' | 'wins' | 'losses' | 'total_respect' | 'max_chain' | 'last_attack';

/* ── Main Component ── */

export default function ChainPage() {
  const [chains, setChains] = useState<ChainSummary[]>([]);
  const [recent, setRecent] = useState<RecentAttack[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('chains');
  const [attacksInDb, setAttacksInDb] = useState(0);

  // Detail view state
  const [selectedChain, setSelectedChain] = useState<ChainSummary | null>(null);
  const [detail, setDetail] = useState<ChainDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'members' | 'attacks'>('members');
  const [sortCol, setSortCol] = useState<DetailSort>('total_respect');
  const [sortAsc, setSortAsc] = useState(false);

  const loadData = (force?: boolean) => {
    setLoading(true);
    Promise.all([
      api.chainList(force),
      api.chainRecent(100),
    ]).then(([c, a]) => {
      const chainData = c as { chains: ChainSummary[]; attacks_in_db: number };
      setChains(chainData.chains);
      setAttacksInDb(chainData.attacks_in_db);
      setRecent((a as { attacks: RecentAttack[] }).attacks);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const openChain = (chain: ChainSummary) => {
    setSelectedChain(chain);
    setDetailLoading(true);
    setDetailTab('members');
    api.chainDetail(chain.start_ts, chain.end_ts).then(d => {
      setDetail(d as ChainDetailResponse);
    }).catch(() => {}).finally(() => setDetailLoading(false));
  };

  const closeDetail = () => {
    setSelectedChain(null);
    setDetail(null);
  };

  const toggleSort = (col: DetailSort) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };
  const Arrow = ({ col }: { col: DetailSort }) =>
    sortCol === col ? <span className="ml-1 text-torn-green">{sortAsc ? '▲' : '▼'}</span> : null;

  const sortedMembers = useMemo(() => {
    if (!detail) return [];
    return [...detail.members].sort((a, b) => {
      const va = a[sortCol] ?? 0;
      const vb = b[sortCol] ?? 0;
      return sortAsc ? va - vb : vb - va;
    });
  }, [detail, sortCol, sortAsc]);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Chain Tracker</h1>
            <p className="text-text-secondary text-sm mt-1">
              Detected chains, per-member breakdown, and recent attacks.
              {attacksInDb > 0 && <span className="ml-2 text-text-muted">({attacksInDb.toLocaleString()} attacks in DB)</span>}
            </p>
          </div>
          <RefreshButton onRefresh={() => loadData(true)} />
        </div>

        <PageExplainer id="chain" title="Chain Tracker — What's here?" bullets={[
          "Chains: auto-detected from attack data. Click any chain to see per-member breakdown and bonus hits.",
          "Recent Attacks: live feed of the last 100 faction attacks with results and respect.",
          "Chain detection: a new chain starts each time the chain counter resets to 1.",
          "Data fetched from Torn API on each page load (up to 1000 attacks with pagination).",
        ]} />

        {/* Tab switcher */}
        <div className="flex gap-2">
          {([['chains', 'Chains'], ['recent', 'Recent Attacks']] as const).map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); if (key === 'chains') closeDetail(); }}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${tab === key ? 'bg-torn-green/20 text-torn-green font-semibold' : 'text-text-secondary hover:text-text-primary'}`}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-text-secondary text-sm animate-pulse">Loading attack data...</div>
        ) : tab === 'chains' ? (
          selectedChain ? (
            <ChainDetailView
              chain={selectedChain}
              detail={detail}
              loading={detailLoading}
              detailTab={detailTab}
              setDetailTab={setDetailTab}
              sortedMembers={sortedMembers}
              sortCol={sortCol}
              toggleSort={toggleSort}
              Arrow={Arrow}
              onBack={closeDetail}
            />
          ) : (
            <ChainListView chains={chains} onSelect={openChain} />
          )
        ) : (
          <RecentAttacksView attacks={recent} />
        )}
      </div>
    </div>
  );
}

/* ── Chain List View ── */

function ChainListView({ chains, onSelect }: { chains: ChainSummary[]; onSelect: (c: ChainSummary) => void }) {
  if (chains.length === 0) {
    return (
      <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
        No chains detected yet. Attacks are fetched from Torn API on each page load.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {chains.map((c, i) => (
        <button
          key={`${c.start_ts}-${c.end_ts}`}
          onClick={() => onSelect(c)}
          className="w-full text-left bg-bg-card border border-text-secondary/20 rounded-xl p-4 hover:border-torn-green/40 hover:bg-bg-elevated/50 transition-all group"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold text-text-primary">
                  Chain #{c.max_chain.toLocaleString()}
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-bg-elevated text-text-secondary">
                  {c.hits} {c.hits === 1 ? 'hit' : 'hits'} logged
                </span>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                {fmtDate(c.start_ts)} — {fmtDuration(c.duration)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold text-torn-green">{fmtResp(c.total_respect)}</p>
              <p className="text-[10px] text-text-muted uppercase">respect</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-text-muted">Members</span>
              <p className="font-semibold text-text-primary">{c.member_count}</p>
            </div>
            <div>
              <span className="text-text-muted">Top hitter</span>
              <p className="font-semibold text-text-primary truncate">{c.top_hitter_name}</p>
            </div>
            <div>
              <span className="text-text-muted">Bonuses</span>
              <p className="font-semibold text-text-primary">{c.bonus_hits.length}</p>
            </div>
          </div>

          {c.bonus_hits.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {c.bonus_hits.map((b, bi) => (
                <span key={bi} className="px-1.5 py-0.5 text-[10px] rounded bg-torn-yellow/15 text-torn-yellow font-medium">
                  {b.chain.toLocaleString()}x {b.attacker_name}
                </span>
              ))}
            </div>
          )}

          <div className="mt-2 text-[10px] text-text-muted flex items-center gap-1 group-hover:text-torn-green transition-colors">
            Click for details →
          </div>
        </button>
      ))}
    </div>
  );
}

/* ── Chain Detail View ── */

function ChainDetailView({
  chain, detail, loading, detailTab, setDetailTab,
  sortedMembers, sortCol, toggleSort, Arrow, onBack,
}: {
  chain: ChainSummary;
  detail: ChainDetailResponse | null;
  loading: boolean;
  detailTab: 'members' | 'attacks';
  setDetailTab: (t: 'members' | 'attacks') => void;
  sortedMembers: ChainDetailMember[];
  sortCol: DetailSort;
  toggleSort: (col: DetailSort) => void;
  Arrow: React.FC<{ col: DetailSort }>;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Back button + header */}
      <button onClick={onBack} className="text-sm text-text-secondary hover:text-torn-green transition-colors flex items-center gap-1">
        ← Back to chains
      </button>

      <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold">Chain #{chain.max_chain.toLocaleString()} <span className="text-sm font-normal text-text-secondary">({chain.hits} hits logged)</span></h2>
            <p className="text-xs text-text-muted mt-0.5">{fmtDate(chain.start_ts)} — {fmtDuration(chain.duration)}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-torn-green">{fmtResp(chain.total_respect)}</p>
            <p className="text-[10px] text-text-muted">total respect</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Hits', value: chain.hits },
            { label: 'Members', value: chain.member_count },
            { label: 'Started by', value: chain.starter_name, link: chain.starter_id },
            { label: 'Ended by', value: chain.ender_name, link: chain.ender_id },
          ].map(c => (
            <div key={c.label} className="text-center">
              <p className="text-[10px] text-text-muted uppercase">{c.label}</p>
              {c.link ? (
                <a href={tornProfile(c.link)} target="_blank" className="text-sm font-semibold hover:text-torn-green transition-colors">{c.value}</a>
              ) : (
                <p className="text-sm font-semibold">{c.value}</p>
              )}
            </div>
          ))}
        </div>

        {chain.bonus_hits.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border-light">
            <p className="text-[10px] text-text-muted uppercase mb-1">Bonus Hits</p>
            <div className="flex flex-wrap gap-1.5">
              {chain.bonus_hits.map((b, i) => (
                <a key={i} href={tornProfile(b.attacker_id)} target="_blank"
                  className="px-2 py-0.5 text-xs rounded-full bg-torn-yellow/15 text-torn-yellow hover:bg-torn-yellow/25 transition-colors font-medium">
                  {b.chain.toLocaleString()}x — {b.attacker_name}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Detail tabs */}
      <div className="flex gap-2">
        {([['members', 'Members'], ['attacks', 'All Attacks']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setDetailTab(key)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${detailTab === key ? 'bg-torn-green/20 text-torn-green font-semibold' : 'text-text-secondary hover:text-text-primary'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-text-secondary text-sm animate-pulse">Loading chain details...</div>
      ) : detailTab === 'members' ? (
        sortedMembers.length > 0 ? (
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
                    <th className="py-2 px-3 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('max_chain')}>Best Hit<Arrow col="max_chain" /></th>
                    <th className="py-2 px-3 cursor-pointer select-none hover:text-text-primary" onClick={() => toggleSort('last_attack')}>Last Hit<Arrow col="last_attack" /></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map((m, i) => (
                    <tr key={m.attacker_id} className="border-b border-border-light hover:bg-bg-elevated/50 transition-colors">
                      <td className="py-1.5 px-3 text-text-muted">{i + 1}</td>
                      <td className="py-1.5 px-3">
                        <a href={tornProfile(m.attacker_id)} target="_blank"
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
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">No member data.</div>
        )
      ) : (
        <AttackTable attacks={detail?.attacks || []} />
      )}
    </div>
  );
}

/* ── Recent Attacks View ── */

function RecentAttacksView({ attacks }: { attacks: RecentAttack[] }) {
  if (attacks.length === 0) {
    return (
      <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
        No recent attacks found. Attacks are fetched from Torn API on each page load.
      </div>
    );
  }
  return <AttackTable attacks={attacks} />;
}

/* ── Shared Attack Table ── */

function AttackTable({ attacks }: { attacks: RecentAttack[] }) {
  return (
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
            {attacks.map(a => {
              const isLoss = a.result === 'Lost' || a.result === 'Stalemate' || a.result === 'Escape';
              return (
                <tr key={a.id} className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors ${isLoss ? 'bg-danger/10' : ''}`}>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
