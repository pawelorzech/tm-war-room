'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api-client';
import { useSort } from '@/hooks/useSort';
import { SortableHeader } from '@/components/layout/SortableHeader';
import { PageExplainer } from '@/components/layout/PageExplainer';
import { RefreshButton } from '@/components/layout/RefreshButton';
import { ErrorBanner } from '@/components/layout/ErrorBanner';
import { TableSkeleton } from '@/components/layout/LoadingSkeleton';

interface MarketItem {
  id: number;
  name: string;
  type: string;
  market_value: number;
  buy_price: number;
  sell_price: number;
  circulation: number;
  profit_buy_sell: number;
  profit_margin_pct: number;
  is_shop?: boolean;
  country_slug?: string | null;
  country_name?: string | null;
  country_flag?: string | null;
}

type Filter = 'top20' | 'all' | 'profitable' | 'tradeable';

function fmtMoney(n: number): string {
  if (!n) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function MarketPage() {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('top20');
  const [taxPct, setTaxPct] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    api.marketPrices()
      .then(d => {
        const data = d as { items: MarketItem[] };
        setItems(data.items);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load market data'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Get unique item types
  const types = [...new Set(items.map(i => i.type).filter(Boolean))].sort();

  // Compute filtered list (sorting handled by useSort)
  const filteredItems = useMemo(() => {
    let list = items;

    // Type filter
    if (typeFilter) list = list.filter(i => i.type === typeFilter);

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }

    // Filter
    if (filter === 'top20') {
      list = list.filter(i => i.profit_buy_sell > 0 && i.buy_price > 0);
      list = [...list].sort((a, b) => b.profit_buy_sell - a.profit_buy_sell);
      list = list.slice(0, 20);
    } else if (filter === 'profitable') {
      list = list.filter(i => {
        const netProfit = i.profit_buy_sell * (1 - taxPct / 100);
        return netProfit > 0;
      });
    } else if (filter === 'tradeable') {
      list = list.filter(i => i.market_value > 0 && i.buy_price > 0);
    }

    return list;
  }, [items, typeFilter, search, filter, taxPct]);

  const { sorted: displayItems, sortCol, sortDir, toggle: toggleSort } = useSort(filteredItems, 'market_value');

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Market Scanner</h1>
            <p className="text-text-secondary text-sm mt-1">
              All Torn items with profit calculations.
              <span className="ml-2 text-text-muted">({items.length} items loaded)</span>
            </p>
          </div>
          <RefreshButton onRefresh={loadData} />
        </div>

        <PageExplainer id="market" title="Market Scanner — What's here?" bullets={[
          "Torn's item market lets players buy and sell items. Profit opportunities exist when NPC buy prices are lower than player market prices — buy from NPCs, sell on the market for profit.",
          "Key items to watch: flowers and plushies (collected sets are valuable), drugs (Xanax, LSD, ecstasy for energy/happiness), energy drinks (FHCs, cans), and travel items (country-specific goods with high resale margins).",
          "The Top 20 Profit filter shows the best money-making items right now. Use the tax toggle to simulate potential sell fees and see your real net profit margin.",
          "Price tracking matters because Torn's market fluctuates based on supply/demand, events, and updates. Items that are profitable today may not be tomorrow — check regularly for the best arbitrage opportunities.",
        ]}
        dataSources={["Torn API v2 market prices, cached 60s", "Prices update with each market refresh"]}
        links={[["Torn Wiki: Item Market", "https://wiki.torn.com/wiki/Item_Market"]]}
        />

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <input type="text" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full max-w-[200px] bg-bg-card border border-text-secondary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-torn-green/50" />

          <div className="flex gap-1">
            {([['top20', 'Top 20 Profit'], ['profitable', 'All Profitable'], ['tradeable', 'Tradeable'], ['all', 'All Items']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${filter === key ? 'bg-torn-green/20 text-torn-green font-medium' : 'text-text-muted hover:text-text-secondary'}`}>
                {label}
              </button>
            ))}
          </div>

          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="bg-bg-card border border-text-secondary/20 rounded-lg px-2 py-1 text-xs text-text-primary">
            <option value="">All types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Tax toggle */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-muted">Tax:</span>
            {[0, 2, 5, 10].map(t => (
              <button key={t} onClick={() => setTaxPct(t)}
                className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${taxPct === t ? 'bg-torn-yellow/20 text-torn-yellow font-medium' : 'text-text-muted hover:text-text-secondary'}`}>
                {t}%
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-text-muted">{displayItems.length} items shown{taxPct > 0 && ` (${taxPct}% tax applied)`}</p>
        {error && <ErrorBanner message={error} onRetry={loadData} />}

        {loading ? (
          <TableSkeleton rows={10} cols={7} />
        ) : error ? null : displayItems.length > 0 ? (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl overflow-hidden">
            <div className="md:hidden divide-y divide-border-light">
              {displayItems.slice(0, 80).map(item => {
                const netProfit = item.profit_buy_sell * (1 - taxPct / 100);
                const netMargin = item.buy_price > 0 ? (netProfit / item.buy_price) * 100 : 0;
                return (
                  <a
                    key={item.id}
                    href={`https://www.torn.com/imarket.php#/p=shop&step=shop&type=&searchname=${encodeURIComponent(item.name)}&ID=${item.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 hover:bg-bg-elevated/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary truncate">
                          {item.name}
                          {item.country_flag && <span className="ml-1.5">{item.country_flag}</span>}
                        </p>
                        <p className="text-xs text-text-muted">{item.type || 'Unknown type'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-semibold ${netProfit > 0 ? 'text-torn-green' : netProfit < 0 ? 'text-danger' : 'text-text-muted'}`}>
                          {netProfit !== 0 ? `${netProfit > 0 ? '+' : ''}${fmtMoney(netProfit)}` : '—'}
                        </p>
                        <p className="text-[10px] text-text-muted">{netMargin > 0 ? `${netMargin.toFixed(0)}% margin` : 'no margin'}</p>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div><span className="text-text-muted">Market</span><p>{fmtMoney(item.market_value)}</p></div>
                      <div><span className="text-text-muted">NPC Buy</span><p>{fmtMoney(item.buy_price)}</p></div>
                      <div><span className="text-text-muted">NPC Sell</span><p>{fmtMoney(item.sell_price)}</p></div>
                    </div>
                  </a>
                );
              })}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                    <SortableHeader label="Item" column="name" currentCol={sortCol} currentDir={sortDir} onSort={toggleSort} />
                    <th className="py-2 px-3">Type</th>
                    <SortableHeader label="Market" column="market_value" currentCol={sortCol} currentDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortableHeader label="NPC Buy" column="buy_price" currentCol={sortCol} currentDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortableHeader label="NPC Sell" column="sell_price" currentCol={sortCol} currentDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortableHeader label={`Profit${taxPct > 0 ? ' (net)' : ''}`} column="profit_buy_sell" currentCol={sortCol} currentDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortableHeader label="Margin" column="profit_margin_pct" currentCol={sortCol} currentDir={sortDir} onSort={toggleSort} className="text-right" />
                  </tr>
                </thead>
                <tbody>
                  {displayItems.slice(0, 200).map(item => {
                    const netProfit = item.profit_buy_sell * (1 - taxPct / 100);
                    const netMargin = item.buy_price > 0 ? (netProfit / item.buy_price) * 100 : 0;
                    return (
                      <tr key={item.id} className="border-b border-border-light hover:bg-bg-elevated/50 transition-colors">
                        <td className="py-1.5 px-3 font-medium text-text-primary">
                          <a href={`https://www.torn.com/imarket.php#/p=shop&step=shop&type=&searchname=${encodeURIComponent(item.name)}&ID=${item.id}`}
                            target="_blank" rel="noopener noreferrer" className="hover:text-torn-green transition-colors">
                            {item.name}
                          </a>
                          {item.country_flag ? (
                            <span className="ml-1.5 text-xs" title={`Available in ${item.country_name} — travel to buy`}>{item.country_flag}</span>
                          ) : item.is_shop ? (
                            <span className="ml-1.5 text-xs" title="Buyable in Torn shops">🛒</span>
                          ) : null}
                        </td>
                        <td className="py-1.5 px-3 text-text-muted text-xs">{item.type}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums">{fmtMoney(item.market_value)}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-text-secondary">{fmtMoney(item.buy_price)}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-text-secondary">{fmtMoney(item.sell_price)}</td>
                        <td className={`py-1.5 px-3 text-right tabular-nums font-medium ${netProfit > 0 ? 'text-torn-green' : netProfit < 0 ? 'text-danger' : 'text-text-muted'}`}>
                          {netProfit !== 0 ? `${netProfit > 0 ? '+' : ''}${fmtMoney(netProfit)}` : '—'}
                        </td>
                        <td className={`py-1.5 px-3 text-right tabular-nums text-xs ${netMargin > 0 ? 'text-torn-green' : 'text-text-muted'}`}>
                          {netMargin > 0 ? `${netMargin.toFixed(0)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {displayItems.length > 200 && (
              <p className="text-xs text-text-muted text-center py-2">Showing first 200 of {displayItems.length} items</p>
            )}
          </div>
        ) : (
          <div className="bg-bg-card border border-text-secondary/20 rounded-xl p-6 text-center text-text-secondary">
            No items match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
