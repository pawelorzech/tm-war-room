'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';

interface Reservation {
  player_id: number;
  player_name: string;
  target_level: number;
}

interface NPC {
  id: number;
  name: string;
  status: string;
  hosp_out: number;
  level: number;
  next_level_at: number | null;
  level_times: Record<string, number>;
  updated: number;
  reservations: Reservation[];
}

interface LootData {
  npcs: NPC[];
  count: number;
  fetched_at: number;
}

const LEVEL_COLORS = ['', 'text-text-muted', 'text-torn-blue', 'text-torn-green', 'text-torn-yellow', 'text-torn-red'];
const LEVEL_BG = ['', 'bg-text-muted/10', 'bg-torn-blue/10', 'bg-torn-green/10', 'bg-torn-yellow/10', 'bg-torn-red/10'];

function Countdown({ targetTs }: { targetTs: number }) {
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, []);
  const diff = Math.max(0, targetTs - now);
  if (diff <= 0) return <span className="text-torn-green font-semibold">Ready!</span>;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = Math.floor(diff % 60);
  return (
    <span className="font-mono text-text-primary">
      {h > 0 ? `${h}h ` : ''}{m.toString().padStart(2, '0')}m {s.toString().padStart(2, '0')}s
    </span>
  );
}

function LevelBar({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(l => (
        <div key={l} className={`h-1.5 w-5 rounded-full transition-colors ${l <= level ? (
          l <= 2 ? 'bg-torn-blue' : l <= 3 ? 'bg-torn-green' : l <= 4 ? 'bg-torn-yellow' : 'bg-torn-red'
        ) : 'bg-bg-elevated'}`} />
      ))}
    </div>
  );
}

export default function LootPage() {
  const { playerId } = useAuth();
  const [data, setData] = useState<LootData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    setError(null);
    api.lootTimers().then(d => setData(d as LootData))
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    const timer = setInterval(loadData, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleReserve = async (npc: NPC, level: number) => {
    await api.lootReserve(npc.id, npc.name, level);
    loadData();
  };

  const handleCancel = async (npcId: number) => {
    await api.lootCancelReserve(npcId);
    loadData();
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">NPC Loot Timers</h1>
            <p className="text-text-secondary text-sm mt-1">Live loot levels, countdowns, and reservations. Auto-refreshes every 30s.</p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="loot" title="NPC Loot — What's here?" bullets={[
          "NPCs accumulate loot over time in 5 levels (more looters = higher level).",
          "Level 2: +30min, Level 3: +90min, Level 4: +3.5h, Level 5: +7.5h after hospital release.",
          "Reserve an NPC — claim which one you want to hit and at what level. Others see your claim.",
          "Data from TornStats, refreshed every 30 seconds automatically.",
        ]} />

        {loading && !data ? (
          <div className="text-text-secondary text-sm animate-pulse">Loading NPC loot data...</div>
        ) : error ? (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-danger text-sm">{error}</div>
        ) : data ? (
          <div className="space-y-3">
            {data.npcs.map(npc => {
              const isHosp = npc.status?.toLowerCase().includes('hosp');
              const myReservation = npc.reservations?.find(r => r.player_id === playerId);

              return (
                <div key={npc.id}
                  className={`bg-bg-card border rounded-xl p-4 transition-colors ${
                    npc.level >= 4 ? 'border-torn-yellow/30' :
                    npc.level >= 3 ? 'border-torn-green/20' :
                    'border-text-secondary/15'
                  }`}>
                  {/* NPC header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={`https://www.torn.com/loader.php?sid=attack&user2ID=${npc.id}`}
                          target="_blank"
                          className="text-base font-semibold text-text-primary hover:text-torn-green transition-colors">
                          {npc.name}
                        </a>
                        <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${LEVEL_BG[npc.level]} ${LEVEL_COLORS[npc.level]}`}>
                          Lv {npc.level}
                        </span>
                        {isHosp && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-torn-red/15 text-torn-red font-medium">Hospital</span>
                        )}
                        {npc.reservations?.length > 0 && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-torn-blue/15 text-torn-blue font-medium">
                            {npc.reservations.length} reserved
                          </span>
                        )}
                      </div>
                      <LevelBar level={npc.level} />
                    </div>

                    <div className="text-right shrink-0">
                      {npc.next_level_at ? (
                        <div>
                          <p className="text-[10px] text-text-muted uppercase">Next level in</p>
                          <Countdown targetTs={npc.next_level_at} />
                        </div>
                      ) : npc.level >= 5 ? (
                        <div>
                          <p className="text-[10px] text-text-muted uppercase">Status</p>
                          <p className="text-torn-red font-bold">MAX LOOT</p>
                        </div>
                      ) : isHosp && npc.hosp_out ? (
                        <div>
                          <p className="text-[10px] text-text-muted uppercase">Leaves hospital</p>
                          <Countdown targetTs={npc.hosp_out} />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Level timeline */}
                  {Object.keys(npc.level_times).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-text-muted">
                      {[2, 3, 4, 5].map(lvl => {
                        const ts = npc.level_times[String(lvl)];
                        if (!ts) return null;
                        const isPast = Date.now() / 1000 >= ts;
                        const time = new Date(ts * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                        return (
                          <span key={lvl} className={isPast ? LEVEL_COLORS[lvl] : 'text-text-muted'}>
                            L{lvl}: {time} {isPast ? '\u2713' : ''}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Reservations */}
                  {npc.reservations?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border-light">
                      <div className="flex flex-wrap gap-1.5">
                        {npc.reservations.map(r => (
                          <span key={r.player_id}
                            className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                              r.player_id === playerId
                                ? 'bg-torn-green/20 text-torn-green'
                                : 'bg-bg-elevated text-text-secondary'
                            }`}>
                            {r.player_name || `#${r.player_id}`} @ Lv{r.target_level}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reserve / Cancel buttons */}
                  <div className="mt-2 flex items-center gap-2">
                    {myReservation ? (
                      <button onClick={() => handleCancel(npc.id)}
                        className="text-xs text-danger hover:underline">
                        Cancel my reservation
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-text-muted">Reserve at:</span>
                        {[3, 4, 5].map(lvl => (
                          <button key={lvl} onClick={() => handleReserve(npc, lvl)}
                            className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${
                              LEVEL_BG[lvl]} ${LEVEL_COLORS[lvl]} hover:opacity-80`}>
                            Lv{lvl}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {data.npcs.length === 0 && (
              <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
                No NPC loot data available.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
