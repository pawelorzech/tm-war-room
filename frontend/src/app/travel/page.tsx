'use client';

import { useState, useEffect, useCallback } from 'react';
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

const FLAGS: Record<string, string> = {
  MX: '\uD83C\uDDF2\uD83C\uDDFD', KY: '\uD83C\uDDF0\uD83C\uDDFE', CA: '\uD83C\uDDE8\uD83C\uDDE6',
  US: '\uD83C\uDDFA\uD83C\uDDF8', GB: '\uD83C\uDDEC\uD83C\uDDE7', AR: '\uD83C\uDDE6\uD83C\uDDF7',
  CH: '\uD83C\uDDE8\uD83C\uDDED', JP: '\uD83C\uDDEF\uD83C\uDDF5', CN: '\uD83C\uDDE8\uD83C\uDDF3',
  AE: '\uD83C\uDDE6\uD83C\uDDEA', ZA: '\uD83C\uDDFF\uD83C\uDDE6',
};

function fmtMoney(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtTime(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function TravelPage() {
  const [data, setData] = useState<TravelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [travelers, setTravelers] = useState<{ id: number; name: string; status: string }[]>([]);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.travelInfo(),
      api.overview().catch(() => null),
    ]).then(([travel, overview]) => {
      setData(travel as TravelData);
      if (overview) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const members = ((overview as any).members || []) as { id: number; name: string; status: string }[];
        setTravelers(members.filter(m => {
          const s = (m.status || '').toLowerCase();
          return s.includes('travel') || s.includes('abroad') || s.includes('returning');
        }));
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Travel Planner</h1>
            <p className="text-text-secondary text-sm mt-1">Items available abroad with current market prices.</p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="travel" title="Travel Planner — What's here?" bullets={[
          "Browse items available in each country with current Torn market prices.",
          "Travel times shown for each destination.",
          "Click a country to see all available items with values.",
          "Prices update every 5 minutes from Torn API.",
        ]} />

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
        ) : data ? (
          <div className="space-y-2">
            {data.countries.map(c => {
              const isOpen = expandedId === c.id;
              return (
                <div key={c.id} className="bg-bg-card border border-text-secondary/15 rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedId(isOpen ? null : c.id)}
                    className="w-full text-left p-4 hover:bg-bg-elevated/50 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-2xl">{FLAGS[c.flag] || c.flag}</span>
                        <div>
                          <p className="font-semibold text-text-primary">{c.name}</p>
                          <p className="text-xs text-text-muted">{fmtTime(c.travel_min)} travel &middot; {c.items.length} items</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-semibold text-torn-green">{fmtMoney(c.best_value)}</p>
                          <p className="text-[10px] text-text-muted">best item</p>
                        </div>
                        <span className="text-text-muted text-xs">{isOpen ? '▾' : '▸'}</span>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border-light px-4 pb-3">
                      <table className="w-full text-sm mt-2">
                        <thead>
                          <tr className="text-left text-text-muted text-xs uppercase tracking-wider">
                            <th className="py-1.5 pr-3">Item</th>
                            <th className="py-1.5 pr-3 text-right">Market Value</th>
                            <th className="py-1.5 pr-3 text-right">Buy Price</th>
                            <th className="py-1.5 text-right">Sell Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.items.map(item => (
                            <tr key={item.name} className="border-t border-border-light/50">
                              <td className="py-1.5 pr-3 text-text-primary">{item.name}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums font-medium text-torn-green">
                                {item.market_value > 0 ? fmtMoney(item.market_value) : '—'}
                              </td>
                              <td className="py-1.5 pr-3 text-right tabular-nums text-text-secondary">
                                {item.buy_price > 0 ? fmtMoney(item.buy_price) : '—'}
                              </td>
                              <td className="py-1.5 text-right tabular-nums text-text-secondary">
                                {item.sell_price > 0 ? fmtMoney(item.sell_price) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
