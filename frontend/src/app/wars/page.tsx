'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { CardSkeleton } from '@/components/layout/LoadingSkeleton';

interface WarFaction {
  faction_id: number;
  name: string;
  score: number;
  chain?: number;
}

interface RankedWar {
  war_id: number;
  start: number;
  end: number;
  target: number;
  winner: number;
  factions: WarFaction[];
}

interface Raid {
  raid_id: string;
  start: number;
  end: number;
  winner: number;
  factions: WarFaction[];
}

interface TerritoryWar {
  territory_id: string;
  start: number;
  end: number;
  territory: string;
  attacking_faction: number;
  defending_faction: number;
  winner: number;
}

interface WarData {
  ranked: RankedWar | null;
  raids: Raid[];
  territory: TerritoryWar[];
}

function fmtDate(ts: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(start: number, end: number): string {
  if (!start || !end) return '—';
  const diff = end - start;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isActive(start: number, end: number): boolean {
  const now = Date.now() / 1000;
  return start > 0 && (end === 0 || end > now);
}

export default function WarsPage() {
  const [data, setData] = useState<WarData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    setLoading(true);
    api.warHistory()
      .then(d => setData(d as WarData))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">War Reports</h1>
            <p className="text-text-secondary text-sm mt-1">Ranked wars, raids, and territory battles.</p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="wars" title="War Reports — What's here?" bullets={[
          "Ranked War: current or most recent ranked war with scores.",
          "Raids: faction raids with attacker/defender scores.",
          "Territory: territory war history.",
        ]} />

        {loading ? (
          <CardSkeleton count={2} />
        ) : data ? (
          <div className="space-y-6">
            {/* Ranked War */}
            <section>
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">Ranked War</h2>
              {data.ranked ? (
                <div className={`bg-bg-card border rounded-xl p-4 ${isActive(data.ranked.start, data.ranked.end) ? 'border-torn-red/40' : 'border-text-secondary/15'}`}>
                  {isActive(data.ranked.start, data.ranked.end) && (
                    <div className="text-xs font-bold text-torn-red uppercase mb-2" style={{ animation: 'tm-countdown-pulse 2s infinite' }}>
                      Active War
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-xs text-text-muted">
                      Started {fmtDate(data.ranked.start)}
                      {data.ranked.end > 0 && ` · Ended ${fmtDate(data.ranked.end)}`}
                      {data.ranked.end > 0 && ` · Duration: ${fmtDuration(data.ranked.start, data.ranked.end)}`}
                    </p>
                    {data.ranked.winner > 0 && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-torn-green/15 text-torn-green">
                        Winner: {data.ranked.factions.find(f => f.faction_id === data.ranked!.winner)?.name || `#${data.ranked.winner}`}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {data.ranked.factions.map(f => (
                      <div key={f.faction_id} className={`rounded-lg border p-3 ${
                        f.faction_id === data.ranked!.winner ? 'border-torn-green/30 bg-torn-green/5' : 'border-border-light'
                      }`}>
                        <p className="font-semibold text-text-primary">{f.name || `Faction #${f.faction_id}`}</p>
                        <div className="flex gap-4 mt-1 text-sm">
                          <div>
                            <span className="text-text-muted text-xs">Score</span>
                            <p className="text-xl font-bold">{f.score}</p>
                          </div>
                          {f.chain !== undefined && f.chain > 0 && (
                            <div>
                              <span className="text-text-muted text-xs">Chain</span>
                              <p className="text-xl font-bold text-text-secondary">{f.chain}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-4 text-center text-text-secondary text-sm">
                  No ranked war data available.
                </div>
              )}
            </section>

            {/* Raids */}
            <section>
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
                Raids ({data.raids.length})
              </h2>
              {data.raids.length > 0 ? (
                <div className="space-y-2">
                  {data.raids.slice(0, 20).map(r => (
                    <div key={r.raid_id} className="bg-bg-card border border-text-secondary/15 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {r.factions.map(f => (
                              <span key={f.faction_id} className={`text-sm font-medium ${
                                f.faction_id === r.winner ? 'text-torn-green' : 'text-text-primary'
                              }`}>
                                {f.name || `#${f.faction_id}`} ({f.score})
                              </span>
                            ))}
                          </div>
                          <p className="text-xs text-text-muted mt-0.5">
                            {fmtDate(r.start)} · {r.end > 0 ? fmtDuration(r.start, r.end) : 'Active'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-text-secondary text-sm">No raid data.</p>
              )}
            </section>

            {/* Territory */}
            {data.territory.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
                  Territory Wars ({data.territory.length})
                </h2>
                <div className="space-y-2">
                  {data.territory.slice(0, 20).map(t => (
                    <div key={t.territory_id} className="bg-bg-card border border-text-secondary/15 rounded-xl p-3">
                      <p className="text-sm font-medium">{t.territory || t.territory_id}</p>
                      <p className="text-xs text-text-muted">
                        {fmtDate(t.start)} · {t.end > 0 ? fmtDuration(t.start, t.end) : 'Active'}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
