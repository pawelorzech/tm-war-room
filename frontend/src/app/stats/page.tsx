'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import dynamic from 'next/dynamic';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';

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

  const loadStats = useCallback(() => {
    const pid = selectedPlayer || playerId;
    if (!pid) return;
    setLoading(true);
    Promise.all([
      api.statSnapshots(pid).catch(() => ({ snapshots: [] })),
      api.statGrowth(pid, 30).catch(() => null),
      api.statLeaderboard().catch(() => ({ members: [] })),
    ]).then(([snapsRes, growthRes, lbRes]) => {
      setSnapshots((snapsRes as { snapshots: Snapshot[] }).snapshots || []);
      setGrowth(growthRes as GrowthData | null);
      setLeaderboard((lbRes as { members: LeaderboardEntry[] }).members || []);
    }).finally(() => setLoading(false));
  }, [playerId, selectedPlayer]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const currentPid = selectedPlayer || playerId;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Stat Growth</h1>
            <p className="text-text-secondary text-sm mt-1">
              Track battle stat progress over time. Data collected daily at 4:00 UTC.
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
        ]} dataSources={["Daily stat snapshots collected at 04:00 UTC", "Personalstats from Torn API via player keys", "Historical data stored in local database"]} links={[["Torn Wiki: Gym", "https://wiki.torn.com/wiki/Gym"], ["Torn Wiki: Battle Stats", "https://wiki.torn.com/wiki/Battle_Stats"]]} />

        {loading && !snapshots.length ? (
          <div className="text-text-secondary text-sm animate-pulse">Loading stat data...</div>
        ) : snapshots.length === 0 ? (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center">
            <p className="text-text-secondary">No stat snapshots yet. Data starts collecting after you register your API key.</p>
            <p className="text-text-muted text-xs mt-2">Snapshots are taken daily at 4:00 UTC.</p>
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

        {/* Faction leaderboard */}
        {leaderboard.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
              Faction Leaderboard ({leaderboard.length})
            </h3>
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
                          {m.player_id === currentPid && <span className="ml-1 text-xs text-torn-green">(viewing)</span>}
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
          </div>
        )}
      </div>
    </div>
  );
}
