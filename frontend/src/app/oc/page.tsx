'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';

interface Participant {
  player_id: number;
  player_name: string;
  role: string;
  checkpoint_pass_rate: number;
  planning_complete: boolean;
}

interface Crime {
  id: number;
  name: string;
  status: string;
  difficulty: string;
  initiated_at: number;
  executed_at: number;
  ready_at: number;
  success: boolean | null;
  money_gain: number;
  respect_gain: number;
  participants: Participant[];
  participant_count: number;
}

interface OCData {
  crimes: Crime[];
  count: number;
  category: string;
}

type Tab = 'planning' | 'completed';

function timeAgo(ts: number): string {
  if (!ts) return '—';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtMoney(n: number): string {
  if (!n) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function tornProfile(id: number) {
  return `https://www.torn.com/profiles.php?XID=${id}`;
}

function avgCPR(participants: Participant[]): number {
  const withCPR = participants.filter(p => p.checkpoint_pass_rate > 0);
  if (withCPR.length === 0) return 0;
  return Math.round(withCPR.reduce((sum, p) => sum + p.checkpoint_pass_rate, 0) / withCPR.length);
}

function PlanningCrimeCard({ crime, isOpen, onToggle }: { crime: Crime; isOpen: boolean; onToggle: () => void }) {
  const readyCount = crime.participants.filter(p => p.planning_complete).length;
  const total = crime.participants.length;
  const allReady = readyCount === total && total > 0;
  const avg = avgCPR(crime.participants);

  return (
    <div className="bg-bg-card border border-text-secondary/15 rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full text-left p-4 hover:bg-bg-elevated/50 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-text-primary">{crime.name}</span>
              {crime.difficulty && (
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-bg-elevated text-text-muted font-medium">
                  {crime.difficulty}
                </span>
              )}
              {allReady ? (
                <span className="px-1.5 py-0.5 text-[10px] rounded font-bold bg-torn-green/15 text-torn-green">
                  READY TO GO
                </span>
              ) : (
                <span className="px-1.5 py-0.5 text-[10px] rounded font-bold bg-torn-yellow/15 text-torn-yellow">
                  {readyCount}/{total} READY
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              {crime.participant_count} participants
              {crime.initiated_at ? ` · Started ${timeAgo(crime.initiated_at)}` : ''}
              {avg > 0 && ` · Avg CPR: ${avg}%`}
            </p>
            {/* Actionable advice */}
            {!allReady && (
              <p className="text-xs text-torn-yellow mt-1">
                Waiting for: {crime.participants.filter(p => !p.planning_complete).map(p => p.player_name || `#${p.player_id}`).join(', ')}
              </p>
            )}
            {allReady && avg < 70 && (
              <p className="text-xs text-orange-400 mt-1">
                Low avg CPR ({avg}%) — consider reassigning roles for better odds.
              </p>
            )}
            {allReady && avg >= 70 && (
              <p className="text-xs text-torn-green mt-1">
                Good CPR ({avg}%) — initiate when ready!
              </p>
            )}
          </div>
          <span className="text-text-muted text-xs shrink-0">{isOpen ? '▾' : '▸'}</span>
        </div>
      </button>

      {isOpen && crime.participants.length > 0 && (
        <div className="border-t border-border-light px-4 pb-3">
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="text-left text-text-muted text-xs uppercase tracking-wider">
                <th className="py-1.5 pr-3">Member</th>
                <th className="py-1.5 pr-3">Role</th>
                <th className="py-1.5 pr-3 text-right">CPR</th>
                <th className="py-1.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...crime.participants].sort((a, b) => b.checkpoint_pass_rate - a.checkpoint_pass_rate).map(p => (
                <tr key={p.player_id} className="border-t border-border-light/50">
                  <td className="py-1.5 pr-3">
                    <a href={tornProfile(p.player_id)} target="_blank" rel="noopener noreferrer"
                      className="text-text-primary hover:text-torn-green transition-colors">
                      {p.player_name || `#${p.player_id}`}
                    </a>
                  </td>
                  <td className="py-1.5 pr-3 text-text-secondary text-xs">{p.role || '—'}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {p.checkpoint_pass_rate > 0 ? (
                      <span className={`font-medium ${p.checkpoint_pass_rate >= 80 ? 'text-torn-green' : p.checkpoint_pass_rate >= 50 ? 'text-torn-yellow' : 'text-danger'}`}>
                        {p.checkpoint_pass_rate}%
                      </span>
                    ) : <span className="text-text-muted">—</span>}
                  </td>
                  <td className="py-1.5 text-right">
                    {p.planning_complete
                      ? <span className="text-torn-green text-xs font-medium">Ready</span>
                      : <span className="text-torn-yellow text-xs font-medium">Planning...</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CompletedCrimeCard({ crime, isOpen, onToggle }: { crime: Crime; isOpen: boolean; onToggle: () => void }) {
  const avg = avgCPR(crime.participants);
  const duration = crime.executed_at && crime.initiated_at
    ? Math.round((crime.executed_at - crime.initiated_at) / 3600)
    : null;

  return (
    <div className={`bg-bg-card border rounded-xl overflow-hidden ${
      crime.success ? 'border-torn-green/20' : crime.success === false ? 'border-danger/20' : 'border-text-secondary/15'
    }`}>
      <button onClick={onToggle} className="w-full text-left p-4 hover:bg-bg-elevated/50 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-text-primary">{crime.name}</span>
              {crime.difficulty && (
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-bg-elevated text-text-muted font-medium">
                  {crime.difficulty}
                </span>
              )}
              {crime.success !== null && (
                <span className={`px-1.5 py-0.5 text-[10px] rounded font-bold ${
                  crime.success ? 'bg-torn-green/15 text-torn-green' : 'bg-danger/15 text-danger'
                }`}>
                  {crime.success ? 'SUCCESS' : 'FAILED'}
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              {crime.participant_count} participants
              {crime.executed_at ? ` · ${timeAgo(crime.executed_at)}` : ''}
              {duration != null && duration > 0 && ` · Took ${duration}h`}
              {avg > 0 && ` · Avg CPR: ${avg}%`}
            </p>
            {/* Outcome explanation */}
            {crime.success === false && (
              <p className="text-xs text-danger mt-1">
                Failed{avg < 60 ? ` — low team CPR (${avg}%) was likely the cause` : avg < 80 ? ` — moderate CPR (${avg}%), consider better role assignments` : ` — despite good CPR (${avg}%), bad luck or difficulty too high`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {(crime.money_gain > 0 || crime.respect_gain > 0) && (
              <div className="text-right">
                {crime.money_gain > 0 && <p className="text-sm font-semibold text-torn-green">{fmtMoney(crime.money_gain)}</p>}
                {crime.respect_gain > 0 && <p className="text-[10px] text-text-muted">+{crime.respect_gain.toFixed(1)} respect</p>}
              </div>
            )}
            {crime.success === false && !crime.money_gain && (
              <div className="text-right">
                <p className="text-sm text-danger font-medium">$0</p>
                <p className="text-[10px] text-text-muted">No reward</p>
              </div>
            )}
            <span className="text-text-muted text-xs">{isOpen ? '▾' : '▸'}</span>
          </div>
        </div>
      </button>

      {isOpen && crime.participants.length > 0 && (
        <div className="border-t border-border-light px-4 pb-3">
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="text-left text-text-muted text-xs uppercase tracking-wider">
                <th className="py-1.5 pr-3">Member</th>
                <th className="py-1.5 pr-3">Role</th>
                <th className="py-1.5 pr-3 text-right">CPR</th>
                <th className="py-1.5 text-right">Performance</th>
              </tr>
            </thead>
            <tbody>
              {[...crime.participants].sort((a, b) => b.checkpoint_pass_rate - a.checkpoint_pass_rate).map(p => (
                <tr key={p.player_id} className="border-t border-border-light/50">
                  <td className="py-1.5 pr-3">
                    <a href={tornProfile(p.player_id)} target="_blank" rel="noopener noreferrer"
                      className="text-text-primary hover:text-torn-green transition-colors">
                      {p.player_name || `#${p.player_id}`}
                    </a>
                  </td>
                  <td className="py-1.5 pr-3 text-text-secondary text-xs">{p.role || '—'}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {p.checkpoint_pass_rate > 0 ? (
                      <span className={`font-medium ${p.checkpoint_pass_rate >= 80 ? 'text-torn-green' : p.checkpoint_pass_rate >= 50 ? 'text-torn-yellow' : 'text-danger'}`}>
                        {p.checkpoint_pass_rate}%
                      </span>
                    ) : <span className="text-text-muted">—</span>}
                  </td>
                  <td className="py-1.5 text-right text-xs">
                    {p.checkpoint_pass_rate >= 80 ? (
                      <span className="text-torn-green">Strong</span>
                    ) : p.checkpoint_pass_rate >= 50 ? (
                      <span className="text-torn-yellow">Okay</span>
                    ) : p.checkpoint_pass_rate > 0 ? (
                      <span className="text-danger">Weak — reassign</span>
                    ) : <span className="text-text-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {crime.success === false && (
            <div className="mt-3 bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">
              <p className="text-xs text-danger font-medium">What went wrong?</p>
              <p className="text-xs text-text-secondary mt-0.5">
                {crime.participants.filter(p => p.checkpoint_pass_rate > 0 && p.checkpoint_pass_rate < 50).length > 0
                  ? `${crime.participants.filter(p => p.checkpoint_pass_rate > 0 && p.checkpoint_pass_rate < 50).map(p => p.player_name).join(', ')} had low CPR. Try assigning them to different roles.`
                  : avg < 70
                    ? 'Overall team CPR was too low for this difficulty. Try an easier crime or train members.'
                    : 'CPR was decent but RNG wasn\'t in your favor. Same setup might succeed next time.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OCPage() {
  const [tab, setTab] = useState<Tab>('planning');
  const [data, setData] = useState<OCData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadData = useCallback((cat?: string) => {
    setLoading(true);
    api.ocOverview(cat || tab)
      .then(d => setData(d as OCData))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { loadData(); }, [loadData]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setExpandedId(null);
  };

  // Summary stats for completed tab
  const completedStats = useMemo(() => {
    if (!data || data.category !== 'completed') return null;
    const crimes = data.crimes;
    const successes = crimes.filter(c => c.success === true);
    const fails = crimes.filter(c => c.success === false);
    const totalMoney = successes.reduce((s, c) => s + c.money_gain, 0);
    const totalRespect = successes.reduce((s, c) => s + c.respect_gain, 0);
    return {
      total: crimes.length,
      successCount: successes.length,
      failCount: fails.length,
      rate: crimes.length > 0 ? Math.round((successes.length / crimes.length) * 100) : 0,
      totalMoney,
      totalRespect,
    };
  }, [data]);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">OC Planner</h1>
            <p className="text-text-secondary text-sm mt-1">Organized Crime coordination, tracking, and analysis.</p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="oc" title="OC Planner — How to use this" bullets={[
          "Organized Crime 2.0 is a team-based system where members take specific roles. Each role has skill checks (CPR) that affect success.",
          "PLANNING TAB: See who's ready and who's still preparing. The page tells you who to ping and whether your team's CPR is high enough.",
          "COMPLETED TAB: Review past crimes — see success rate, total earnings, and analysis of what went wrong on failures.",
          "CPR colors: Green (80%+) = strong, Yellow (50-79%) = okay, Red (<50%) = reassign this member to a different role.",
          "Pro tip: Track which roles work best for each member. Over time, you'll know the optimal team composition.",
        ]} dataSources={["Torn API v2 faction crimes endpoint", "Member name resolution from faction member data"]}
           links={[["Torn Wiki: Organized Crime", "https://wiki.torn.com/wiki/Organized_Crimes"]]} />

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border">
          {([['planning', 'Planning'], ['completed', 'Completed']] as const).map(([key, label]) => (
            <button key={key} onClick={() => switchTab(key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key ? 'border-torn-green text-torn-green' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}>
              {label} {data?.category === key ? `(${data.count})` : ''}
            </button>
          ))}
        </div>

        {/* Completed summary stats */}
        {completedStats && tab === 'completed' && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-text-primary">{completedStats.rate}%</p>
              <p className="text-[10px] text-text-muted uppercase">Success Rate</p>
            </div>
            <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-torn-green">{completedStats.successCount}</p>
              <p className="text-[10px] text-text-muted uppercase">Successes</p>
            </div>
            <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-danger">{completedStats.failCount}</p>
              <p className="text-[10px] text-text-muted uppercase">Failures</p>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-text-secondary text-sm animate-pulse">Loading OC data...</p>
        ) : data && data.crimes.length > 0 ? (
          <div className="space-y-2">
            {data.crimes.map(crime => {
              const isOpen = expandedId === crime.id;
              const toggle = () => setExpandedId(isOpen ? null : crime.id);
              return tab === 'planning'
                ? <PlanningCrimeCard key={crime.id} crime={crime} isOpen={isOpen} onToggle={toggle} />
                : <CompletedCrimeCard key={crime.id} crime={crime} isOpen={isOpen} onToggle={toggle} />;
            })}
          </div>
        ) : (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
            No {tab} crimes found.
          </div>
        )}

        {/* Data source footer */}
        <p className="text-[10px] text-text-muted text-center">
          Data: Torn API v2 faction crimes · Cached 60s
        </p>
      </div>
    </div>
  );
}
