'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { PageExplainer } from '@/components/layout/PageExplainer';

interface MarketItem {
  item_id: number;
  name: string;
  market_value: number;
  cheapest_price: number | null;
  cheapest_amount: number;
  avg_top5_price: number;
  total_available: number;
  listings_count: number;
  discount_pct: number;
  error?: string;
}

function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function MarketPage() {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = () => {
    setLoading(true);
    api.marketPrices()
      .then(d => {
        setItems((d as { items: MarketItem[] }).items);
        setLastUpdate(new Date());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Market Scanner</h1>
            <p className="text-text-secondary text-sm mt-1">
              Live prices for key training and war items from the Item Market.
            </p>
          </div>
          <button onClick={load} disabled={loading}
                  className="px-4 py-2 bg-torn-green text-white text-sm font-semibold rounded-lg hover:bg-torn-green/90 transition-colors disabled:opacity-50">
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <PageExplainer id="market" title="Market Scanner — What's here?" bullets={[
          "Live prices for key training and war items from the Torn Item Market.",
          "Compares cheapest listing to market value — green border = below market price.",
          "Click 'Buy on Market' to jump directly to that item on Torn.",
          "Prices cached for 2 minutes. Hit Refresh for latest data.",
          "Tracks: Xanax, Stat Enhancer, FHC, Energy Drinks, Ecstasy, and more.",
        ]} />

        {loading && items.length === 0 ? (
          <div className="text-text-secondary text-sm animate-pulse">Loading market data...</div>
        ) : (
          <>
            {/* Cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(item => (
                <div key={item.item_id}
                     className={`bg-bg-card border rounded-xl p-4 space-y-2 ${
                       item.discount_pct > 3 ? 'border-torn-green/40' :
                       item.discount_pct < -3 ? 'border-danger/40' :
                       'border-text-secondary/20'
                     }`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-text-primary text-sm">{item.name}</h3>
                    {item.discount_pct !== 0 && !item.error && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        item.discount_pct > 0
                          ? 'bg-torn-green/20 text-torn-green'
                          : 'bg-danger/20 text-danger'
                      }`}>
                        {item.discount_pct > 0 ? '-' : '+'}{Math.abs(item.discount_pct)}%
                      </span>
                    )}
                  </div>

                  {item.error ? (
                    <p className="text-xs text-danger">Failed to load</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-text-secondary">Market value</span>
                          <p className="text-text-primary font-medium">{fmtMoney(item.market_value)}</p>
                        </div>
                        <div>
                          <span className="text-text-secondary">Cheapest</span>
                          <p className={`font-medium ${
                            item.cheapest_price && item.cheapest_price < item.market_value
                              ? 'text-torn-green' : 'text-text-primary'
                          }`}>
                            {item.cheapest_price ? fmtMoney(item.cheapest_price) : '—'}
                          </p>
                        </div>
                        <div>
                          <span className="text-text-secondary">Avg (top 5)</span>
                          <p className="text-text-primary font-medium">{fmtMoney(item.avg_top5_price)}</p>
                        </div>
                        <div>
                          <span className="text-text-secondary">Available</span>
                          <p className="text-text-primary font-medium">
                            {item.total_available.toLocaleString()} ({item.listings_count} sellers)
                          </p>
                        </div>
                      </div>

                      {item.cheapest_price && (
                        <a href={`https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=${item.item_id}`}
                           target="_blank"
                           className="block text-center text-xs text-torn-green hover:underline mt-1">
                          Buy on Market
                        </a>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {lastUpdate && (
          <p className="text-xs text-text-muted text-center">
            Last updated: {lastUpdate.toLocaleTimeString()} — prices cached for 2 minutes
          </p>
        )}
      </div>
    </div>
  );
}
