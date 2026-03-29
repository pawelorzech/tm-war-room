'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';

interface PlayerData {
  player_id: number;
  player_name: string;
  strength: number;
  defense: number;
  speed: number;
  dexterity: number;
  total: number;
  confidence: string;
  source: string;
  level?: number;
  stat_estimate?: { estimated_total: number; confidence: string };
}

function fmtStat(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString();
}

function StatBar({ label, a, b, maxVal }: { label: string; a: number; b: number; maxVal: number }) {
  const pctA = maxVal > 0 ? (a / maxVal) * 100 : 0;
  const pctB = maxVal > 0 ? (b / maxVal) * 100 : 0;
  const winner = a > b ? 'a' : b > a ? 'b' : 'tie';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-text-muted">
        <span>{label}</span>
        <span>{winner === 'tie' ? 'Tie' : ''}</span>
      </div>
      <div className="flex gap-1 items-center">
        {/* Player A bar (right-aligned) */}
        <div className="flex-1 flex justify-end">
          <div className={`h-5 rounded-l transition-all ${winner === 'a' ? 'bg-torn-green' : 'bg-torn-green/40'}`}
            style={{ width: `${Math.max(2, pctA)}%` }} />
        </div>
        {/* Divider */}
        <div className="w-px h-6 bg-border shrink-0" />
        {/* Player B bar (left-aligned) */}
        <div className="flex-1">
          <div className={`h-5 rounded-r transition-all ${winner === 'b' ? 'bg-torn-blue' : 'bg-torn-blue/40'}`}
            style={{ width: `${Math.max(2, pctB)}%` }} />
        </div>
      </div>
      <div className="flex justify-between text-xs tabular-nums">
        <span className={winner === 'a' ? 'text-torn-green font-semibold' : 'text-text-muted'}>{fmtStat(a)}</span>
        <span className={winner === 'b' ? 'text-torn-blue font-semibold' : 'text-text-muted'}>{fmtStat(b)}</span>
      </div>
    </div>
  );
}

