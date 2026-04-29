'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import dynamic from 'next/dynamic';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { getActiveEvent } from '@/data/seasonal-events';

const StatGrowthChart = dynamic(
  () => import('@/components/stats/StatGrowthChart').then(m => ({ default: m.StatGrowthChart })),
  { ssr: false, loading: () => <div className="h-64 bg-bg-card rounded-lg animate-pulse" /> }
);

interface Snapshot {
  player_id: number;
  snapshot_date: string;
  strength: number;
  defense: number;
  speed: number;
  dexterity: number;
  total: number;
  level: number | null;
}

interface GrowthData {
  player_id: number;
  from_date: string;
  to_date: string;
  days: number;
  growth: { strength: number; defense: number; speed: number; dexterity: number; total: number };
  per_day: { strength: number; defense: number; speed: number; dexterity: number; total: number };
}

interface LeaderboardEntry extends Snapshot {
  player_name?: string;
  xanax_taken: number | null;
  refills: number | null;
  networth: number | null;
}

interface GrowthLeaderEntry {
  player_id: number;
  player_name: string;
  from_date: string;
  to_date: string;
  days: number;
  str_growth: number;
  def_growth: number;
  spd_growth: number;
  dex_growth: number;
  total_growth: number;
  pct_growth: number;
  per_day: number;
  xanax_delta: number | null;
  refills_delta: number | null;
  energy_drinks_delta: number | null;
  se_delta: number | null;
  energy_spent: number | null;
  easter_eggs_delta: number | null;
  easter_eggs_total: number | null;
}

type LeaderboardTab = 'total' | 'growth' | 'gym' | 'eggs';

