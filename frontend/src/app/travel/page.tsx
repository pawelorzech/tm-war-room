'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { CardSkeleton } from '@/components/layout/LoadingSkeleton';

interface TravelItem {
  name: string;
  market_value: number;
  buy_price: number;
  sell_price: number;
  item_id: number;
}

interface Country {
  id: string;
  name: string;
  flag: string;
  travel_min: number;
  items: TravelItem[];
  best_value: number;
}

interface TravelData {
  countries: Country[];
  count: number;
}

const MARKET_FEE = 0.05; // 5% Item Market fee

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

/** Net profit after 5% market fee */
function itemProfit(item: TravelItem): number {
  const sellAfterFee = item.market_value * (1 - MARKET_FEE);
  return sellAfterFee - item.buy_price;
}

/** Compute trip profit for top N items */
function tripProfit(items: TravelItem[], capacity: number): number {
  const profitable = items
    .map(i => ({ ...i, profit: itemProfit(i) }))
    .filter(i => i.profit > 0)
    .sort((a, b) => b.profit - a.profit);
  return profitable.slice(0, capacity).reduce((sum, i) => sum + i.profit, 0);
}

export default function TravelPage() {
  const [data, setData] = useState<TravelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [travelers, setTravelers] = useState<{ id: number; name: string; status: string }[]>([]);
  const [capacity, setCapacity] = useState(5);
  const [sortBy, setSortBy] = useState<'profit' | 'time' | 'perHour'>('perHour');

  const loadData = useCallback(() => {
    setLoading(true);
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
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const sortedCountries = useMemo(() => {
    if (!data) return [];
    return [...data.countries].map(c => {
      const tp = tripProfit(c.items, capacity);
      const roundTripMin = c.travel_min * 2;
      const perHour = roundTripMin > 0 ? (tp / (roundTripMin / 60)) : 0;
      return { ...c, tripProfit: tp, perHour, roundTripMin };
    }).sort((a, b) => {
      if (sortBy === 'profit') return b.tripProfit - a.tripProfit;
      if (sortBy === 'time') return a.travel_min - b.travel_min;
      return b.perHour - a.perHour; // default: $/hour
    });
  }, [data, capacity, sortBy]);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Travel Planner</h1>
            <p className="text-text-secondary text-sm mt-1">Profit calculator — what to buy and where.</p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="travel" title="Travel Planner — How to use this" bullets={[
          "Each country shows items you can buy abroad and sell on the Torn market. Profit = market sell price minus 5% Item Market fee minus buy price.",
          "TRIP PROFIT shows how much you'd make filling your inventory with the most profitable items. PROFIT/HR factors in round-trip travel time — higher = better.",
          "Set your carrying capacity below (default 5). Large Suitcase = 9, Business Class = 10, Private Island Airstrip = 15+.",
          "Sort by $/hour for the best return on your time. Short trips (Mexico, Cayman) often beat long trips despite lower per-item profit.",
          "Green profit = worth buying. Red = you'd lose money. Items are sorted by profit per item.",
        ]}
        dataSources={["Torn API v1 item prices, cached 5min", "Static travel times and item lists"]}
        links={[["Torn Wiki: Travel", "https://wiki.torn.com/wiki/Travel"], ["TornTravel.com", "https://www.torntravel.com"]]}
        />

        {/* Controls */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary">Capacity:</label>
            <div className="flex gap-1">
              {[5, 9, 10, 15, 20].map(n => (
                <button key={n} onClick={() => setCapacity(n)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    capacity === n ? 'bg-torn-green/20 text-torn-green font-semibold' : 'bg-bg-card text-text-secondary hover:bg-bg-elevated'
                  }`}>
                  {n}
                </button>
              ))}
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
                <a key={t.id} href={`https://www.torn.com/profiles.php?XID=${t.id}`} target="_blank"
                  className="px-2.5 py-1 text-xs rounded-full bg-torn-blue/10 text-torn-blue hover:bg-torn-blue/20 transition-colors font-medium">
                  {t.name} <span className="text-torn-blue/60">— {t.status}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <CardSkeleton count={4} />
        ) : sortedCountries.length > 0 ? (
          <div className="space-y-2">
            {sortedCountries.map((c, rank) => {
              const isOpen = expandedId === c.id;
              const profitItems = c.items
                .map(i => ({ ...i, profit: itemProfit(i) }))
                .sort((a, b) => b.profit - a.profit);
              const bestItem = profitItems[0];

              return (
                <div key={c.id} className={`bg-bg-card border rounded-xl overflow-hidden ${
                  rank === 0 ? 'border-torn-green/30' : 'border-text-secondary/15'
                }`}>
                  <button onClick={() => setExpandedId(isOpen ? null : c.id)}
                    className="w-full text-left p-4 hover:bg-bg-elevated/50 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-2xl">{FLAGS[c.flag] || c.flag}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-text-primary">{c.name}</p>
                            {rank === 0 && (
                              <span className="px-1.5 py-0.5 text-[9px] rounded font-bold bg-torn-green/15 text-torn-green">BEST $/HR</span>
                            )}
                          </div>
                          <p className="text-xs text-text-muted">
                            {fmtTime(c.travel_min)} one-way · {fmtTime(c.roundTripMin)} round trip · {c.items.length} items
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <p className={`text-sm font-bold ${c.tripProfit > 0 ? 'text-torn-green' : 'text-danger'}`}>
                            {c.tripProfit > 0 ? '+' : ''}{fmtMoney(c.tripProfit)}
                          </p>
                          <p className="text-[10px] text-text-muted">
                            trip ({capacity} items)
                          </p>
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
                      {/* Recommendation */}
                      {bestItem && bestItem.profit > 0 && (
                        <div className="bg-torn-green/5 border border-torn-green/15 rounded-lg px-3 py-2 mt-2 mb-2">
                          <p className="text-xs text-torn-green font-medium">
                            Buy {Math.min(capacity, profitItems.filter(i => i.profit > 0).length)}x most profitable items.
                            Best: {bestItem.name} (+{fmtMoney(bestItem.profit)} profit each after 5% fee).
                          </p>
                        </div>
                      )}

                      <table className="w-full text-sm mt-2">
                        <thead>
                          <tr className="text-left text-text-muted text-xs uppercase tracking-wider">
                            <th className="py-1.5 pr-3">Item</th>
                            <th className="py-1.5 pr-3 text-right">Abroad Cost</th>
                            <th className="py-1.5 pr-3 text-right">Market Price</th>
                            <th className="py-1.5 pr-3 text-right">After 5% Fee</th>
                            <th className="py-1.5 text-right">Profit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profitItems.map((item, idx) => {
                            const afterFee = item.market_value * (1 - MARKET_FEE);
                            const wouldBuy = idx < capacity && item.profit > 0;
                            return (
                              <tr key={item.name} className={`border-t border-border-light/50 ${wouldBuy ? '' : 'opacity-40'}`}>
                                <td className="py-1.5 pr-3 text-text-primary">
                                  {item.name}
                                  {wouldBuy && (
                                    <span className="ml-1 text-[9px] text-torn-green font-bold">BUY</span>
                                  )}
                                </td>
                                <td className="py-1.5 pr-3 text-right tabular-nums text-text-secondary">
                                  {item.buy_price > 0 ? fmtMoney(item.buy_price) : '—'}
                                </td>
                                <td className="py-1.5 pr-3 text-right tabular-nums text-text-secondary">
                                  {item.market_value > 0 ? fmtMoney(item.market_value) : '—'}
                                </td>
                                <td className="py-1.5 pr-3 text-right tabular-nums text-text-muted">
                                  {item.market_value > 0 ? fmtMoney(afterFee) : '—'}
                                </td>
                                <td className={`py-1.5 text-right tabular-nums font-medium ${item.profit > 0 ? 'text-torn-green' : item.profit < 0 ? 'text-danger' : 'text-text-muted'}`}>
                                  {item.profit !== 0 ? `${item.profit > 0 ? '+' : ''}${fmtMoney(item.profit)}` : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Footer */}
        <p className="text-[10px] text-text-muted text-center">
          Profit = Market Price - 5% Item Market Fee - Abroad Cost · Prices from Torn API, cached 5min
        </p>
      </div>
    </div>
  );
}
