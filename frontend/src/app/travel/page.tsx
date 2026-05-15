'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { CardSkeleton } from '@/components/layout/LoadingSkeleton';
import { calculateRehabCostPerXanax } from '@/lib/formulas';
import { ErrorBanner } from '@/components/layout/ErrorBanner';

interface TravelItem {
  name: string;
  item_id: number;
  abroad_cost: number;
  market_value: number;
  quantity: number;
  profit: number;
  source: string;
}

interface Country {
  id: string;
  name: string;
  flag: string;
  travel_min: number;
  items: TravelItem[];
  best_profit: number;
  last_update: number;
  data_source: string;
}

interface TravelData {
  countries: Country[];
  count: number;
}

const FLAGS: Record<string, string> = {
  MX: '\uD83C\uDDF2\uD83C\uDDFD', KY: '\uD83C\uDDF0\uD83C\uDDFE', CA: '\uD83C\uDDE8\uD83C\uDDE6',
  US: '\uD83C\uDDFA\uD83C\uDDF8', GB: '\uD83C\uDDEC\uD83C\uDDE7', AR: '\uD83C\uDDE6\uD83C\uDDF7',
  CH: '\uD83C\uDDE8\uD83C\uDDED', JP: '\uD83C\uDDEF\uD83C\uDDF5', CN: '\uD83C\uDDE8\uD83C\uDDF3',
  AE: '\uD83C\uDDE6\uD83C\uDDEA', ZA: '\uD83C\uDDFF\uD83C\uDDE6',
};

