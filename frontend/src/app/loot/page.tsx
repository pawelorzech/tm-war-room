'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { api } from '@/lib/api-client';
import { usePageVisible } from '@/hooks/usePageVisible';
import { useAuth } from '@/hooks/useAuth';
import { useSort } from '@/hooks/useSort';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { CardSkeleton } from '@/components/layout/LoadingSkeleton';

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

// Shared clock so all Countdown instances use one setInterval instead of N
let _nowSec = Date.now() / 1000;
let _listeners = new Set<() => void>();
let _timer: ReturnType<typeof setInterval> | null = null;

function _subscribe(cb: () => void) {
  _listeners.add(cb);
  if (!_timer) {
    _timer = setInterval(() => {
      _nowSec = Date.now() / 1000;
      _listeners.forEach(l => l());
    }, 1000);
  }
  return () => {
    _listeners.delete(cb);
    if (_listeners.size === 0 && _timer) {
      clearInterval(_timer);
      _timer = null;
    }
  };
}
function _getSnapshot() { return _nowSec; }

function useSharedClock() {
  return useSyncExternalStore(_subscribe, _getSnapshot, _getSnapshot);
}

function Countdown({ targetTs }: { targetTs: number }) {
  const now = useSharedClock();
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

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    api.lootTimers().then(d => setData(d as LootData))
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const visible = usePageVisible();

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(loadData, 30000);
    return () => clearInterval(timer);
  }, [loadData, visible]);

  const { sorted: sortedNpcs, sortCol, sortDir, toggle: toggleSort } = useSort(data?.npcs ?? [], 'level');

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
          "NPCs (Duke, Leslie, Jimmy, etc.) accumulate loot in 5 levels after leaving hospital. Level 4 is the sweet spot — drops worth $5-50M including rare items. Level 5 gives the best loot but takes much longer to reach.",
          "Timing is everything: NPCs respawn at specific intervals after being hospitalized. Loot levels increase over time — Level 2: +30min, Level 3: +90min, Level 4: +3.5h, Level 5: +7.5h after hospital release. Plan your attacks around these windows.",
          "Reserve an NPC to coordinate with your faction — claim which NPC you want to hit and at what loot level. This prevents multiple faction members from wasting attacks on the same target at low levels.",
          "Pro tip: Attack at Level 4+ for the best return on your energy. Coordinate with faction members so everyone benefits — one person looting at Level 2 wastes potential profit for everyone.",
          "Never attack NPCs solo — the distraction mechanic means you'll get counter-attacked without team support.",
          "Loot levels: L1 at hosp out, L2 at +30min, L3 at +1h, L4 at +2h, L5 at +4h.",
          "Faction teams typically hit at Level 4. Only hit when others are hitting to benefit from distraction.",
          "Seasonal NPCs: Easter Bunny appears in April, Scrooge during Christmas.",
          "5 lootable NPCs: Duke [4], Leslie [15], Jimmy [19], Fernando [20], Tiny [21] — numbers are their Torn levels.",
        ]}
        dataSources={["Torn API v2 NPC data", "Loot timers estimated from Torn attack reports", "Community-sourced NPC schedules"]}
        links={[["Torn Wiki: NPC", "https://wiki.torn.com/wiki/NPC"], ["Torn Wiki: Loot", "https://wiki.torn.com/wiki/Loot"]]}
        />

        {loading && !data ? (
          <CardSkeleton count={5} />
        ) : error ? (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-danger text-sm">{error}</div>
        ) : data ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span>Sort by:</span>
              <button onClick={() => toggleSort('name')}
                className={`px-2 py-1 rounded transition-colors ${sortCol === 'name' ? 'bg-torn-green/20 text-torn-green font-medium' : 'hover:text-text-secondary'}`}>
                Name {sortCol === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
              </button>
              <button onClick={() => toggleSort('level')}
                className={`px-2 py-1 rounded transition-colors ${sortCol === 'level' ? 'bg-torn-green/20 text-torn-green font-medium' : 'hover:text-text-secondary'}`}>
                Level {sortCol === 'level' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
              </button>
            </div>
            {sortedNpcs.map(npc => {
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

            {sortedNpcs.length === 0 && (
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