function fmt(n: number): string {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

export default function StatsPage() {
  const { playerId } = useAuth();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [growth, setGrowth] = useState<GrowthData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [lbTab, setLbTab] = useState<LeaderboardTab>('total');
  const [growthLb, setGrowthLb] = useState<GrowthLeaderEntry[]>([]);
  const [growthDays, setGrowthDays] = useState(30);

  const loadStats = useCallback(() => {
    const pid = selectedPlayer || playerId;
    if (!pid) return;
    setLoading(true);
    // apiFetch already reports unexpected failures to Sentry — callsite just falls back.
    Promise.all([
      api.statSnapshots(pid).catch(() => ({ snapshots: [] })),
      api.statGrowth(pid, 30).catch(() => null),
      api.statLeaderboard().catch(() => ({ members: [] })),
      api.statGrowthLeaderboard(growthDays).catch(() => ({ members: [] })),
    ]).then(([snapsRes, growthRes, lbRes, glbRes]) => {
      setSnapshots((snapsRes as { snapshots: Snapshot[] }).snapshots || []);
      setGrowth(growthRes as GrowthData | null);
      setLeaderboard((lbRes as { members: LeaderboardEntry[] }).members || []);
      setGrowthLb((glbRes as { members: GrowthLeaderEntry[] }).members || []);
    }).finally(() => setLoading(false));
  }, [playerId, selectedPlayer, growthDays]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const currentPid = selectedPlayer || playerId;

  // Snapshots arrive at most once per UTC day, so >36h ≈ collector skipped ≥1 cycle.
  const freshness = useMemo(() => {
    if (!snapshots.length) return null;
    const latest = snapshots[snapshots.length - 1];
    if (!latest?.snapshot_date) return null;
    const ageMs = Date.now() - new Date(`${latest.snapshot_date}T00:00:00Z`).getTime();
    const ageHours = Math.max(0, ageMs / 3_600_000);
    return { latestDate: latest.snapshot_date, ageHours, stale: ageHours > 36 };
  }, [snapshots]);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Stat Growth</h1>
            <p className="text-text-secondary text-sm mt-1">
              Track battle stat progress over time. Data refreshed every 15 minutes.
            </p>
          </div>
          <RefreshButton onRefresh={loadStats} />
        </div>

        <PageExplainer id="stats" title="Stat Growth — What's here?" bullets={[
          "Battle stats (STR, DEF, SPD, DEX) grow every time you train at the gym. This page tracks that growth over time so you can see if your training routine is working.",
          "Xanax gives +250E, refills restore your energy bar, and stat enhancers (SEs) give a direct stat boost — tracking these helps you understand where your gains come from.",
          "Growth rate (per day) tells you how efficiently you're training. If your rate drops, you may need to switch gyms, optimize happy, or adjust your energy management.",
          "The faction leaderboard shows relative strength — see where you stand compared to other members and identify who might need training advice.",
          "Snapshot history shows training consistency. Gaps or flat lines mean missed training days. Consistent daily gains compound into massive advantages over months.",
          "Happiness directly affects how many stats you gain per energy in the gym — always train with high happy.",
          "Move to a better property to increase your happiness cap. Private Island is ideal for the airstrip bonus too.",
          "Switzerland rehab (level 15+) restores happiness to maximum in a single rehab — cheapest way to refill.",
          "Candy + Ecstasy combo: eat candies first (booster cooldown), then use Ecstasy to double your current happiness.",
        ]} dataSources={["Stat snapshots collected automatically every 15 minutes", "Personalstats from Torn API via player keys", "Historical data stored in local database"]} links={[["Torn Wiki: Gym", "https://wiki.torn.com/wiki/Gym"], ["Torn Wiki: Battle Stats", "https://wiki.torn.com/wiki/Battle_Stats"], ["Torn Wiki: Properties", "https://wiki.torn.com/wiki/Properties"]]} />

        {freshness && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs ${
              freshness.stale
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                : 'border-text-secondary/10 bg-bg-card/40 text-text-muted'
            }`}
          >
            {freshness.stale ? (
              <>
                <span className="font-semibold">Data may be stale.</span>{' '}
                Latest snapshot is from <span className="font-mono">{freshness.latestDate}</span>{' '}
                ({Math.round(freshness.ageHours)}h ago). The collector usually runs every 15 minutes —
                if this doesn&apos;t change after a refresh, ping an admin.
              </>
            ) : (
              <>Latest snapshot: <span className="font-mono">{freshness.latestDate}</span> · refreshed every 15 min.</>
            )}
          </div>
        )}

        {loading && !snapshots.length ? (
          <div className="text-text-secondary text-sm animate-pulse">Loading stat data...</div>
        ) : snapshots.length === 0 ? (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center">
            {currentPid === playerId ? (
              <p className="text-text-secondary">No stat snapshots for you yet. Stats are collected for members who registered their API key in TM Hub — make sure you completed the login flow. If you registered today, the first snapshot lands within 15 minutes.</p>
            ) : (
              <p className="text-text-secondary">
                No stat snapshots for{' '}
                <span className="font-semibold">
                  {leaderboard.find(m => m.player_id === currentPid)?.player_name
                    || growthLb.find(m => m.player_id === currentPid)?.player_name
                    || `player ${currentPid}`}
                </span>
                {' '}yet. Stats are only collected for members who registered their API key in TM Hub. Once they do, snapshots refresh every 15 minutes.
              </p>
            )}
            <p className="text-text-muted text-xs mt-2">Snapshots are taken automatically every 15 minutes.</p>
          </div>
        ) : (
          <>
            {/* Growth summary cards */}
            {growth && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
                  Growth — last {growth.days} days
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {(['strength', 'defense', 'speed', 'dexterity', 'total'] as const).map(stat => (
                    <div key={stat} className="bg-bg-card border border-text-secondary/20 rounded-lg p-3 text-center">
                      <p className="text-xs text-text-secondary mb-1 uppercase">{stat === 'total' ? 'Total' : stat.slice(0, 3)}</p>
                      <p className={`text-lg font-bold ${growth.growth[stat] > 0 ? 'text-torn-green' : growth.growth[stat] < 0 ? 'text-danger' : 'text-text-muted'}`}>
                        {growth.growth[stat] > 0 ? '+' : ''}{fmt(growth.growth[stat])}
                      </p>
                      <p className="text-xs text-text-muted">
                        {fmt(growth.per_day[stat])}/day
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chart */}
            <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">Stat History</h3>
              <StatGrowthChart snapshots={snapshots} />
            </div>
          </>
        )}

        {/* Faction leaderboards */}
        {(leaderboard.length > 0 || growthLb.length > 0) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
                Faction Leaderboards
              </h3>
              {(lbTab === 'growth' || lbTab === 'gym' || lbTab === 'eggs') && (
                <div className="flex gap-1">
                  {[7, 14, 30, 90].map(d => (
                    <button key={d} onClick={() => setGrowthDays(d)}
                      className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                        growthDays === d ? 'bg-torn-green/20 text-torn-green font-semibold' : 'bg-bg-elevated text-text-muted hover:text-text-secondary'
                      }`}>{d}d</button>
                  ))}
                </div>
              )}
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 border-b border-border">
              {([
                ['total', 'Total Stats'] as const,
                ['growth', 'Stat Growth'] as const,
                ['gym', 'Energy Spent'] as const,
                ...(getActiveEvent()?.id === 'easter' ? [['eggs', 'Easter Eggs'] as const] : []),
              ] as ReadonlyArray<readonly [LeaderboardTab, string]>).map(([key, label]) => (
                <button key={key} onClick={() => setLbTab(key as LeaderboardTab)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                    lbTab === key ? 'border-torn-green text-torn-green' : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}>{label}</button>
              ))}
            </div>

            {lbTab === 'total' && leaderboard.length > 0 && (
              <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Player</th>
                        <th className="py-2 px-3">Total</th>
                        <th className="py-2 px-3">STR</th>
                        <th className="py-2 px-3">DEF</th>
                        <th className="py-2 px-3">SPD</th>
                        <th className="py-2 px-3">DEX</th>
                        <th className="py-2 px-3">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((m, i) => (
                        <tr key={m.player_id}
                            className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors cursor-pointer ${m.player_id === currentPid ? 'bg-torn-green/10' : ''}`}
                            onClick={() => setSelectedPlayer(m.player_id)}>
                          <td className="py-1.5 px-3 text-text-muted">{i + 1}</td>
                          <td className="py-1.5 px-3 text-text-primary font-medium">
                            {m.player_name || `#${m.player_id}`}
                            <span className="ml-1 text-[10px] text-text-muted">[{m.player_id}]</span>
                            {m.player_id === playerId && <span className="ml-1 text-xs text-torn-green">(you)</span>}
                            {selectedPlayer && selectedPlayer !== playerId && m.player_id === selectedPlayer && <span className="ml-1 text-xs text-text-muted">(viewing)</span>}
                          </td>
                          <td className="py-1.5 px-3 font-semibold text-torn-green">{fmt(m.total)}</td>
                          <td className="py-1.5 px-3">{fmt(m.strength)}</td>
                          <td className="py-1.5 px-3">{fmt(m.defense)}</td>
                          <td className="py-1.5 px-3">{fmt(m.speed)}</td>
                          <td className="py-1.5 px-3">{fmt(m.dexterity)}</td>
                          <td className="py-1.5 px-3 text-text-muted text-xs">{m.snapshot_date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {lbTab === 'growth' && (
              <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Player</th>
                        <th className="py-2 px-3 text-right">Growth</th>
                        <th className="py-2 px-3 text-right">% Growth</th>
                        <th className="py-2 px-3 text-right">/day</th>
                        <th className="py-2 px-3 text-right hidden sm:table-cell">Xanax</th>
                        <th className="py-2 px-3 text-right hidden sm:table-cell">SEs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {growthLb.length > 0 ? growthLb.map((m, i) => (
                        <tr key={m.player_id}
                            className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors cursor-pointer ${m.player_id === currentPid ? 'bg-torn-green/10' : ''}`}
                            onClick={() => setSelectedPlayer(m.player_id)}>
                          <td className="py-1.5 px-3 text-text-muted">{i + 1}</td>
                          <td className="py-1.5 px-3 text-text-primary font-medium">
                            {m.player_name}
                            {m.player_id === playerId && <span className="ml-1 text-xs text-torn-green">(you)</span>}
                            {selectedPlayer && selectedPlayer !== playerId && m.player_id === selectedPlayer && <span className="ml-1 text-xs text-text-muted">(viewing)</span>}
                          </td>
                          <td className="py-1.5 px-3 text-right font-semibold text-torn-green">+{fmt(m.total_growth)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-torn-green">{m.pct_growth.toFixed(2)}%</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-text-secondary">{fmt(m.per_day)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-text-muted hidden sm:table-cell">{m.xanax_delta != null ? `+${m.xanax_delta}` : '—'}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-text-muted hidden sm:table-cell">{m.se_delta != null ? `+${m.se_delta}` : '—'}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={7} className="py-4 text-center text-text-muted text-xs">Need at least 2 snapshots to show growth data — collected automatically every 15 minutes</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {lbTab === 'gym' && (
              <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Player</th>
                        <th className="py-2 px-3 text-right">Energy</th>
                        <th className="py-2 px-3 text-right">Xanax</th>
                        <th className="py-2 px-3 text-right hidden sm:table-cell">Refills</th>
                        <th className="py-2 px-3 text-right">Stat Growth</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const energySorted = [...growthLb].filter(m => m.energy_spent != null && m.energy_spent > 0)
                          .sort((a, b) => (b.energy_spent ?? 0) - (a.energy_spent ?? 0));
                        return energySorted.length > 0 ? energySorted.map((m, i) => (
                          <tr key={m.player_id}
                              className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors cursor-pointer ${m.player_id === currentPid ? 'bg-torn-green/10' : ''}`}
                              onClick={() => setSelectedPlayer(m.player_id)}>
                            <td className="py-1.5 px-3 text-text-muted">{i + 1}</td>
                            <td className="py-1.5 px-3 text-text-primary font-medium">
                              {m.player_name}
                              {m.player_id === playerId && <span className="ml-1 text-xs text-torn-green">(you)</span>}
                            {selectedPlayer && selectedPlayer !== playerId && m.player_id === selectedPlayer && <span className="ml-1 text-xs text-text-muted">(viewing)</span>}
                            </td>
                            <td className="py-1.5 px-3 text-right font-semibold text-torn-green">{m.energy_spent != null ? `${m.energy_spent.toLocaleString()}E` : '—'}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-text-secondary">{m.xanax_delta != null ? `+${m.xanax_delta}` : '—'}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-text-muted hidden sm:table-cell">{m.refills_delta != null ? `+${m.refills_delta}` : '—'}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-text-secondary">+{fmt(m.total_growth)}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={6} className="py-4 text-center text-text-muted text-xs">Energy tracking needs at least 2 snapshots — collected automatically every 15 minutes</td></tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 border-t border-border-light">
                  <p className="text-[10px] text-text-muted">Real gym energy from Torn personalstats (gymstrength + gymdefense + gymspeed + gymdexterity). Needs 2+ snapshots with gym data.</p>
                </div>
              </div>
            )}

            {lbTab === 'eggs' && (
              <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Player</th>
                        <th className="py-2 px-3 text-right">Total Eggs</th>
                        <th className="py-2 px-3 text-right">This Period</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const eggSorted = [...growthLb]
                          .filter(m => (m.easter_eggs_total != null && m.easter_eggs_total > 0) || (m.easter_eggs_delta != null && m.easter_eggs_delta > 0))
                          .sort((a, b) => (b.easter_eggs_total || 0) - (a.easter_eggs_total || 0));
                        return eggSorted.length > 0 ? eggSorted.map((m, i) => (
                          <tr key={m.player_id}
                              className={`border-b border-border-light hover:bg-bg-elevated/50 transition-colors ${m.player_id === currentPid ? 'bg-torn-green/10' : ''}`}>
                            <td className="py-1.5 px-3 text-text-muted">{i + 1}</td>
                            <td className="py-1.5 px-3 text-text-primary font-medium">
                              {m.player_name}
                              {m.player_id === playerId && <span className="ml-1 text-xs text-torn-green">(you)</span>}
                            {selectedPlayer && selectedPlayer !== playerId && m.player_id === selectedPlayer && <span className="ml-1 text-xs text-text-muted">(viewing)</span>}
                            </td>
                            <td className="py-1.5 px-3 text-right font-semibold text-torn-green">{(m.easter_eggs_total || 0).toLocaleString()}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-text-secondary">
                              {m.easter_eggs_delta != null && m.easter_eggs_delta > 0 ? `+${m.easter_eggs_delta}` : '—'}
                            </td>
                          </tr>
                        )) : (
                          <tr><td colSpan={4} className="py-4 text-center text-text-muted text-xs">
                            No easter egg data yet. Click &quot;Collect Stats Now&quot; in Admin to fetch the latest data.
                          </td></tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 border-t border-border-light">
                  <p className="text-[10px] text-text-muted">Total eggs from Torn personalstats. &quot;This Period&quot; shows eggs collected in the last {growthDays} days (needs 2+ snapshots).</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