function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtTime(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function timeAgo(ts: number): string {
  if (!ts) return 'unknown';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function TravelPage() {
  const [data, setData] = useState<TravelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [travelers, setTravelers] = useState<{ id: number; name: string; status: string }[]>([]);
  const [capacity, setCapacity] = useState(5);
  const [capacityInput, setCapacityInput] = useState('5');
  const [sortBy, setSortBy] = useState<'profit' | 'time' | 'perHour'>('perHour');
  const [error, setError] = useState<string | null>(null);

  // Rehab calculator state
  const [rehabOpen, setRehabOpen] = useState(false);
  const [rehabCount, setRehabCount] = useState('');
  const [rehabCountInput, setRehabCountInput] = useState('');
  const [hasToleration, setHasToleration] = useState(false);
  const [xanaxPerDay, setXanaxPerDay] = useState(2);
  const [rehabLoaded, setRehabLoaded] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.travelInfo(),
      api.overview().catch(() => null),
    ]).then(([travel, overview]) => {
      setData(travel as TravelData);
      if (overview) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const members = ((overview as any).members || []) as Record<string, unknown>[];
        setTravelers(members.filter(m => {
          const st = m.status;
          const desc = typeof st === 'string' ? st : (st && typeof st === 'object') ? ((st as Record<string, string>).description || '') : '';
          const s = desc.toLowerCase();
          return s.includes('travel') || s.includes('abroad') || s.includes('returning');
        }).map(m => {
          const st = m.status;
          const desc = typeof st === 'string' ? st : (st && typeof st === 'object') ? ((st as Record<string, string>).description || '') : '';
          return { id: m.id as number, name: m.name as string, status: desc };
        }));
      }
    }).catch(e => setError(e instanceof Error ? e.message : 'Failed to load travel data')).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-load rehab count from training stats API
  useEffect(() => {
    if (rehabOpen && !rehabLoaded) {
      api.trainingStats().then(d => {
        const rehabs = d.personalstats?.rehabs || 0;
        setRehabCount(String(rehabs));
        setRehabCountInput(String(rehabs));
        setRehabLoaded(true);
      }).catch(() => setRehabLoaded(true));
    }
  }, [rehabOpen, rehabLoaded]);

  const rehabCalc = useMemo(() => {
    const rehabs = parseInt(rehabCount) || 0;
    const costPerAP = Math.min(2857 + 12.85 * rehabs, 250000);
    const addictionPerXanax = hasToleration ? 17.5 : 35;
    const dailyDecay = 20;
    const netDailyAddiction = Math.max(addictionPerXanax * xanaxPerDay - dailyDecay, 0);
    const rehabCostPerXanax = calculateRehabCostPerXanax(rehabs, hasToleration);
    const dailyRehabCost = rehabCostPerXanax * xanaxPerDay;
    const monthlyRehabCost = dailyRehabCost * 30;
    // AP removed per $250K session (decays with rehabs done)
    const apPerSession = Math.max(1, Math.round(90 - (rehabs * 89 / 20000)));
    // Sessions needed per day to clear net addiction
    const sessionsPerDay = netDailyAddiction > 0 ? Math.ceil(netDailyAddiction / apPerSession) : 0;
    const dailySessionCost = sessionsPerDay * 250000;
    return { rehabs, costPerAP, addictionPerXanax, dailyDecay, netDailyAddiction, rehabCostPerXanax, dailyRehabCost, monthlyRehabCost, apPerSession, sessionsPerDay, dailySessionCost };
  }, [rehabCount, hasToleration, xanaxPerDay]);

  const sortedCountries = useMemo(() => {
    if (!data) return [];
    return [...data.countries].map(c => {
      const bestProfit = c.best_profit;
      const tripTotal = bestProfit * capacity;
      const roundTripMin = c.travel_min * 2;
      const perHour = roundTripMin > 0 ? (tripTotal / (roundTripMin / 60)) : 0;
      return { ...c, tripTotal, perHour, roundTripMin };
    }).sort((a, b) => {
      if (sortBy === 'profit') return b.tripTotal - a.tripTotal;
      if (sortBy === 'time') return a.travel_min - b.travel_min;
      return b.perHour - a.perHour;
    });
  }, [data, capacity, sortBy]);

  const setCapacityVal = (n: number) => {
    setCapacity(n);
    setCapacityInput(String(n));
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Travel Planner</h1>
            <p className="text-text-secondary text-sm mt-1">Profit calculator with live abroad prices from YATA.</p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="travel" title="Travel Planner — How to use this" bullets={[
          "Abroad prices come from YATA (community-sourced, updated when players travel). Market prices from Torn API. Profit = market price - 5% fee - abroad cost.",
          "TRIP PROFIT = best item profit x your capacity. PROFIT/HR factors in round-trip time. Higher = better use of your time.",
          "Stock quantity shows how many are available — 0 means sold out (wait for restock). Prices may change with supply.",
          "Sort by $/hour for best ROI. Short trips (Mexico 26min) can beat long ones despite lower per-item profit.",
          "Flowers and plushies are the safest items to run — low total cost (~300K) means minimal mug risk.",
          "Check abroad stock on YATA (yata.yt/bazaar/abroad) before flying — shops can run out.",
          "Protect yourself while selling: self-hosp with wrong blood bag, or travel immediately after listing.",
          "Private Island with airstrip + pilot = 30% faster travel + 10 extra item capacity.",
          "All market sales have a 5% fee — factor this into profit calculations.",
        ]}
        dataSources={["YATA /api/v1/travel/export/ — abroad stock & prices, cached 15min", "Torn API v1 items — market values, cached 5min"]}
        links={[["Torn Wiki: Travel", "https://wiki.torn.com/wiki/Travel"], ["TornTravel.com", "https://www.torntravel.com"], ["YATA Travel", "https://yata.yt/bazaar/abroad/"], ["Torn Wiki: Properties", "https://wiki.torn.com/wiki/Properties"]]}
        />

        {/* Controls */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary">Items per trip:</label>
            <div className="flex gap-1 items-center">
              {[5, 10, 15, 20, 29].map(n => (
                <button key={n} onClick={() => setCapacityVal(n)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    capacity === n ? 'bg-torn-green/20 text-torn-green font-semibold' : 'bg-bg-card text-text-secondary hover:bg-bg-elevated'
                  }`}>
                  {n}
                </button>
              ))}
              <input type="text" inputMode="numeric" value={capacityInput}
                onChange={e => setCapacityInput(e.target.value)}
                onBlur={() => {
                  const n = Math.max(1, Math.min(50, parseInt(capacityInput) || 5));
                  setCapacity(n);
                  setCapacityInput(String(n));
                }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="w-12 bg-bg-card border border-text-secondary/20 rounded px-1.5 py-1 text-xs text-center text-text-primary tabular-nums focus:outline-none focus:border-torn-green/50"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-text-secondary">Sort:</label>
            <div className="flex gap-1">
              {([['perHour', '$/hour'], ['profit', 'Trip $'], ['time', 'Fastest']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setSortBy(key as typeof sortBy)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    sortBy === key ? 'bg-torn-green/20 text-torn-green font-semibold' : 'bg-bg-card text-text-secondary hover:bg-bg-elevated'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Currently traveling members */}
        {travelers.length > 0 && (
          <div className="bg-bg-card border border-torn-blue/20 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-torn-blue mb-2">Currently Traveling ({travelers.length})</h2>
            <div className="flex flex-wrap gap-2">
              {travelers.map(t => (
                <a key={t.id} href={`https://www.torn.com/profiles.php?XID=${t.id}`} target="_blank" rel="noopener noreferrer"
                  className="px-2.5 py-1 text-xs rounded-full bg-torn-blue/10 text-torn-blue hover:bg-torn-blue/20 transition-colors font-medium">
                  {t.name} <span className="text-torn-blue/60">— {t.status}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <CardSkeleton count={4} />
        ) : error ? (
          <ErrorBanner message={error} onRetry={loadData} />
        ) : sortedCountries.length > 0 ? (
          <div className="space-y-2">
            {sortedCountries.map((c, rank) => {
              const isOpen = expandedId === c.id;
              const bestItem = c.items[0];

              return (
                <div key={c.id} className={`bg-bg-card border rounded-xl overflow-hidden ${
                  rank === 0 && c.perHour > 0 ? 'border-torn-green/30' : 'border-text-secondary/15'
                }`}>
                  <button onClick={() => setExpandedId(isOpen ? null : c.id)}
                    className="w-full text-left p-4 hover:bg-bg-elevated/50 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-2xl">{FLAGS[c.flag] || c.flag}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-text-primary">{c.name}</p>
                            {rank === 0 && c.perHour > 0 && (
                              <span className="px-1.5 py-0.5 text-[9px] rounded font-bold bg-torn-green/15 text-torn-green">BEST $/HR</span>
                            )}
                          </div>
                          <p className="text-xs text-text-muted">
                            {fmtTime(c.travel_min)} one-way · {fmtTime(c.roundTripMin)} round trip · {c.items.length} items
                            {c.last_update > 0 && ` · prices ${timeAgo(c.last_update)}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <p className={`text-sm font-bold ${c.tripTotal > 0 ? 'text-torn-green' : 'text-danger'}`}>
                            {c.tripTotal > 0 ? '+' : ''}{fmtMoney(c.tripTotal)}
                          </p>
                          <p className="text-[10px] text-text-muted">trip ({capacity} items)</p>
                        </div>
                        <div className="text-right hidden sm:block">
                          <p className={`text-sm font-semibold ${c.perHour > 0 ? 'text-torn-green' : 'text-text-muted'}`}>
                            {fmtMoney(c.perHour)}
                          </p>
                          <p className="text-[10px] text-text-muted">per hour</p>
                        </div>
                        <span className="text-text-muted text-xs">{isOpen ? '▾' : '▸'}</span>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border-light px-4 pb-3">
                      {bestItem && bestItem.profit > 0 && (
                        <div className="bg-torn-green/5 border border-torn-green/15 rounded-lg px-3 py-2 mt-2 mb-2">
                          <p className="text-xs text-torn-green font-medium">
                            Fill all {capacity} slots with {bestItem.name} — {fmtMoney(bestItem.profit)} profit each after 5% fee = {fmtMoney(bestItem.profit * capacity)} total.
                          </p>
                        </div>
                      )}

                      {c.items.length > 0 ? (
                        <div className="overflow-x-auto">
                        <table className="w-full text-sm mt-2 min-w-[520px]">
                          <thead>
                            <tr className="text-left text-text-muted text-xs uppercase tracking-wider">
                              <th className="py-1.5 pr-3">Item</th>
                              <th className="py-1.5 pr-3 text-right">Abroad</th>
                              <th className="py-1.5 pr-3 text-right">Market</th>
                              <th className="py-1.5 pr-3 text-right">After Fee</th>
                              <th className="py-1.5 pr-3 text-right">Profit</th>
                              <th className="py-1.5 text-right">Stock</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.items.map((item, idx) => {
                              const profitable = item.profit > 0;
                              const isBest = idx === 0 && profitable;
                              const afterFee = Math.floor(item.market_value * 0.95);
                              return (
                                <tr key={item.name} className={`border-t border-border-light/50 ${profitable ? '' : 'opacity-40'}`}>
                                  <td className="py-1.5 pr-3 text-text-primary">
                                    {item.name}
                                    {isBest && (
                                      <span className="ml-1 px-1.5 py-0.5 text-[9px] text-torn-green font-bold bg-torn-green/10 rounded">BEST</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums text-text-secondary">
                                    {item.abroad_cost > 0 ? fmtMoney(item.abroad_cost) : '—'}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums text-text-secondary">
                                    {item.market_value > 0 ? fmtMoney(item.market_value) : '—'}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums text-text-muted">
                                    {item.market_value > 0 ? fmtMoney(afterFee) : '—'}
                                  </td>
                                  <td className={`py-1.5 pr-3 text-right tabular-nums font-medium ${item.profit > 0 ? 'text-torn-green' : item.profit < 0 ? 'text-danger' : 'text-text-muted'}`}>
                                    {item.profit !== 0 ? `${item.profit > 0 ? '+' : ''}${fmtMoney(item.profit)}` : '—'}
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums text-text-muted text-xs">
                                    {item.quantity > 0 ? item.quantity.toLocaleString() : (
                                      <span className="text-danger">SOLD OUT</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        </div>
                      ) : (
                        <p className="text-sm text-text-muted mt-2">No price data available — YATA needs players to visit this country.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Rehab Calculator — Switzerland is a travel destination for rehab */}
        <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
          <button onClick={() => setRehabOpen(!rehabOpen)}
            className="w-full text-left p-4 hover:bg-bg-elevated/50 transition-colors flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{'\uD83C\uDDE8\uD83C\uDDED'}</span>
              <div>
                <p className="font-semibold text-text-primary">Rehab Calculator</p>
                <p className="text-xs text-text-muted">Switzerland rehab cost estimator — plan your Xanax expenses</p>
              </div>
            </div>
            <span className="text-text-muted text-xs">{rehabOpen ? '\u25BE' : '\u25B8'}</span>
          </button>

          {rehabOpen && (
            <div className="border-t border-border-light px-4 pb-4 space-y-4">
              {/* Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="text-xs text-text-secondary block mb-1">Total rehabs done</label>
                  <input type="text" inputMode="numeric" value={rehabCountInput}
                    onChange={e => setRehabCountInput(e.target.value)}
                    onBlur={() => {
                      const n = Math.max(0, parseInt(rehabCountInput) || 0);
                      setRehabCount(String(n));
                      setRehabCountInput(String(n));
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    placeholder={rehabLoaded ? '0' : 'Loading...'}
                    className="w-full bg-bg-elevated border border-text-secondary/20 rounded px-2.5 py-1.5 text-sm tabular-nums text-text-primary focus:outline-none focus:border-torn-green/50"
                  />
                  <p className="text-[10px] text-text-muted mt-0.5">From your personalstats (auto-loaded)</p>
                </div>
                <div>
                  <label className="text-xs text-text-secondary block mb-1">Xanax per day</label>
                  <div className="flex gap-1">
                    {[1, 2].map(n => (
                      <button key={n} onClick={() => setXanaxPerDay(n)}
                        className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
                          xanaxPerDay === n ? 'bg-torn-green/20 text-torn-green font-semibold' : 'bg-bg-elevated text-text-secondary hover:bg-bg-elevated/80'
                        }`}>
                        {n}x
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-text-secondary block mb-1">Faction Toleration</label>
                  <button onClick={() => setHasToleration(!hasToleration)}
                    className={`w-full px-3 py-1.5 text-sm rounded transition-colors ${
                      hasToleration ? 'bg-torn-green/20 text-torn-green font-semibold' : 'bg-bg-elevated text-text-secondary hover:bg-bg-elevated/80'
                    }`}>
                    {hasToleration ? 'Yes (-50% addiction)' : 'No toleration'}
                  </button>
                  <p className="text-[10px] text-text-muted mt-0.5">Faction perk reduces AP per Xanax</p>
                </div>
              </div>

              {/* Results */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-bg-elevated rounded-lg p-3 text-center">
                  <p className="text-xs text-text-secondary">Cost per AP</p>
                  <p className="text-lg font-bold text-text-primary">{fmtMoney(rehabCalc.costPerAP)}</p>
                  <p className="text-[10px] text-text-muted">{rehabCalc.costPerAP >= 250000 ? 'MAXED' : `${rehabCalc.rehabs} rehabs done`}</p>
                </div>
                <div className="bg-bg-elevated rounded-lg p-3 text-center">
                  <p className="text-xs text-text-secondary">AP per Xanax</p>
                  <p className="text-lg font-bold text-text-primary">{rehabCalc.addictionPerXanax}</p>
                  <p className="text-[10px] text-text-muted">{hasToleration ? '35 - 50% toleration' : 'No toleration'}</p>
                </div>
                <div className="bg-bg-elevated rounded-lg p-3 text-center">
                  <p className="text-xs text-text-secondary">Net daily AP</p>
                  <p className={`text-lg font-bold ${rehabCalc.netDailyAddiction > 0 ? 'text-danger' : 'text-torn-green'}`}>
                    {rehabCalc.netDailyAddiction > 0 ? `+${rehabCalc.netDailyAddiction.toFixed(1)}` : '0'}
                  </p>
                  <p className="text-[10px] text-text-muted">{xanaxPerDay}x xanax - {rehabCalc.dailyDecay} decay</p>
                </div>
                <div className="bg-bg-elevated rounded-lg p-3 text-center">
                  <p className="text-xs text-text-secondary">Rehab/session</p>
                  <p className="text-lg font-bold text-text-primary">{rehabCalc.apPerSession} AP</p>
                  <p className="text-[10px] text-text-muted">per $250K session</p>
                </div>
              </div>

              {/* Cost summary */}
              <div className="bg-torn-green/5 border border-torn-green/15 rounded-lg p-3 space-y-1">
                <p className="text-sm font-medium text-text-primary">Daily cost breakdown</p>
                {rehabCalc.netDailyAddiction <= 0 ? (
                  <p className="text-xs text-torn-green">
                    With {xanaxPerDay}x Xanax/day{hasToleration ? ' + Toleration' : ''}, natural decay ({rehabCalc.dailyDecay} AP/day) clears all addiction. No rehab needed!
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-text-secondary">
                      Sessions needed: <span className="font-semibold text-text-primary">{rehabCalc.sessionsPerDay}/day</span> ({rehabCalc.netDailyAddiction.toFixed(1)} net AP / {rehabCalc.apPerSession} AP per session)
                    </p>
                    <p className="text-xs text-text-secondary">
                      Daily rehab cost: <span className="font-semibold text-danger">{fmtMoney(rehabCalc.dailySessionCost)}</span>
                    </p>
                    <p className="text-xs text-text-secondary">
                      Monthly rehab cost: <span className="font-semibold text-danger">{fmtMoney(rehabCalc.dailySessionCost * 30)}</span>
                    </p>
                  </>
                )}
              </div>

              {/* Educational info */}
              <div className="text-xs text-text-muted space-y-1">
                <p><strong>How it works:</strong> Each Xanax adds {hasToleration ? '17.5' : '35'} addiction points (AP). Natural decay removes ~20 AP/day at reset. If your daily AP intake exceeds decay, you accumulate addiction.</p>
                <p><strong>Rehab cost formula:</strong> Cost per AP = min($2,857 + $12.85 × rehabs_done, $250,000). Each $250K session removes ~{rehabCalc.apPerSession} AP (decreases with more rehabs done).</p>
                <p><strong>Tip:</strong> With Toleration, 1 Xanax/day = 17.5 AP, well under the 20 AP decay. Even 2x/day (35 AP) needs only minimal rehab. Without Toleration, 2x/day = 70 AP - 20 decay = 50 AP/day building up.</p>
              </div>
            </div>
          )}
        </div>

        <p className="text-[10px] text-text-muted text-center">
          Abroad prices: YATA (community-sourced) · Market prices: Torn API · Profit = Market - 5% fee - Abroad cost
        </p>
      </div>
    </div>
  );
}