export default function ComparePage() {
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');
  const [playerA, setPlayerA] = useState<PlayerData | null>(null);
  const [playerB, setPlayerB] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const compare = async () => {
    const a = parseInt(idA);
    const b = parseInt(idB);
    if (!a || !b) { setError('Enter two player IDs'); return; }
    if (a === b) { setError('Enter two different player IDs'); return; }
    setError('');
    setLoading(true);
    try {
      const [ra, rb] = await Promise.all([
        api.spyEstimate(a).catch(() => null),
        api.spyEstimate(b).catch(() => null),
      ]);
      if (!ra && !rb) { setError('No spy data found for either player'); setLoading(false); return; }
      setPlayerA(ra as PlayerData | null);
      setPlayerB(rb as PlayerData | null);
    } catch {
      setError('Failed to load player data');
    } finally {
      setLoading(false);
    }
  };

  const bothLoaded = playerA && playerB;
  const maxStat = bothLoaded ? Math.max(
    playerA.strength, playerA.defense, playerA.speed, playerA.dexterity,
    playerB.strength, playerB.defense, playerB.speed, playerB.dexterity,
  ) : 0;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold">Stat Comparison</h1>
        <p className="text-text-secondary text-sm">Compare two players side-by-side using spy data.</p>

        <PageExplainer id="compare" title="Stat Comparison — How to use this" bullets={[
          "Enter two player IDs to compare their battle stats side-by-side. Uses spy data from our database.",
          "Green bars = Player A advantage. Blue bars = Player B advantage. Longer bar = stronger in that stat.",
          "Data comes from spy reports and TornStats estimates. If a player has no spy data, try looking them up on the Spy Central page first.",
        ]}
        dataSources={["Spy estimates database", "TornStats API"]}
        />

        {/* Input */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs text-text-muted mb-1 block">Player A (ID)</label>
            <input type="text" inputMode="numeric" value={idA}
              onChange={e => setIdA(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && compare()}
              placeholder="e.g. 2362436"
              className="w-full bg-bg-card border border-text-secondary/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-torn-green/50" />
          </div>
          <span className="text-text-muted font-bold pb-2">vs</span>
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs text-text-muted mb-1 block">Player B (ID)</label>
            <input type="text" inputMode="numeric" value={idB}
              onChange={e => setIdB(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && compare()}
              placeholder="e.g. 1234567"
              className="w-full bg-bg-card border border-text-secondary/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-torn-green/50" />
          </div>
          <button onClick={compare} disabled={loading}
            className="px-4 py-2 bg-torn-green text-white rounded-lg text-sm font-medium hover:bg-torn-green/90 disabled:opacity-50 transition-colors">
            {loading ? 'Loading...' : 'Compare'}
          </button>
        </div>

        {error && <p className="text-danger text-sm">{error}</p>}

        {/* Results */}
        {bothLoaded && (
          <div className="space-y-4">
            {/* Player headers */}
            <div className="flex justify-between items-center">
              <div className="text-left">
                <a href={`https://www.torn.com/profiles.php?XID=${playerA.player_id}`} target="_blank"
                  className="font-bold text-torn-green hover:underline">{playerA.player_name || `#${playerA.player_id}`}</a>
                <p className="text-[10px] text-text-muted">
                  Total: {fmtStat(playerA.total)} · {playerA.confidence}
                </p>
              </div>
              <div className="text-right">
                <a href={`https://www.torn.com/profiles.php?XID=${playerB.player_id}`} target="_blank"
                  className="font-bold text-torn-blue hover:underline">{playerB.player_name || `#${playerB.player_id}`}</a>
                <p className="text-[10px] text-text-muted">
                  Total: {fmtStat(playerB.total)} · {playerB.confidence}
                </p>
              </div>
            </div>

            {/* Total comparison */}
            <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-4">
              <StatBar label="Total Battle Stats" a={playerA.total} b={playerB.total}
                maxVal={Math.max(playerA.total, playerB.total)} />
            </div>

            {/* Individual stats */}
            <div className="bg-bg-card border border-text-secondary/15 rounded-xl p-4 space-y-4">
              <StatBar label="Strength" a={playerA.strength} b={playerB.strength} maxVal={maxStat} />
              <StatBar label="Defense" a={playerA.defense} b={playerB.defense} maxVal={maxStat} />
              <StatBar label="Speed" a={playerA.speed} b={playerB.speed} maxVal={maxStat} />
              <StatBar label="Dexterity" a={playerA.dexterity} b={playerB.dexterity} maxVal={maxStat} />
            </div>

            {/* Verdict */}
            <div className={`rounded-xl p-4 text-center ${
              playerA.total > playerB.total ? 'bg-torn-green/10 border border-torn-green/20' :
              playerB.total > playerA.total ? 'bg-torn-blue/10 border border-torn-blue/20' :
              'bg-bg-card border border-text-secondary/15'
            }`}>
              {playerA.total > playerB.total ? (
                <p className="text-sm font-medium text-torn-green">
                  {playerA.player_name} is stronger by {fmtStat(playerA.total - playerB.total)} stats ({((playerA.total / playerB.total - 1) * 100).toFixed(0)}% advantage)
                </p>
              ) : playerB.total > playerA.total ? (
                <p className="text-sm font-medium text-torn-blue">
                  {playerB.player_name} is stronger by {fmtStat(playerB.total - playerA.total)} stats ({((playerB.total / playerA.total - 1) * 100).toFixed(0)}% advantage)
                </p>
              ) : (
                <p className="text-sm font-medium text-text-secondary">Dead even!</p>
              )}
            </div>

            <p className="text-[10px] text-text-muted text-center">
              Data: spy estimates · Confidence: {playerA.confidence} vs {playerB.confidence} · Source: {playerA.source}, {playerB.source}
            </p>
          </div>
        )}

        {/* Single player loaded */}
        {playerA && !playerB && (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-4 text-center text-text-secondary">
            No spy data for Player B. Try looking them up on <a href="/spy" className="text-torn-green underline">Spy Central</a> first.
          </div>
        )}
        {!playerA && playerB && (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-4 text-center text-text-secondary">
            No spy data for Player A. Try looking them up on <a href="/spy" className="text-torn-green underline">Spy Central</a> first.
          </div>
        )}
      </div>
    </div>
  );
}
